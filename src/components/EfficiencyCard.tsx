import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DISPLAY_FRACTION, MIN_HISTORY_DAYS, paceAtFraction, type EfficiencyPoint, type EfficiencyTrend, type HrRef } from '../domain/efficiency';
import { formatPace, METERS_PER_MILE, type DistanceUnit } from '../domain/track';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { Sparkline } from './Sparkline';

interface Props {
  trend: EfficiencyTrend | null;
  /** Per-walk values, oldest → newest. */
  points: readonly EfficiencyPoint[];
  hrRef: HrRef | null;
  unit: DistanceUnit;
}

const WEEK = 7 * 86_400_000;
/** Differences smaller than this (seconds per mile/km) read as "about the same". */
const SAME_SEC = 3;

/**
 * Walking efficiency: the pace your Interval Walking fast walks imply at 75%
 * of max heart rate, and how it has moved. Faster at the same heart rate =
 * fitter.
 */
export function EfficiencyCard({ trend, points, hrRef, unit }: Props) {
  const router = useRouter();

  if (!hrRef) {
    return (
      <PressableScale
        onPress={() => router.push('/heart-rate')}
        accessibilityRole="button"
        accessibilityLabel="Set up walking efficiency"
        style={[styles.card, styles.row]}
      >
        <View style={styles.icon}>
          <Ionicons name="walk-outline" size={18} color={colors.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="callout">Walking efficiency</AppText>
          <AppText variant="caption">Add your resting and max heart rate to see your walking pace at a steady heart rate</AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </PressableScale>
    );
  }

  const targetBpm = Math.round(DISPLAY_FRACTION * hrRef.maxHr);
  const head = (
    <View style={styles.head}>
      <AppText variant="eyebrow">Walking efficiency</AppText>
      <AppText variant="caption" color={colors.textTertiary}>
        pace at {Math.round(DISPLAY_FRACTION * 100)}% max HR
      </AppText>
    </View>
  );

  const pace = trend ? paceAtFraction(trend.current, hrRef) : null;
  if (!trend || pace === null) {
    return (
      <View style={styles.card}>
        {head}
        <AppText variant="metric" color={colors.textFaint} style={{ marginTop: 10 }}>
          —
        </AppText>
        <AppText variant="caption" style={styles.foot}>
          Appears after an outdoor Interval Walking session with GPS and heart rate — it needs at least two fast walks on flat
          ground with a steady signal.
        </AppText>
      </View>
    );
  }

  const perUnit = unit === 'mi' ? METERS_PER_MILE / 1000 : 1;
  let deltaText: string;
  let deltaColor: string = colors.textTertiary;
  const basePace = trend.baseline ? paceAtFraction(trend.baseline.index, hrRef) : null;
  if (trend.baseline && basePace !== null) {
    const weeks = Math.max(1, Math.round((trend.currentAt - trend.baseline.at) / WEEK));
    const faster = Math.round((basePace - pace) * perUnit);
    if (Math.abs(faster) < SAME_SEC) deltaText = `About the same as ${weeks} weeks ago`;
    else if (faster > 0) {
      deltaText = `${faster} s/${unit} faster than ${weeks} weeks ago`;
      deltaColor = colors.sage;
    } else {
      deltaText = `${-faster} s/${unit} slower than ${weeks} weeks ago`;
      deltaColor = colors.textSecondary;
    }
  } else {
    const days = trend.spanDays;
    deltaText = `Building a baseline · ${trend.sessions} walk${trend.sessions === 1 ? '' : 's'}${days > 0 ? ` over ${days} days` : ''} · the comparison starts after ${MIN_HISTORY_DAYS / 7} weeks`;
  }

  return (
    <View style={styles.card} accessible accessibilityLabel={`Walking efficiency: ${formatPace(pace, unit)} at ${targetBpm} beats per minute. ${deltaText}.`}>
      {head}
      <View style={styles.valueRow}>
        <AppText variant="metric">{formatPace(pace, unit)}</AppText>
        <AppText variant="caption" style={{ marginLeft: 8 }}>
          at {targetBpm} bpm
        </AppText>
      </View>
      {points.length > 1 ? <Sparkline values={points.slice(-24).map((p) => p.index)} color={colors.teal} height={40} /> : null}
      <AppText variant="caption" color={deltaColor} style={styles.delta}>
        {deltaText}
      </AppText>
      <AppText variant="caption" style={styles.foot}>
        From the steady part of each fast walk (after its first minute), flat ground only · resting {hrRef.restHr} · max {hrRef.maxHr}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(47,212,196,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 8,
  },
  delta: {
    marginTop: 10,
    fontSize: 13,
  },
  foot: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
});
