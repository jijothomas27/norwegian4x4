import { StyleSheet, View } from 'react-native';

import { formatNumber, formatShortDate } from '../lib/format';
import type { SeriesPoint } from '../state/selectors';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Sparkline } from './Sparkline';

interface Props {
  label: string;
  unit: string;
  points: readonly SeriesPoint[];
  color: string;
  /** Transform stored value for display (e.g. kg → lbs). */
  display?: (v: number) => number;
  decimals?: number;
  /** For weight, a decrease isn't "bad" — keep deltas neutral. */
  higherIsBetter?: boolean;
  emptyHint: string;
}

/** One headline number with its quiet trend line underneath. */
export function TrendCard({ label, unit, points, color, display = (v) => v, decimals = 1, higherIsBetter, emptyHint }: Props) {
  const latest = points[points.length - 1];
  const first = points[0];
  const shown = points.slice(-20).map((p) => display(p.value));
  const delta = latest && first && points.length > 1 ? display(latest.value) - display(first.value) : null;

  let deltaColor: string = colors.textTertiary;
  if (delta !== null && higherIsBetter !== undefined && Math.abs(delta) >= 0.05) {
    deltaColor = (delta > 0) === higherIsBetter ? colors.sage : colors.textSecondary;
  }

  return (
    <View style={styles.card} accessible accessibilityLabel={latest ? `${label}: ${formatNumber(display(latest.value), decimals)} ${unit}` : `${label}: no readings yet`}>
      <AppText variant="eyebrow">{label}</AppText>

      {latest ? (
        <>
          <View style={styles.valueRow}>
            <AppText variant="metric">{formatNumber(display(latest.value), decimals)}</AppText>
            <AppText variant="caption" style={styles.unit}>
              {unit}
            </AppText>
          </View>
          <Sparkline values={shown} color={color} height={44} />
          <AppText variant="caption" color={deltaColor} style={styles.delta} numberOfLines={1}>
            {delta === null
              ? `First reading · ${formatShortDate(latest.at)}`
              : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${formatNumber(Math.abs(delta), decimals)} since ${formatShortDate(first.at)}`}
          </AppText>
        </>
      ) : (
        <View style={styles.empty}>
          <AppText variant="metric" color={colors.textFaint}>
            —
          </AppText>
          <AppText variant="caption" style={{ marginTop: space.sm }}>
            {emptyHint}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 20,
    paddingBottom: 18,
    minHeight: 178,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 12,
    marginBottom: 10,
  },
  unit: {
    marginLeft: 6,
  },
  delta: {
    marginTop: 10,
    fontSize: 12,
  },
  empty: {
    marginTop: 12,
  },
});
