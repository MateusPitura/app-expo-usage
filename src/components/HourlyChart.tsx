import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '../lib/usage';
import { useTheme } from '../theme';

const HEIGHT = 96;
const HOUR_MS = 3_600_000;

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** 24 bars (local hours 00-23). A full-height bar = the app was used the whole hour. Tap a bar for details. */
export function HourlyChart({ hours }: { hours: number[] }) {
  const t = useTheme();
  const [active, setActive] = useState<number | null>(null);

  const peak = hours.reduce((best, v, i) => (v > hours[best] ? i : best), 0);
  const shown = active ?? (hours[peak] > 0 ? peak : null);

  return (
    <View>
      <View style={[styles.bars, { height: HEIGHT }]}>
        {hours.map((ms, h) => {
          const barH = ms > 0 ? Math.max(3, Math.min(1, ms / HOUR_MS) * HEIGHT) : 0;
          return (
            <Pressable
              key={h}
              style={styles.col}
              onPress={() => setActive(active === h ? null : h)}
              accessibilityLabel={`${hh(h)}, ${formatDuration(ms)}`}
            >
              <View style={[styles.track, { backgroundColor: t.barDim }]}>
                <View
                  style={{
                    height: barH,
                    backgroundColor: t.bar,
                    opacity: active === null || active === h ? 1 : 0.45,
                    borderRadius: 2,
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <Text key={h} style={[styles.axisLabel, { color: t.muted }]}>
            {h}h
          </Text>
        ))}
      </View>
      <Text style={[styles.detail, { color: t.muted }]}>
        {shown === null
          ? 'No usage recorded'
          : `${hh(shown)}–${hh((shown + 1) % 24)} · ${formatDuration(hours[shown])}${
              active === null ? ' (peak)' : ''
            }`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  col: { flex: 1, height: HEIGHT },
  track: { flex: 1, borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden' },
  axis: { flexDirection: 'row', marginTop: 4 },
  axisLabel: { flex: 1, fontSize: 10 },
  detail: { marginTop: 6, fontSize: 12 },
});
