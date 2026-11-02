import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { GhostButton, IconButton } from '../../components/Buttons';
import { EfficiencyCard } from '../../components/EfficiencyCard';
import { FadeIn } from '../../components/FadeIn';
import { JournalRow } from '../../components/JournalRow';
import { PressableScale } from '../../components/PressableScale';
import { ActionSheet } from '../../components/Sheet';
import { TrendCard } from '../../components/TrendCard';
import { Vo2EstimateCard } from '../../components/Vo2EstimateCard';
import { needsBackupNudge } from '../../domain/backup';
import { efficiencyTrend } from '../../domain/efficiency';
import { getProtocol } from '../../domain/protocols';
import { defaultDistanceUnit } from '../../domain/track';
import { useNow } from '../../hooks/useNow';
import { kgToUnit } from '../../lib/format';
import type { JournalEntry } from '../../state/model';
import { journalSections, metricSeries } from '../../state/selectors';
import { efficiencyPoints, efficiencyRef } from '../../state/efficiency';
import { vo2EstimateFor } from '../../state/fitness';
import { useStore } from '../../state/store';
import { colors, radius, space } from '../../theme/tokens';

export default function JournalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, deleteMetric, deleteSession, updateSettings } = useStore();
  const now = useNow();
  const showBackupNudge = state.hydrated && needsBackupNudge(state.sessions, state.settings, now);
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);

  const unit = state.settings.weightUnit;
  const sections = useMemo(() => journalSections(state.sessions, state.metrics), [state.sessions, state.metrics]);
  const vo2 = useMemo(() => metricSeries(state.metrics, 'vo2max'), [state.metrics]);
  const weight = useMemo(() => metricSeries(state.metrics, 'weightKg'), [state.metrics]);
  const sessionNames = useMemo(
    () => new Map(state.sessions.map((s) => [s.id, getProtocol(s.protocolId).name])),
    [state.sessions],
  );

  const estimate = vo2EstimateFor(state.settings);
  const estimateHistory = useMemo(
    () =>
      state.sessions
        .filter((s) => s.vo2Estimate !== undefined)
        .map((s) => ({ at: s.startedAt, value: s.vo2Estimate as number }))
        .sort((a, b) => a.at - b.at),
    [state.sessions],
  );

  const distanceUnit = state.settings.distanceUnit ?? defaultDistanceUnit(Intl.DateTimeFormat().resolvedOptions().locale);
  const recoveryTrend = useMemo(
    () =>
      state.sessions
        .filter((s) => s.hr?.recoveryAvg !== undefined)
        .map((s) => ({ at: s.startedAt, value: s.hr?.recoveryAvg as number }))
        .sort((a, b) => a.at - b.at),
    [state.sessions],
  );

  const peakTrend = useMemo(
    () =>
      state.sessions
        .filter((s) => s.hr !== undefined && (s.hr.sustainedMax || s.hr.max) > 0)
        .map((s) => ({ at: s.startedAt, value: (s.hr?.sustainedMax || s.hr?.max) as number }))
        .sort((a, b) => a.at - b.at),
    [state.sessions],
  );

  const hasWalks = state.sessions.some((s) => s.protocolId === 'japanese-iwt');
  const effRef = efficiencyRef(state.settings);
  const effRest = effRef?.restHr;
  const effMax = effRef?.maxHr;
  const effPoints = useMemo(
    () => (effRest && effMax ? efficiencyPoints(state.sessions, { restHr: effRest, maxHr: effMax }) : []),
    [state.sessions, effRest, effMax],
  );
  const effTrend = useMemo(() => efficiencyTrend(effPoints), [effPoints]);

  const totalMinutes = Math.round(state.sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60);

  const header = (
    <View>
      <FadeIn>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="eyebrow">Progress</AppText>
            <AppText variant="display" style={{ marginTop: 10 }}>
              Journal
            </AppText>
          </View>
          <IconButton icon="cloud-upload-outline" label="Data and backup" onPress={() => router.push('/backup')} />
        </View>
        <AppText variant="body" style={{ marginTop: 8 }}>
          {state.sessions.length === 0
            ? 'Your sessions and readings will gather here.'
            : `${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'} · ${totalMinutes} minutes of practice`}
        </AppText>
      </FadeIn>

      {showBackupNudge ? (
        <FadeIn delay={60} style={styles.nudge}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.amber} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <AppText variant="callout">Back up your journal?</AppText>
            <AppText variant="caption" style={{ marginTop: 2 }}>
              It only lives on this phone. A backup file keeps it safe if the phone is lost or replaced.
            </AppText>
            <View style={styles.nudgeActions}>
              <PressableScale onPress={() => router.push('/backup')} accessibilityRole="button" accessibilityLabel="Back up now" hitSlop={8}>
                <AppText variant="callout" color={colors.amber}>
                  Back up
                </AppText>
              </PressableScale>
              <PressableScale
                onPress={() => updateSettings({ backupSnoozedAt: Date.now() })}
                accessibilityRole="button"
                accessibilityLabel="Remind me later"
                hitSlop={8}
              >
                <AppText variant="callout" color={colors.textTertiary}>
                  Not now
                </AppText>
              </PressableScale>
            </View>
          </View>
        </FadeIn>
      ) : null}

      <FadeIn delay={100} style={styles.trends}>
        <TrendCard
          label="VO₂ max · logged"
          unit="mL/kg/min"
          points={vo2}
          color={colors.cyan}
          higherIsBetter
          emptyHint="Log a reading to begin your trend"
        />
        <TrendCard
          label="Weight"
          unit={unit}
          points={weight}
          color={colors.lavender}
          display={(kg) => kgToUnit(kg, unit)}
          emptyHint="Optional — track alongside VO₂"
        />
      </FadeIn>

      <FadeIn delay={140} style={{ marginTop: 12 }}>
        <Vo2EstimateCard estimate={estimate} history={estimateHistory} />
      </FadeIn>

      {peakTrend.length > 0 || recoveryTrend.length > 0 ? (
        <FadeIn delay={160} style={[styles.trends, { marginTop: 12 }]}>
          <TrendCard
            label="Peak HR · 10 s"
            unit="bpm"
            points={peakTrend}
            color={colors.amber}
            decimals={0}
            emptyHint="Appears after a workout with heart rate"
          />
          <TrendCard
            label="HR recovery"
            unit="bpm drop"
            points={recoveryTrend}
            color={colors.crimson}
            decimals={0}
            higherIsBetter
            emptyHint="Needs full hard intervals with heart rate"
          />
        </FadeIn>
      ) : null}

      {hasWalks ? (
        <FadeIn delay={170} style={{ marginTop: 12 }}>
          <EfficiencyCard trend={effTrend} points={effPoints} hrRef={effRef} unit={distanceUnit} />
        </FadeIn>
      ) : null}

      <FadeIn delay={180}>
        <GhostButton label="Log metrics" icon="add" onPress={() => router.push('/log')} style={styles.logButton} />
      </FadeIn>

      {sections.length > 0 ? (
        <AppText variant="eyebrow" style={styles.historyTitle}>
          History
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#141A22', colors.bg]} locations={[0, 0.4]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}
        renderSectionHeader={({ section }) => (
          <AppText variant="caption" color={colors.textSecondary} style={styles.dayHeading}>
            {section.title}
          </AppText>
        )}
        renderItem={({ item }) => (
          <JournalRow
            entry={item}
            weightUnit={unit}
            linkedSessionName={item.type === 'metric' && item.sessionId ? sessionNames.get(item.sessionId) : undefined}
            distanceUnit={distanceUnit}
            onPress={item.type === 'session' ? () => router.push({ pathname: '/summary', params: { id: item.id, from: 'journal' } }) : undefined}
            onLongPress={() => setPendingDelete(item)}
          />
        )}
        ListEmptyComponent={
          state.hydrated ? (
            <View style={styles.empty}>
              <View style={styles.emptyRing} />
              <AppText variant="body" align="center" style={{ marginTop: space.lg }}>
                Nothing here yet. Finish a session and it will be recorded automatically.
              </AppText>
            </View>
          ) : undefined
        }
      />

      <ActionSheet
        visible={pendingDelete !== null}
        title={pendingDelete?.type === 'session' ? 'Delete this session?' : 'Delete this entry?'}
        message="This can’t be undone."
        onDismiss={() => setPendingDelete(null)}
        actions={[
          {
            label: 'Delete',
            tone: 'destructive',
            onPress: () => {
              if (pendingDelete?.type === 'session') deleteSession(pendingDelete.id);
              else if (pendingDelete) deleteMetric(pendingDelete.id);
              setPendingDelete(null);
            },
          },
          { label: 'Cancel', onPress: () => setPendingDelete(null) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: space.lg,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,179,71,0.08)',
  },
  nudgeActions: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 10,
  },
  trends: {
    flexDirection: 'row',
    gap: 12,
    marginTop: space.xl,
  },
  logButton: {
    marginTop: space.md,
  },
  historyTitle: {
    marginTop: space.xxl,
  },
  dayHeading: {
    marginTop: space.lg,
    marginBottom: 2,
  },
  empty: {
    alignItems: 'center',
    marginTop: space.xxl,
    paddingHorizontal: space.lg,
  },
  emptyRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(200,191,244,0.25)',
  },
});
