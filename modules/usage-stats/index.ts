import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

/** A continuous foreground period of one app. Timestamps are epoch milliseconds. */
export interface NativeSession {
  packageName: string;
  start: number;
  end: number;
}

export interface SessionResult {
  sessions: NativeSession[];
  /** package name -> display label */
  labels: Record<string, string>;
}

export interface InstalledApp {
  packageName: string;
  label: string;
}

interface UsageStatsNative {
  hasPermission(): boolean;
  openUsageAccessSettings(): void;
  getInstalledApps(): Promise<InstalledApp[]>;
  getSessions(startMs: number, endMs: number): Promise<SessionResult>;
}

let native: UsageStatsNative | null = null;
let loadError: string | null = null;

if (Platform.OS === 'android') {
  try {
    native = requireNativeModule<UsageStatsNative>('UsageStats');
  } catch (e) {
    loadError =
      'The native UsageStats module is not available. This app cannot run in Expo Go: ' +
      'build a development build with "npx expo run:android".';
  }
} else {
  loadError = 'App usage data is only available on Android.';
}

export const isAvailable = native !== null;
export const unavailableReason = loadError;

export function hasPermission(): boolean {
  return native ? native.hasPermission() : false;
}

export function openUsageAccessSettings(): void {
  native?.openUsageAccessSettings();
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  return native ? native.getInstalledApps() : [];
}

export async function getSessions(startMs: number, endMs: number): Promise<SessionResult> {
  if (!native) return { sessions: [], labels: {} };
  return native.getSessions(startMs, endMs);
}
