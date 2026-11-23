import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : 'transparent';
  const color = variant === 'primary' ? t.primaryText : variant === 'danger' ? t.danger : t.primary;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: variant === 'primary' ? bg : color, opacity: off ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: '600', fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  btn: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
});
