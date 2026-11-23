import type { DayKey, HourlyByDay, Session } from './types';

const HOUR_MS = 3_600_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local "YYYY-MM-DD" for an epoch-ms timestamp. */
export function dayKey(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: DayKey): { year: number; month0: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month0: m - 1, day: d };
}

/** Local midnight at the start of the given day. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of the following day (DST safe). */
export function startOfNextDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

function startOfNextHour(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime() + HOUR_MS;
}

/**
 * Split foreground sessions into per-day, per-app, per-local-hour milliseconds.
 * A session that crosses an hour (or midnight) boundary is divided accordingly.
 */
export function bucketSessions(sessions: Session[]): HourlyByDay {
  const out: HourlyByDay = {};
  for (const s of sessions) {
    let cursor = s.start;
    while (cursor < s.end) {
      const next = Math.min(startOfNextHour(cursor), s.end);
      const d = new Date(cursor);
      const key = dayKey(cursor);
      const perApp = (out[key] ??= {});
      const hours = (perApp[s.packageName] ??= new Array(24).fill(0));
      hours[d.getHours()] += next - cursor;
      cursor = next;
    }
  }
  return out;
}

export function totalMs(hours: number[] | undefined): number {
  if (!hours) return 0;
  let t = 0;
  for (const h of hours) t += h;
  return t;
}

/** "1h 23m", "45m", "<1m" */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
