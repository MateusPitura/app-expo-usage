import { getSessions } from '../../modules/usage-stats';
import { getAccessToken } from './googleAuth';
import { signRs256 } from './jwtSigner';
import { buildEntries, checkConnection, syncEntries } from './sheets';
import type { ConnectionCheck } from './sheets';
import { createSheetsClient } from './sheetsApi';
import { bucketSessions, dayKey, startOfDay } from './usage';
import type { AppSettings, ServiceAccount, SyncEntry, SyncReport } from './types';

function clientFor(sa: ServiceAccount) {
  return createSheetsClient({
    fetch,
    serviceAccountEmail: sa.client_email,
    getToken: () => getAccessToken(sa, { fetch, sign: signRs256 }),
  });
}

function requireSetup(settings: AppSettings, sa: ServiceAccount | null): ServiceAccount {
  if (!sa) throw new Error('Add your Google service-account credentials in Settings first.');
  if (!settings.spreadsheetId) throw new Error('Set the Google spreadsheet ID in Settings first.');
  return sa;
}

/** Reads usage for the last `daysBack` days and writes the selected apps' totals into the sheet. */
export async function runSync(settings: AppSettings, sa: ServiceAccount | null): Promise<SyncReport>;
/** Syncs a pre-built list of entries (used by SyncScreen for per-item sync). */
export async function runSync(settings: AppSettings, sa: ServiceAccount | null, entries: SyncEntry[]): Promise<SyncReport>;
export async function runSync(settings: AppSettings, sa: ServiceAccount | null, prebuilt?: SyncEntry[]): Promise<SyncReport> {
  const account = requireSetup(settings, sa);

  let entries: SyncEntry[];
  if (prebuilt) {
    entries = prebuilt;
  } else {
    if (settings.selected.length === 0) throw new Error('Select at least one app to sync.');
    const now = Date.now();
    const days: string[] = [];
    const first = new Date(startOfDay(now));
    first.setDate(first.getDate() - (settings.daysBack - 1));
    for (let i = 0; i < settings.daysBack; i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      days.push(dayKey(d.getTime()));
    }
    const { sessions, labels } = await getSessions(first.getTime(), now);
    const hourly = bucketSessions(sessions);
    entries = buildEntries(hourly, settings.selected, settings.aliases, { ...labels, ...settings.labels }, days);
    if (entries.length === 0) {
      return { written: [], skipped: [{ day: days[days.length - 1], rowLabel: '-', reason: 'No recorded usage for the selected apps' }] };
    }
  }

  return syncEntries(
    clientFor(account),
    { spreadsheetId: settings.spreadsheetId, tabTemplate: settings.tabTemplate, monthNames: settings.monthNames },
    entries
  );
}

export async function runConnectionCheck(
  settings: AppSettings,
  sa: ServiceAccount | null
): Promise<ConnectionCheck> {
  const account = requireSetup(settings, sa);
  return checkConnection(clientFor(account), {
    spreadsheetId: settings.spreadsheetId,
    tabTemplate: settings.tabTemplate,
    monthNames: settings.monthNames,
  });
}
