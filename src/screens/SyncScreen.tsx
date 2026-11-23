import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSessions } from '../../modules/usage-stats';
import { Button, Card } from '../components/ui';
import { buildEntries } from '../lib/sheets';
import { runSync } from '../lib/syncRunner';
import type { SyncEntry } from '../lib/types';
import { bucketSessions, dayKey, startOfDay } from '../lib/usage';
import { useSettings } from '../settingsContext';
import { useTheme } from '../theme';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Persistence — a single AsyncStorage key holds a map of id -> saved state.
// We keep an in-memory cache (ref) so concurrent writes never clobber each
// other with stale data read from storage.
// ---------------------------------------------------------------------------

const SYNC_STATE_KEY = 'usage-sync.item-state.v2';

interface PersistedItemState {
  result: 'ok' | 'error' | 'idle';
  resultMsg: string;
  dismissed: boolean;
}

type PersistedMap = Record<string, PersistedItemState>;

async function readPersistedMap(): Promise<PersistedMap> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedMap) : {};
  } catch {
    return {};
  }
}

async function writePersistedMap(map: PersistedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNC_STATE_KEY, JSON.stringify(map));
  } catch {}
}

// ---------------------------------------------------------------------------
// In-memory item shape
// ---------------------------------------------------------------------------

interface PendingItem {
  id: string; // `${day}::${rowLabel}`
  entry: SyncEntry;
  syncing: boolean;
  result: 'idle' | 'ok' | 'error';
  resultMsg: string;
  dismissed: boolean;
}

function makeId(e: SyncEntry) {
  return `${e.day}::${e.rowLabel}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDayHeader(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${day}`;
}

