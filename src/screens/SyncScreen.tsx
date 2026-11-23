import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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

/** A pending item enriched with per-item sync state. */
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

export function SyncScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, serviceAccount } = useSettings();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        days
      );

      // Preserve existing sync state for items we already know about.
      setItems((prev) => {
        const prevMap = new Map(prev.map((p) => [p.id, p]));
        return entries.map((entry) => {
          const id = makeId(entry);
          return (
            prevMap.get(id) ?? {
              id,
              entry,
              syncing: false,
              result: 'idle',
              resultMsg: '',
              dismissed: false,
            }
          );
        });
      });
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = (id: string) => {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, dismissed: true } : p))
    );
  };

  const syncOne = async (id: string) => {
    const item = items.find((p) => p.id === id);
    if (!item) return;

    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, syncing: true, result: 'idle', resultMsg: '' } : p
      )
    );

    try {
      // Build a single-entry settings slice for this item only.
      const singleEntry = item.entry;
      const report = await runSync(settings, serviceAccount, [singleEntry]);

      const written = report.written.find(
        (w) => w.day === singleEntry.day && w.rowLabel === singleEntry.rowLabel
      );
      const skipped = report.skipped.find(
        (s) => s.day === singleEntry.day && s.rowLabel === singleEntry.rowLabel
      );

      if (written) {
        setItems((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, syncing: false, result: 'ok', resultMsg: `Written to ${written.cell}` }
              : p
          )
        );
      } else {
        const reason = skipped?.reason ?? 'Unknown';
        setItems((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, syncing: false, result: 'error', resultMsg: reason }
              : p
          )
        );
      }
    } catch (e) {
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, syncing: false, result: 'error', resultMsg: errMsg(e) }
            : p
        )
      );
    }
  };

  const syncAll = async () => {
    const pending = items.filter((p) => !p.dismissed && p.result !== 'ok');
    for (const p of pending) {
      await syncOne(p.id);
    }
  };

  const visible = items.filter((p) => !p.dismissed);
  const anyPending = visible.some((p) => p.result !== 'ok');
  const isSyncingAny = visible.some((p) => p.syncing);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Sync</Text>
        {visible.length > 0 && (
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />}
      >
        {!serviceAccount && (
          <Card>
            <Text style={{ color: t.danger, fontWeight: '600' }}>No service account configured.</Text>
            <Text style={{ color: t.muted, marginTop: 4 }}>Go to Settings to add your Google credentials.</Text>
          </Card>
        )}

        {!settings.spreadsheetId && (
          <Card>
            <Text style={{ color: t.danger, fontWeight: '600' }}>No spreadsheet ID set.</Text>
            <Text style={{ color: t.muted, marginTop: 4 }}>Go to Settings to configure the target spreadsheet.</Text>
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

        {!loading && settings.selected.length > 0 && visible.length === 0 && (
          <Card>
            <Text style={{ color: t.muted }}>No pending items — all caught up!</Text>
          </Card>
        )}

        {visible.map((item) => {
          const { entry, syncing, result, resultMsg } = item;
          const statusColor =
            result === 'ok' ? t.ok : result === 'error' ? t.danger : t.muted;

          return (
            <Card key={item.id}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                    {entry.rowLabel}
                  </Text>
                  {entry.apps.length > 1 && (
                    <Text style={{ color: t.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                      {entry.apps.join(' + ')}
                    </Text>
                  )}
                  <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
                    {entry.day} · {entry.minutes} min
                  </Text>
                </View>

                <View style={styles.actions}>
                  {syncing ? (
                    <ActivityIndicator color={t.primary} style={{ marginRight: 8 }} />
                  ) : (
                    <Button
                      title={result === 'ok' ? '✓ Done' : 'Sync'}
                      onPress={() => syncOne(item.id)}
                      disabled={!serviceAccount || syncing || result === 'ok'}
                      variant={result === 'ok' ? 'secondary' : 'primary'}
                      style={{ minHeight: 36, paddingVertical: 6, paddingHorizontal: 14 }}
                    />
                  )}
                  <Pressable onPress={() => dismiss(item.id)} hitSlop={10} style={{ marginLeft: 8 }}>
                    <Text style={{ color: t.muted, fontSize: 20, lineHeight: 24 }}>✕</Text>
                  </Pressable>
                </View>
              </View>

              {(result === 'ok' || result === 'error') && (
                <Text style={{ color: statusColor, fontSize: 12, marginTop: 6 }}>{resultMsg}</Text>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

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
});
