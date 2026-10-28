import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { FadeIn } from '../../components/FadeIn';
import { ProtocolCard } from '../../components/ProtocolCard';
import { PROTOCOL_LIST } from '../../domain/protocols';
import { formatLongDate, formatNumber, greeting } from '../../lib/format';
import { metricSeries, weekSummary } from '../../state/selectors';
import { useStore } from '../../state/store';
import { colors, space } from '../../theme/tokens';
import { useNow } from '../../hooks/useNow';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useStore();

  const now = useNow();
  const week = weekSummary(state.sessions, now);
  const latestVo2 = useMemo(() => metricSeries(state.metrics, 'vo2max').at(-1), [state.metrics]);

  const weekLine =
    week.sessions === 0
      ? 'A quiet week so far. Begin when you’re ready.'
      : `${week.sessions} session${week.sessions === 1 ? '' : 's'} · ${week.minutes} min in the last 7 days`;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1826', colors.bg]}
        locations={[0, 0.45]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <AppText variant="eyebrow">{formatLongDate(now)}</AppText>
          <AppText variant="display" style={styles.title}>
            {greeting(now)}.
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            {weekLine}
          </AppText>
          {latestVo2 ? (
            <View style={styles.vo2Chip}>
              <View style={styles.vo2Dot} />
              <AppText variant="caption" color={colors.textSecondary}>
                VO₂ max {formatNumber(latestVo2.value)} mL/kg/min
              </AppText>
            </View>
          ) : null}
        </FadeIn>

        <FadeIn delay={120}>
          <AppText variant="eyebrow" style={styles.section}>
            Choose your practice
          </AppText>
        </FadeIn>

        {PROTOCOL_LIST.map((p, i) => (
          <FadeIn key={p.id} delay={200 + i * 110} style={styles.cardGap}>
            <ProtocolCard protocol={p} onPress={() => router.push({ pathname: '/prepare/[protocol]', params: { protocol: p.id } })} />
          </FadeIn>
        ))}

        <FadeIn delay={480}>
          <AppText variant="caption" align="center" style={styles.footnote}>
            Consistency over intensity.
          </AppText>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
  },
  title: {
    marginTop: 10,
  },
  subtitle: {
    marginTop: 8,
  },
  vo2Chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  vo2Dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cyan,
    marginRight: 8,
  },
  section: {
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  cardGap: {
    marginBottom: space.md,
  },
  footnote: {
    marginTop: space.lg,
    color: colors.textFaint,
  },
});
