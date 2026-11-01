import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { formatNumber, formatShortDate } from '../lib/format';
import type { Vo2Estimate } from '../state/fitness';
import type { SeriesPoint } from '../state/selectors';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { Sparkline } from './Sparkline';

interface Props {
  estimate: Vo2Estimate | null;
  /** Per-session estimates, oldest → newest. */
  history: readonly SeriesPoint[];
}

const SOURCE_LABEL = { measured: 'measured', workouts: 'from workouts', age: 'from age' } as const;

/**
 * Heart-rate-based VO₂ max estimate: headline value with its error band,
 * a trend of per-session estimates, and the inputs it was built from.
 */
export function Vo2EstimateCard({ estimate, history }: Props) {
  const router = useRouter();

  if (!estimate) {
    return (
      <PressableScale
        onPress={() => router.push('/heart-rate')}
        accessibilityRole="button"
        accessibilityLabel="Set up the VO2 max estimate"
        style={[styles.card, styles.row]}
      >
        <View style={styles.icon}>
          <Ionicons name="analytics-outline" size={18} color={colors.cyan} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="callout">Estimate VO₂ max from heart rate</AppText>
          <AppText variant="caption">Add your resting heart rate to start — updated after every workout</AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </PressableScale>
    );
  }

  const first = history[0];
  const delta = history.length > 1 ? estimate.value - first.value : null;

  return (
    <PressableScale
      onPress={() => router.push('/heart-rate')}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityLabel={`Estimated VO2 max ${formatNumber(estimate.value)}, plus or minus ${estimate.uncertainty}`}
      style={styles.card}
    >
      <View style={styles.head}>
        <AppText variant="eyebrow">Estimated VO₂ max</AppText>
        <AppText variant="caption" color={colors.textTertiary}>
          from heart rate
        </AppText>
      </View>
      <View style={styles.valueRow}>
        <AppText variant="metric">{formatNumber(estimate.value)}</AppText>
        <AppText variant="caption" style={{ marginLeft: 8 }}>
          ± {estimate.uncertainty} mL/kg/min
        </AppText>
      </View>
      {history.length > 1 ? <Sparkline values={history.slice(-24).map((p) => p.value)} color={colors.cyan} height={40} /> : null}
      <AppText variant="caption" style={styles.inputs}>
        Max {estimate.maxHr.bpm} ({SOURCE_LABEL[estimate.maxHr.source]}) · resting {estimate.restingHr}
        {estimate.calibrated ? ' · calibrated to your logged reading' : ''}
        {delta !== null && Math.abs(delta) >= 0.1
          ? ` · ${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta))} since ${formatShortDate(first.at)}`
          : ''}
      </AppText>
    </PressableScale>
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
    backgroundColor: 'rgba(91,225,230,0.1)',
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
  inputs: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
  },
});
