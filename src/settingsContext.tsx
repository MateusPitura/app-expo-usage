import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { parseServiceAccount, clearTokenCache } from './lib/googleAuth';
import {
  DEFAULT_SETTINGS,
  clearServiceAccount,
  loadServiceAccount,
  loadSettings,
  saveServiceAccount,
  saveSettings,
} from './lib/storage';
import type { AppSettings, ServiceAccount } from './lib/types';

interface Ctx {
  ready: boolean;
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  serviceAccount: ServiceAccount | null;
  /** Throws a readable Error when the JSON is invalid. */
  setServiceAccountFromJson: (json: string) => Promise<ServiceAccount>;
  removeServiceAccount: () => Promise<void>;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccount | null>(null);

  useEffect(() => {
    (async () => {
      const [s, sa] = await Promise.all([loadSettings(), loadServiceAccount()]);
      setSettings(s);
      setServiceAccount(sa);
      setReady(true);
    })();
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const setServiceAccountFromJson = useCallback(async (json: string) => {
    const sa = parseServiceAccount(json);
    await saveServiceAccount(sa);
    clearTokenCache();
    setServiceAccount(sa);
    return sa;
  }, []);

  const removeServiceAccount = useCallback(async () => {
    await clearServiceAccount();
    clearTokenCache();
    setServiceAccount(null);
  }, []);

  const value = useMemo(
    () => ({ ready, settings, update, serviceAccount, setServiceAccountFromJson, removeServiceAccount }),
    [ready, settings, update, serviceAccount, setServiceAccountFromJson, removeServiceAccount]
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
