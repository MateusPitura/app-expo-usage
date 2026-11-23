import type { DayKey, HourlyByDay, SyncEntry, SyncReport } from './types';

/**
 * Sheet layout this app understands (matches the Habit Tracker workbook):
 *
 *   column B : month header rows ("Janeiro", "Fevereiro", ...) followed by the
 *              habit rows of that month ("Duolingo", "Corrida", ...)
 *   C..AG    : day 1..31 (day N lives in column C + N - 1), values in MINUTES
 */
export const NAME_COLUMN = 'B';
export const FIRST_DAY_COLUMN_INDEX = 2; // C (zero based)
/** Gray used for synced values (Google Sheets color components are 0..1). */
export const SYNC_FONT_COLOR = { red: 0.5, green: 0.5, blue: 0.5 };

export const DEFAULT_MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Case/accent/whitespace-insensitive key: "Inglês " -> "ingles". */
export function norm(s: string | undefined | null): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Extracts the ID from a full spreadsheet URL, or returns the input trimmed. */
export function extractSpreadsheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (m ? m[1] : input).trim();
}

export function resolveTabName(template: string, year: number): string {
  return template.replace(/\{year\}/gi, String(year)).trim();
}

/** A1 sheet reference quoting: 2026 -> '2026', O'Brien -> 'O''Brien' */
export function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Locating rows
// ---------------------------------------------------------------------------

export interface MonthBlock {
  /** 1-based row of the month header */
  header: number;
  /** 1-based row after the last row of the block */
  end: number;
}

/**
 * `colB[i]` is the text of column B on row i+1 (Google trims trailing empties).
 * Finds the month header and the extent of its block (up to the next month header).
 */
export function findMonthBlock(colB: string[], monthNames: string[], month0: number): MonthBlock | null {
  const names = monthNames.map(norm);
  const target = names[month0];
  if (!target) return null;
  const isHeader = (v: string) => names.includes(norm(v));

  let header = -1;
  for (let i = 0; i < colB.length; i++) {
    if (norm(colB[i]) === target) {
      header = i + 1;
      break;
    }
  }
  if (header < 0) return null;

  let end = colB.length + 1;
  for (let i = header; i < colB.length; i++) {
    if (isHeader(colB[i])) {
      end = i + 1;
      break;
    }
  }
  return { header, end };
}

/** 1-based row of `label` inside the month block, or null. */
export function findRowInBlock(colB: string[], block: MonthBlock, label: string): number | null {
  const target = norm(label);
  if (!target) return null;
  for (let row = block.header + 1; row < block.end; row++) {
    if (norm(colB[row - 1]) === target) return row;
  }
  return null;
}

/** A1 address of the cell for `row` and 1-based `dayOfMonth`. */
export function dayCell(row: number, dayOfMonth: number): string {
  return `${columnLetter(FIRST_DAY_COLUMN_INDEX + dayOfMonth - 1)}${row}`;
}

// ---------------------------------------------------------------------------
// Turning usage into sheet entries
// ---------------------------------------------------------------------------

/**
 * One entry per (day, sheet row). Apps that share a row label (e.g. Instagram +
 * X -> "Redes sociais") are summed. Rows with less than one minute are omitted:
 * writing 0 could overwrite real data when the OS no longer holds that day.
 */
