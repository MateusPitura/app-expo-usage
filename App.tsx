import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from './src/settingsContext';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { UsageScreen } from './src/screens/UsageScreen';
import { useTheme } from './src/theme';

type Tab = 'apps' | 'sync' | 'settings';

function Shell() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { ready } = useSettings();
  const [tab, setTab] = useState<Tab>('sync');

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  const TabButton = ({ id, label }: { id: Tab; label: string }) => (
    <Pressable style={styles.tab} onPress={() => setTab(id)}>
      <Text style={{ color: tab === id ? t.primary : t.muted, fontWeight: tab === id ? '700' : '500', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* All screens stay mounted so state survives tab switches. */}
      <View style={{ flex: 1, display: tab === 'apps' ? 'flex' : 'none' }}>
        <UsageScreen onOpenSettings={() => setTab('settings')} />
      </View>
      <View style={{ flex: 1, display: tab === 'sync' ? 'flex' : 'none' }}>
        <SyncScreen />
      </View>
      <View style={{ flex: 1, display: tab === 'settings' ? 'flex' : 'none' }}>
        <SettingsScreen />
      </View>
      <View style={[styles.tabBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: insets.bottom }]}>
        <TabButton id="sync" label="Sync" />
        <TabButton id="apps" label="Apps" />
        <TabButton id="settings" label="Settings" />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Shell />
        <StatusBar style="auto" />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 52 },
});
