import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_MONTH_NAMES } from './sheets';
import type { AppSettings, ServiceAccount } from './types';

const SETTINGS_KEY = 'usage-sync.settings.v1';
// SecureStore keys: alphanumerics, ".", "-" and "_" only.
const SA_EMAIL_KEY = 'usage-sync.sa.client_email';
const SA_KEY_KEY = 'usage-sync.sa.private_key';

export const DEFAULT_SETTINGS: AppSettings = {
  spreadsheetId: '',
  tabTemplate: '{year}',
  monthNames: DEFAULT_MONTH_NAMES,
  daysBack: 2,
  selected: [],
  aliases: {},
  labels: {},
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const monthNames =
      Array.isArray(parsed.monthNames) && parsed.monthNames.length === 12
        ? parsed.monthNames
        : DEFAULT_MONTH_NAMES;
    return { ...DEFAULT_SETTINGS, ...parsed, monthNames };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** The private key lives in the Android Keystore-backed SecureStore, never in AsyncStorage. */
export async function loadServiceAccount(): Promise<ServiceAccount | null> {
  try {
    const [email, key] = await Promise.all([
      SecureStore.getItemAsync(SA_EMAIL_KEY),
      SecureStore.getItemAsync(SA_KEY_KEY),
    ]);
    return email && key ? { client_email: email, private_key: key } : null;
  } catch {
    return null;
  }
}

export async function saveServiceAccount(sa: ServiceAccount): Promise<void> {
  await SecureStore.setItemAsync(SA_EMAIL_KEY, sa.client_email);
  await SecureStore.setItemAsync(SA_KEY_KEY, sa.private_key);
}

export async function clearServiceAccount(): Promise<void> {
  await SecureStore.deleteItemAsync(SA_EMAIL_KEY);
  await SecureStore.deleteItemAsync(SA_KEY_KEY);
}