export function buildEntries(
  hourlyByDay: HourlyByDay,
  selected: string[],
  aliases: Record<string, string>,
  labels: Record<string, string>,
  days: DayKey[]
): SyncEntry[] {
  const entries: SyncEntry[] = [];
  for (const day of days) {
    const perApp = hourlyByDay[day] ?? {};
    const groups = new Map<string, { label: string; ms: number; apps: string[] }>();
    for (const pkg of selected) {
      const hours = perApp[pkg];
      const ms = hours ? hours.reduce((a, b) => a + b, 0) : 0;
      const appName = labels[pkg] ?? pkg;
      const rowLabel = (aliases[pkg] ?? '').trim() || appName;
      const key = norm(rowLabel);
      const g = groups.get(key) ?? { label: rowLabel, ms: 0, apps: [] };
      g.ms += ms;
      g.apps.push(appName);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const minutes = Math.round(g.ms / 60_000);
      if (minutes >= 1) entries.push({ day, rowLabel: g.label, minutes, apps: g.apps });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Sync orchestration (storage-agnostic: talks to an injected SheetsClient)
// ---------------------------------------------------------------------------

export interface SheetsClient {
  getMeta(spreadsheetId: string): Promise<{ title: string; sheets: { sheetId: number; title: string }[] }>;
  /** Text of column B for the whole tab; index i = row i+1. */
  getNameColumn(spreadsheetId: string, tab: string): Promise<string[]>;
  /** Raw contents (formulas as "=...") of single cells, same order as `cells`. */
  getCellContents(spreadsheetId: string, tab: string, cells: string[]): Promise<string[]>;
  batchUpdate(spreadsheetId: string, requests: object[]): Promise<void>;
}

export interface SyncConfig {
  spreadsheetId: string;
  tabTemplate: string;
  monthNames: string[];
}

export async function syncEntries(
  client: SheetsClient,
  cfg: SyncConfig,
  entries: SyncEntry[]
): Promise<SyncReport> {
  const report: SyncReport = { written: [], skipped: [] };
  if (entries.length === 0) return report;

  const meta = await client.getMeta(cfg.spreadsheetId);

  // Group by tab (one tab per year).
  const byTab = new Map<string, SyncEntry[]>();
  for (const e of entries) {
    const year = Number(e.day.slice(0, 4));
    const tab = resolveTabName(cfg.tabTemplate, year);
    byTab.set(tab, [...(byTab.get(tab) ?? []), e]);
  }

  const requests: object[] = [];
  const pending: SyncReport['written'] = [];

  for (const [tabName, tabEntries] of byTab) {
    const sheet = meta.sheets.find((s) => norm(s.title) === norm(tabName));
    if (!sheet) {
      for (const e of tabEntries) {
        report.skipped.push({ day: e.day, rowLabel: e.rowLabel, reason: `Tab "${tabName}" not found` });
      }
      continue;
    }

    const colB = await client.getNameColumn(cfg.spreadsheetId, sheet.title);

    // Resolve every entry to a concrete cell.
    const targets: { entry: SyncEntry; row: number; cell: string }[] = [];
    for (const e of tabEntries) {
      const [, m, d] = e.day.split('-').map(Number);
      const block = findMonthBlock(colB, cfg.monthNames, m - 1);
      if (!block) {
        report.skipped.push({
          day: e.day,
          rowLabel: e.rowLabel,
          reason: `Month "${cfg.monthNames[m - 1]}" not found in column ${NAME_COLUMN}`,
        });
        continue;
      }
      const row = findRowInBlock(colB, block, e.rowLabel);
      if (!row) {
        report.skipped.push({
          day: e.day,
          rowLabel: e.rowLabel,
          reason: `No row "${e.rowLabel}" under ${cfg.monthNames[m - 1]}`,
        });
        continue;
      }
      targets.push({ entry: e, row, cell: dayCell(row, d) });
    }
    if (targets.length === 0) continue;

    // Never overwrite formulas (e.g. category rows that SUM their children).
    const existing = await client.getCellContents(
      cfg.spreadsheetId,
      sheet.title,
      targets.map((t) => t.cell)
    );
    targets.forEach((t, i) => {
      if ((existing[i] ?? '').trim().startsWith('=')) {
        report.skipped.push({
          day: t.entry.day,
          rowLabel: t.entry.rowLabel,
          reason: `Cell ${t.cell} contains a formula`,
        });
        return;
      }
      const colIndex = FIRST_DAY_COLUMN_INDEX + Number(t.entry.day.slice(8, 10)) - 1;
      requests.push({
        updateCells: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: t.row - 1,
            endRowIndex: t.row,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: { numberValue: t.entry.minutes },
                  userEnteredFormat: { textFormat: { foregroundColor: SYNC_FONT_COLOR } },
                },
              ],
            },
          ],
          // Only touch the value and the font color; keep fill, borders, alignment...
          fields: 'userEnteredValue,userEnteredFormat.textFormat.foregroundColor',
        },
      });
      pending.push({ day: t.entry.day, rowLabel: t.entry.rowLabel, minutes: t.entry.minutes, cell: t.cell });
    });
  }

  if (requests.length > 0) {
    await client.batchUpdate(cfg.spreadsheetId, requests);
    report.written.push(...pending);
  }
  return report;
}

export interface ConnectionCheck {
  title: string;
  tabName: string;
  tabFound: boolean;
  monthHeaderRow: number | null;
}

/** Validates credentials + spreadsheet + tab + current month header. */
export async function checkConnection(
  client: SheetsClient,
  cfg: SyncConfig,
  now: Date = new Date()
): Promise<ConnectionCheck> {
  const meta = await client.getMeta(cfg.spreadsheetId);
  const tabName = resolveTabName(cfg.tabTemplate, now.getFullYear());
  const sheet = meta.sheets.find((s) => norm(s.title) === norm(tabName));
  if (!sheet) return { title: meta.title, tabName, tabFound: false, monthHeaderRow: null };
  const colB = await client.getNameColumn(cfg.spreadsheetId, sheet.title);
  const block = findMonthBlock(colB, cfg.monthNames, now.getMonth());
  return { title: meta.title, tabName: sheet.title, tabFound: true, monthHeaderRow: block?.header ?? null };
}
