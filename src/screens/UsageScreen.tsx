import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getInstalledApps,
  getSessions,
  hasPermission,
  isAvailable,
  openUsageAccessSettings,
  unavailableReason,
} from '../../modules/usage-stats';
import type { InstalledApp } from '../../modules/usage-stats';
import { AppPickerModal } from '../components/AppPickerModal';
import { HourlyChart } from '../components/HourlyChart';
import { Button, Card, Label } from '../components/ui';
import { bucketSessions, dayKey, formatDuration, startOfDay, startOfNextDay, totalMs } from '../lib/usage';
import { useSettings } from '../settingsContext';
import { useTheme } from '../theme';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function UsageScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const [date, setDate] = useState(() => startOfDay(Date.now()));
  const [permitted, setPermitted] = useState(() => hasPermission());
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [hourly, setHourly] = useState<Record<string, number[]>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isToday = date === startOfDay(Date.now());

  const load = useCallback(async () => {
    if (!isAvailable) return;
    const ok = hasPermission();
    setPermitted(ok);
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const { sessions, labels: l } = await getSessions(date, startOfNextDay(date));
      setHourly(bucketSessions(sessions)[dayKey(date)] ?? {});
      setLabels(l);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getInstalledApps().then(setApps).catch(() => {});
  }, []);

  // Re-check when coming back from the system "Usage access" screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  // Keep today's numbers fresh while the screen is open.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [isToday, load]);

  const nameOf = useCallback(
    (pkg: string) => settings.labels[pkg] ?? labels[pkg] ?? apps.find((a) => a.packageName === pkg)?.label ?? pkg,
    [settings.labels, labels, apps]
  );

  const usageMs = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [pkg, hours] of Object.entries(hourly)) m[pkg] = totalMs(hours);
    return m;
  }, [hourly]);

  const toggleApp = (app: InstalledApp) => {
    const on = settings.selected.includes(app.packageName);
    update({
      selected: on ? settings.selected.filter((p) => p !== app.packageName) : [...settings.selected, app.packageName],
      labels: { ...settings.labels, [app.packageName]: app.label },
    });
  };

  const topApps = useMemo(
    () =>
      apps
        .filter((a) => (usageMs[a.packageName] ?? 0) > 0)
        .sort((a, b) => usageMs[b.packageName] - usageMs[a.packageName])
        .slice(0, 8),
    [apps, usageMs]
  );

  const shiftDay = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(startOfDay(d.getTime()));
  };

  const dateLabel = new Date(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <Text style={[styles.title, { color: t.text, paddingHorizontal: 16, paddingVertical: 10 }]}>Apps</Text>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />}
      >
        {!isAvailable && (
          <Card>
            <Text style={{ color: t.danger }}>{unavailableReason}</Text>
          </Card>
        )}

        {isAvailable && !permitted && (
          <Card>
            <Text style={{ color: t.text, fontWeight: '600', marginBottom: 6 }}>Usage access required</Text>
            <Text style={{ color: t.muted, marginBottom: 12 }}>
              Android only shares per-app screen time after you enable "Usage access" for this app.
            </Text>
            <Button title="Open usage access settings" onPress={openUsageAccessSettings} />
          </Card>
        )}

        {/* Date navigation */}
        <View style={styles.dateRow}>
          <Pressable onPress={() => shiftDay(-1)} hitSlop={12} style={styles.arrow}>
            <Text style={{ color: t.primary, fontSize: 22 }}>‹</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{dateLabel}</Text>
            {!isToday && (
              <Pressable onPress={() => setDate(startOfDay(Date.now()))}>
                <Text style={{ color: t.primary, fontSize: 12 }}>Back to today</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => shiftDay(1)} hitSlop={12} disabled={isToday} style={[styles.arrow, { opacity: isToday ? 0.25 : 1 }]}>
            <Text style={{ color: t.primary, fontSize: 22 }}>›</Text>
          </Pressable>
        </View>

        {error && (
          <Card>
            <Text style={{ color: t.danger }}>{error}</Text>
          </Card>
        )}

        {/* App filter */}
        <View style={styles.filterRow}>
          <Text style={{ color: t.muted, fontWeight: '600', fontSize: 12, textTransform: 'uppercase' }}>
            Filter ({settings.selected.length})
          </Text>
          <Button title="+ Choose apps" variant="secondary" onPress={() => setPickerOpen(true)} style={{ minHeight: 36, paddingVertical: 6 }} />
        </View>

        {settings.selected.length === 0 && (
          <Card>
            <Text style={{ color: t.muted, marginBottom: topApps.length ? 10 : 0 }}>
              Pick the apps to track. Their hourly usage shows here and they are the ones sent to your sheet.
            </Text>
            {topApps.length > 0 && <Label>Most used on this day</Label>}
            {topApps.map((a) => (
              <Pressable key={a.packageName} onPress={() => toggleApp(a)} style={styles.topRow}>
                <Text style={{ color: t.text, flex: 1 }} numberOfLines={1}>
                  {a.label}
                </Text>
                <Text style={{ color: t.muted, marginRight: 10 }}>{formatDuration(usageMs[a.packageName])}</Text>
                <Text style={{ color: t.primary, fontWeight: '600' }}>+ Add</Text>
              </Pressable>
            ))}
          </Card>
        )}

        {settings.selected.map((pkg) => {
          const hours = hourly[pkg] ?? new Array(24).fill(0);
          const name = nameOf(pkg);
          return (
            <Card key={pkg}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    Total {formatDuration(usageMs[pkg] ?? 0)}
                  </Text>
                </View>
                <Pressable onPress={() => update({ selected: settings.selected.filter((p) => p !== pkg) })} hitSlop={10}>
                  <Text style={{ color: t.muted, fontSize: 18 }}>✕</Text>
                </Pressable>
              </View>
              <HourlyChart hours={hours} />
              <Label>Sheet row name</Label>
              <TextInput
                value={settings.aliases[pkg] ?? ''}
                onChangeText={(v) => update({ aliases: { ...settings.aliases, [pkg]: v } })}
                placeholder={name}
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
              />
            </Card>
          );
        })}

        {settings.selected.length > 1 && (
          <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>
            Tip: give several apps the same "Sheet row name" (e.g. "Redes sociais") and their minutes are summed in one row.
          </Text>
        )}
      </ScrollView>

      <AppPickerModal
        visible={pickerOpen}
        apps={apps}
        selected={settings.selected}
        usageMs={usageMs}
        onToggle={toggleApp}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
});