function isToday(key: string): boolean {
  return key === dayKey(Date.now());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, serviceAccount } = useSettings();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * In-memory cache of the persisted map.  Loaded once on mount; every
   * mutation updates this ref AND flushes to AsyncStorage atomically.
   */
  const persistedRef = useRef<PersistedMap | null>(null);

  /** Get the cache, loading from storage the first time. */
  const getCache = useCallback(async (): Promise<PersistedMap> => {
    if (persistedRef.current === null) {
      persistedRef.current = await readPersistedMap();
    }
    return persistedRef.current;
  }, []);

  /** Update one entry in the cache and flush. */
  const saveItemState = useCallback(
    async (id: string, patch: Partial<PersistedItemState>) => {
      const map = await getCache();
      const existing: PersistedItemState = map[id] ?? { result: 'idle', resultMsg: '', dismissed: false };
      map[id] = { ...existing, ...patch };
      await writePersistedMap(map);
    },
    [getCache],
  );

  /** Remove one entry from the cache and flush. */
  const deleteItemState = useCallback(
    async (id: string) => {
      const map = await getCache();
      delete map[id];
      await writePersistedMap(map);
    },
    [getCache],
  );

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    if (settings.selected.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const now = Date.now();
      const first = new Date(startOfDay(now));
      first.setDate(first.getDate() - (settings.daysBack - 1));
      const days: string[] = [];
      for (let i = 0; i < settings.daysBack; i++) {
        const d = new Date(first);
        d.setDate(first.getDate() + i);
        days.push(dayKey(d.getTime()));
      }

      const { sessions, labels } = await getSessions(first.getTime(), now);
      const hourly = bucketSessions(sessions);
      const entries = buildEntries(
        hourly,
        settings.selected,
        settings.aliases,
        { ...labels, ...settings.labels },
        days,
      );

      // Ensure the cache is populated before merging.
      const persisted = await getCache();

      setItems((prev) => {
        const prevMap = new Map(prev.map((p) => [p.id, p]));
        return entries.map((entry) => {
          const id = makeId(entry);
          // Prefer existing in-memory item (has live syncing state).
          if (prevMap.has(id)) return { ...prevMap.get(id)!, entry };
          // Fall back to persisted state for items we haven't seen yet.
          const saved = persisted[id];
          return {
            id,
            entry,
            syncing: false,
            result: saved?.result ?? 'idle',
            resultMsg: saved?.resultMsg ?? '',
            dismissed: saved?.dismissed ?? false,
          };
        });
      });
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [settings, getCache]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const dismiss = useCallback(
    (id: string) => {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, dismissed: true } : p)));
      saveItemState(id, { dismissed: true });
    },
    [saveItemState],
  );

  const undoDismiss = useCallback(
    (id: string) => {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, dismissed: false } : p)));
      saveItemState(id, { dismissed: false });
    },
    [saveItemState],
  );

  const undoSync = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, result: 'idle', resultMsg: '', dismissed: false } : p,
        ),
      );
      deleteItemState(id);
    },
    [deleteItemState],
  );

  const syncOne = useCallback(
    async (id: string) => {
      const item = items.find((p) => p.id === id);
      if (!item) return;

      setItems((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, syncing: true, result: 'idle', resultMsg: '' } : p,
        ),
      );

      try {
        const singleEntry = item.entry;
        const report = await runSync(settings, serviceAccount, [singleEntry]);

        const written = report.written.find(
          (w) => w.day === singleEntry.day && w.rowLabel === singleEntry.rowLabel,
        );
        const skipped = report.skipped.find(
          (s) => s.day === singleEntry.day && s.rowLabel === singleEntry.rowLabel,
        );

        if (written) {
          const patch: PersistedItemState = {
            result: 'ok',
            resultMsg: `Written to ${written.cell}`,
            dismissed: false,
          };
          await saveItemState(id, patch);
          setItems((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, syncing: false, ...patch } : p,
            ),
          );
        } else {
          const patch: PersistedItemState = {
            result: 'error',
            resultMsg: skipped?.reason ?? 'Unknown',
            dismissed: false,
          };
          await saveItemState(id, patch);
          setItems((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, syncing: false, ...patch } : p,
            ),
          );
        }
      } catch (e) {
        const patch: PersistedItemState = {
          result: 'error',
          resultMsg: errMsg(e),
          dismissed: false,
        };
        await saveItemState(id, patch);
        setItems((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, syncing: false, ...patch } : p,
          ),
        );
      }
    },
    [items, settings, serviceAccount, saveItemState],
  );

  const syncAll = useCallback(async () => {
    const pending = items.filter((p) => !p.dismissed && p.result !== 'ok');
    for (const p of pending) {
      await syncOne(p.id);
    }
  }, [items, syncOne]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const anyPending = items.some((p) => !p.dismissed && p.result !== 'ok');
  const isSyncingAny = items.some((p) => p.syncing);
  const hasVisible = items.length > 0;

  // Group ALL items (including dismissed) by day — dismissed ones show with muted style.
  const groups: { day: string; items: PendingItem[] }[] = [];
  for (const item of items) {
    const day = item.entry.day;
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(item);
    } else {
      groups.push({ day, items: [item] });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Sync</Text>
        {hasVisible && (
          <Button
            title="Sync all"
            onPress={syncAll}
            loading={isSyncingAny}
            disabled={!serviceAccount || !anyPending || isSyncingAny}
            style={{ minHeight: 40, paddingVertical: 8 }}
          />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />
        }
      >
        {!serviceAccount && (
          <Card>
            <Text style={{ color: t.danger, fontWeight: '600' }}>No service account configured.</Text>
            <Text style={{ color: t.muted, marginTop: 4 }}>
              Go to Settings to add your Google credentials.
            </Text>
          </Card>
        )}

        {!settings.spreadsheetId && (
          <Card>
            <Text style={{ color: t.danger, fontWeight: '600' }}>No spreadsheet ID set.</Text>
            <Text style={{ color: t.muted, marginTop: 4 }}>
              Go to Settings to configure the target spreadsheet.
            </Text>
          </Card>
        )}

        {loadError && (
          <Card>
            <Text style={{ color: t.danger }}>{loadError}</Text>
          </Card>
        )}

        {!loading && settings.selected.length === 0 && (
          <Card>
            <Text style={{ color: t.muted }}>No apps selected. Pick apps in the Apps tab first.</Text>
          </Card>
        )}

        {!loading && settings.selected.length > 0 && items.length === 0 && (
          <Card>
            <Text style={{ color: t.muted }}>No pending items — all caught up!</Text>
          </Card>
        )}

        {groups.map(({ day, items: dayItems }) => (
          <View key={day}>
            {/* ── Day header ── */}
            <View style={styles.dayHeader}>
              <Text style={[styles.dayLabel, { color: t.text }]}>{formatDayHeader(day)}</Text>
              {isToday(day) && (
                <View style={[styles.todayBadge, { backgroundColor: t.primary }]}>
                  <Text style={[styles.todayBadgeText, { color: t.primaryText }]}>Today</Text>
                </View>
              )}
            </View>

            {dayItems.map((item) => {
              const { entry, syncing, result, resultMsg, dismissed } = item;
              const isSynced = result === 'ok';
              const statusColor =
                result === 'ok' ? t.ok : result === 'error' ? t.danger : t.muted;

              return (
                <Card key={item.id} style={dismissed ? { opacity: 0.45 } : undefined}>
                  <View style={styles.row}>
                    {/* ── Left: app info ── */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          { fontWeight: '700', fontSize: 15 },
                          dismissed
                            ? { color: t.muted, textDecorationLine: 'line-through' }
                            : { color: t.text },
                        ]}
                        numberOfLines={1}
                      >
                        {entry.rowLabel}
                      </Text>
                      {entry.apps.length > 1 && (
                        <Text
                          style={{ color: t.muted, fontSize: 11, marginTop: 1 }}
                          numberOfLines={1}
                        >
                          {entry.apps.join(' + ')}
                        </Text>
                      )}
                      <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
                        {entry.minutes} min
                      </Text>
                    </View>

                    {/* ── Right: actions ── */}
                    <View style={styles.actions}>
                      {dismissed ? (
                        /* Dismissed state: greyed out + Undo button */
                        <Pressable
                          onPress={() => undoDismiss(item.id)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.ghostBtn,
                            { borderColor: t.border, opacity: pressed ? 0.5 : 1 },
                          ]}
                        >
                          <Text style={{ color: t.muted, fontSize: 12 }}>Undo</Text>
                        </Pressable>
                      ) : syncing ? (
                        <ActivityIndicator color={t.primary} style={{ marginRight: 8 }} />
                      ) : isSynced ? (
                        /* Synced: check label + Undo sync button (no dismiss ✕) */
                        <>
                          <Text
                            style={{ color: t.ok, fontSize: 13, fontWeight: '700', marginRight: 8 }}
                          >
                            ✓ Synced
                          </Text>
                          <Pressable
                            onPress={() => undoSync(item.id)}
                            hitSlop={10}
                            style={({ pressed }) => [
                              styles.ghostBtn,
                              { borderColor: t.border, opacity: pressed ? 0.5 : 1 },
                            ]}
                          >
                            <Text style={{ color: t.muted, fontSize: 12 }}>Undo</Text>
                          </Pressable>
                        </>
                      ) : (
                        /* Idle / error: Sync button + dismiss ✕ */
                        <>
                          <Button
                            title="Sync"
                            onPress={() => syncOne(item.id)}
                            disabled={!serviceAccount || syncing}
                            variant="primary"
                            style={{ minHeight: 36, paddingVertical: 6, paddingHorizontal: 14 }}
                          />
                          <Pressable
                            onPress={() => dismiss(item.id)}
                            hitSlop={10}
                            style={{ marginLeft: 8 }}
                          >
                            <Text style={{ color: t.muted, fontSize: 20, lineHeight: 24 }}>✕</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>

                  {!dismissed && (result === 'ok' || result === 'error') && (
                    <Text style={{ color: statusColor, fontSize: 12, marginTop: 6 }}>
                      {resultMsg}
                    </Text>
                  )}
                </Card>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 26, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
    gap: 8,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  todayBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
