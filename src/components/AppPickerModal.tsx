import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InstalledApp } from '../../modules/usage-stats';
import { formatDuration } from '../lib/usage';
import { useTheme } from '../theme';

interface Props {
  visible: boolean;
  apps: InstalledApp[];
  selected: string[];
  /** package -> total ms used on the day being viewed */
  usageMs: Record<string, number>;
  onToggle: (app: InstalledApp) => void;
  onClose: () => void;
}

export function AppPickerModal({ visible, apps, selected, usageMs, onToggle, onClose }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => !q || a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q))
      .sort((a, b) => (usageMs[b.packageName] ?? 0) - (usageMs[a.packageName] ?? 0) || a.label.localeCompare(b.label));
  }, [apps, query, usageMs]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Filter by apps</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: t.primary, fontWeight: '600', fontSize: 16 }}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search apps"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.search, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
        />
        <FlatList
          data={data}
          keyExtractor={(a) => a.packageName}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = selected.includes(item.packageName);
            const ms = usageMs[item.packageName] ?? 0;
            return (
              <Pressable
                onPress={() => onToggle(item)}
                style={[styles.row, { borderColor: t.border }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <View
                  style={[
                    styles.check,
                    { borderColor: on ? t.primary : t.muted, backgroundColor: on ? t.primary : 'transparent' },
                  ]}
                >
                  {on && <Text style={{ color: t.primaryText, fontSize: 13, fontWeight: '700' }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 15 }} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 11 }} numberOfLines={1}>
                    {item.packageName}
                  </Text>
                </View>
                <Text style={{ color: ms > 0 ? t.text : t.muted, fontSize: 13 }}>{ms > 0 ? formatDuration(ms) : '—'}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={{ color: t.muted, padding: 24, textAlign: 'center' }}>No apps found</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  search: { marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
