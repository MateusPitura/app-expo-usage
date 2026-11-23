/** A continuous foreground period of one app (epoch milliseconds). */
export interface Session {
  packageName: string;
  start: number;
  end: number;
}

/** "YYYY-MM-DD" in the device's local time zone. */
export type DayKey = string;

/** day -> package -> milliseconds of use in each of the 24 local hours. */
export type HourlyByDay = Record<DayKey, Record<string, number[]>>;

export interface AppSettings {
  /** Spreadsheet ID (the URL form is accepted too and normalised on save). */
  spreadsheetId: string;
  /** Tab name; "{year}" is replaced by the year of the day being synced. */
  tabTemplate: string;
  /** The 12 month names exactly as they appear in column B of the sheet. */
  /** How many days (today included) a sync covers. 1-7. */
  daysBack: number;
  monthNames: string[];
  /** Package names the user filtered on. */
  selected: string[];
  /** package -> row label in the sheet (defaults to the app's name). */
  aliases: Record<string, string>;
  /** package -> app name cache, so selected apps keep their name. */
  labels: Record<string, string>;
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface SyncEntry {
  day: DayKey;
  rowLabel: string;
  minutes: number;
  /** names of the apps merged into this row */
  apps: string[];
}

export interface SyncReport {
  written: { day: DayKey; rowLabel: string; minutes: number; cell: string }[];
  skipped: { day: DayKey; rowLabel: string; reason: string }[];
}
