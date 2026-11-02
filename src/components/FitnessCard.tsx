import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatNumber } from '../lib/format';
import { vo2EstimateFor } from '../state/fitness';
import type { SessionEntry } from '../state/model';
import { useStore } from '../state/store';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';

const SOURCE_LABEL = { measured: 'measured', workouts: 'from workouts', age: 'from age' } as const;

/**
 * The two fitness numbers a heart-rate workout gives you: the VO₂ max
 * estimate (with its change since last time) and max heart rate (this
 * session's sustained peak, and whether it raised your known max).
 *
 * If the session had heart rate but no VO₂ estimate because resting HR was
 * missing, it offers to add one — and back-fills this session once it's set.
 */
export function FitnessCard({ session, isLatestWithHr }: { session: SessionEntry; isLatestWithHr: boolean }) {
  const router = useRouter();
  const { state, updateSession } = useStore();

  const estimateNow = vo2EstimateFor(state.settings);
  const canBackfill = session.hr !== undefined && session.vo2Estimate === undefined && isLatestWithHr && estimateNow !== null;
  const backfillValue = estimateNow?.value;
  useEffect(() => {
    if (canBackfill && backfillValue !== undefined) updateSession(session.id, { vo2Estimate: backfillValue });
  }, [canBackfill, backfillValue, session.id, updateSession]);

  if (!session.hr) return null;

  const prevEstimate = state.sessions.find(
    (s) => s.id !== session.id && s.startedAt < session.startedAt && s.vo2Estimate !== undefined,
  )?.vo2Estimate;
  const vo2 = session.vo2Estimate;
  const vo2Delta = vo2 !== undefined && prevEstimate !== undefined ? vo2 - prevEstimate : null;

  const peak = session.hr.sustainedMax || session.hr.max;
  const raised = session.maxHr?.previous !== undefined;

  return (
    <View style={styles.row}>
      {vo2 !== undefined ? (
        <View style={styles.tile} accessible accessibilityLabel={`Estimated VO2 max ${formatNumber(vo2)}`}>
          <AppText variant="eyebrow">Est. VO₂ max</AppText>
          <View style={styles.valueRow}>
            <AppText variant="metric">{formatNumber(vo2)}</AppText>
            {estimateNow ? (
              <AppText variant="caption" style={styles.unit}>
                ±{estimateNow.uncertainty}
              </AppText>
            ) : null}
          </View>
          <AppText
            variant="caption"
            color={vo2Delta !== null && vo2Delta >= 0.1 ? colors.sage : colors.textTertiary}
            style={styles.foot}
            numberOfLines={2}
          >
            {vo2Delta === null
              ? 'First estimate · mL/kg/min'
              : Math.abs(vo2Delta) < 0.1
              ? 'Same as last time'
              : `${vo2Delta > 0 ? '▲ +' : '▼ −'}${formatNumber(Math.abs(vo2Delta))} since last`}
          </AppText>
        </View>
      ) : estimateNow ? (
        // Resting HR is set now, but this (older) session was saved without an estimate.
        <View style={styles.tile}>
          <AppText variant="eyebrow">Est. VO₂ max</AppText>
          <View style={styles.valueRow}>
            <AppText variant="metric" color={colors.textFaint}>
              —
            </AppText>
          </View>
          <AppText variant="caption" style={styles.foot} numberOfLines={2}>
            Not estimated for this session
          </AppText>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push('/heart-rate')}
          accessibilityRole="button"
          accessibilityLabel="Add your resting heart rate to estimate VO2 max"
          style={({ pressed }) => [styles.tile, styles.cta, pressed && { opacity: 0.7 }]}
        >
          <AppText variant="eyebrow">Est. VO₂ max</AppText>
          <View style={[styles.valueRow, { alignItems: 'center' }]}>
            <Ionicons name="add-circle-outline" size={24} color={colors.cyan} />
            <AppText variant="callout" color={colors.cyan} style={{ marginLeft: 6, flexShrink: 1 }} numberOfLines={1}>
              Add resting HR
            </AppText>
          </View>
          <AppText variant="caption" style={styles.foot} numberOfLines={2}>
            Needed for the estimate — this session updates once set
          </AppText>
        </Pressable>
      )}

      <View style={styles.tile} accessible accessibilityLabel={`Peak heart rate ${peak}${raised ? ', a new max' : ''}`}>
        <AppText variant="eyebrow">Peak HR · 10 s</AppText>
        <View style={styles.valueRow}>
          <AppText variant="metric">{peak}</AppText>
          <AppText variant="caption" style={styles.unit}>
            bpm
          </AppText>
        </View>
        <AppText variant="caption" color={raised ? colors.sage : colors.textTertiary} style={styles.foot} numberOfLines={2}>
          {raised
            ? `▲ New max HR · was ${session.maxHr?.previous}`
            : session.maxHr
            ? `Max ${session.maxHr.bpm} (${SOURCE_LABEL[session.maxHr.source]})`
            : `Highest ${session.hr.max} bpm`}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    padding: 16,
  },
  cta: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(91,225,230,0.35)',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    minHeight: 40,
  },
  unit: {
    marginLeft: 6,
  },
  foot: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
});
