import { NAME_COLUMN, quoteSheet } from './sheets.ts';
import type { SheetsClient } from './sheets.ts';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface ApiDeps {
  fetch: typeof fetch;
  getToken: () => Promise<string>;
  /** shown in permission hints */
  serviceAccountEmail: string;
}

/** SheetsClient backed by the Google Sheets v4 REST API (no Node-only libraries needed). */
export function createSheetsClient(deps: ApiDeps): SheetsClient {
  async function call(method: 'GET' | 'POST', url: string, body?: unknown): Promise<any> {
    const token = await deps.getToken();
    const res = await deps.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const msg: string = json?.error?.message ?? text.slice(0, 200);
      let hint = '';
      if (res.status === 403 || res.status === 404) {
        hint = ` Check the spreadsheet ID and that the sheet is shared (Editor) with ${deps.serviceAccountEmail}, and that the Google Sheets API is enabled for the project.`;
      }
      throw new Error(`Google Sheets API ${res.status}: ${msg}.${hint}`);
    }
    return json;
  }

  return {
    async getMeta(id) {
      const j = await call(
        'GET',
        `${BASE}/${id}?fields=${encodeURIComponent('properties.title,sheets.properties(sheetId,title)')}`
      );
      return {
        title: j.properties?.title ?? '',
        sheets: (j.sheets ?? []).map((s: any) => ({ sheetId: s.properties.sheetId, title: s.properties.title })),
      };
    },

    async getNameColumn(id, tab) {
      const range = `${quoteSheet(tab)}!${NAME_COLUMN}:${NAME_COLUMN}`;
      const j = await call(
        'GET',
        `${BASE}/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
      );
      // Each row is [] (empty cell) or [text]; trailing empties are omitted.
      return (j.values ?? []).map((r: unknown[]) => (r && r.length ? String(r[0]) : ''));
    },

    async getCellContents(id, tab, cells) {
      if (cells.length === 0) return [];
      const params = cells
        .map((c) => `ranges=${encodeURIComponent(`${quoteSheet(tab)}!${c}`)}`)
        .join('&');
      const j = await call('GET', `${BASE}/${id}/values:batchGet?${params}&valueRenderOption=FORMULA`);
      return (j.valueRanges ?? []).map((vr: any) => {
        const v = vr?.values?.[0]?.[0];
        return v === undefined || v === null ? '' : String(v);
      });
    },

    async batchUpdate(id, requests) {
      await call('POST', `${BASE}/${id}:batchUpdate`, { requests });
    },
  };
}
