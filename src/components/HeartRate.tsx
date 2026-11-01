import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BpmRange, ZoneStatus } from '../domain/zones';
import { colors } from '../theme/tokens';
import { AppText } from './AppText';

/** A heart icon that beats in time with the live heart rate. */
export function BeatingHeart({ bpm, color, size = 18 }: { bpm: number | null; color: string; size?: number }) {
  const [scale] = useState(() => new Animated.Value(1));
  // Restart the loop only when the rate changes meaningfully.
  const bucket = bpm ? Math.round(bpm / 4) * 4 : 0;

  useEffect(() => {
    if (!bucket) {
      scale.setValue(1);
      return;
    }
    const beat = 60_000 / bucket;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.22, duration: beat * 0.18, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: beat * 0.32, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(beat * 0.5),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bucket, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={bpm ? 'heart' : 'heart-outline'} size={size} color={color} />
    </Animated.View>
  );
}

interface GaugeProps {
  bpm: number | null;
  range: BpmRange;
  maxHr: number;
  accent: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Horizontal heart-rate gauge from 40 % to 100 % of max HR with the target
 * band highlighted and a marker for the current reading.
 */
export function ZoneGauge({ bpm, range, maxHr, accent, style }: GaugeProps) {
  const min = maxHr * 0.4;
  const span = maxHr - min;
  const pos = (v: number) => `${Math.max(0, Math.min(1, (v - min) / span)) * 100}%` as const;
  const bandLeft = (range.low - min) / span;
  const bandWidth = (range.high - range.low) / span;

  return (
    <View style={[styles.gauge, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.track} />
      <View
        style={[
          styles.band,
          { left: `${bandLeft * 100}%`, width: `${bandWidth * 100}%`, backgroundColor: accent },
        ]}
      />
      {bpm !== null ? (
        <View style={[styles.markerWrap, { left: pos(bpm) }]}>
          <View style={[styles.marker, { borderColor: accent }]} />
        </View>
      ) : null}
    </View>
  );
}

export function statusColor(status: ZoneStatus | null, accent: string): string {
  switch (status) {
    case 'in':
      return accent;
    case 'above':
      return colors.amber;
    case 'below':
      return colors.blue;
    default:
      return colors.textSecondary;
  }
}

const styles = StyleSheet.create({
  gauge: {
    height: 16,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  band: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  markerWrap: {
    position: 'absolute',
    width: 0,
    alignItems: 'center',
  },
  marker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    borderWidth: 3,
  },
});

export function HeartRateNumber({ bpm, color }: { bpm: number | null; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <AppText style={{ fontSize: 34, fontWeight: '300', letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] }}>
        {bpm ?? '—'}
      </AppText>
      <AppText variant="caption" color={color} style={{ marginLeft: 4 }}>
        bpm
      </AppText>
    </View>
  );
}
