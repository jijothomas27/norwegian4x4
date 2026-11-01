import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { FadeIn } from '../components/FadeIn';
import { FitnessCard } from '../components/FitnessCard';
import { PhaseBackdrop } from '../components/PhaseBackdrop';
import { ProgressRing } from '../components/ProgressRing';
import { RouteSketch } from '../components/RouteSketch';
import { buildPhases, getProtocol, normalizeConfig } from '../domain/protocols';
import { formatMinutes } from '../domain/timeline';
import { defaultDistanceUnit, formatDistance, formatPace, type DistanceUnit } from '../domain/track';
import type { SessionEntry } from '../state/model';
import { formatLongDate, formatTime } from '../lib/format';
import { useStore } from '../state/store';
import { colors, radius } from '../theme/tokens';

export default function SummaryScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const fromJournal = from === 'journal';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useStore();

  const session = state.sessions.find((s) => s.id === id);
  if (!session) {
    // Should never happen (the session is written before we navigate here),
    // but never strand the user on a blank screen.
    return state.hydrated ? <Redirect href="/" /> : <View style={styles.root} />;
  }

  const def = getProtocol(session.protocolId);
  const isLatestWithHr = state.sessions.find((s) => s.hr !== undefined)?.id === session.id;
  const logged = state.metrics.some((m) => m.sessionId === session.id);

  const unit: DistanceUnit = state.settings.distanceUnit ?? defaultDistanceUnit(Intl.DateTimeFormat().resolvedOptions().locale);
  const phases = buildPhases(def, normalizeConfig(def, { rounds: session.totalRounds }));

  function done() {
    if (fromJournal) router.back();
    else if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  }

  return (
    <View style={styles.root}>
      <PhaseBackdrop tone="complete" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.center}>
          <FadeIn from={0} duration={900}>
            <ProgressRing size={132} progress={session.completed ? 1 : session.roundsCompleted / session.totalRounds} color={def.accent} strokeWidth={2}>
              <Ionicons name={session.completed ? 'checkmark' : 'pause'} size={40} color={colors.text} />
            </ProgressRing>
          </FadeIn>

          <FadeIn delay={200} style={{ alignItems: 'center' }}>
            <AppText variant="eyebrow" color={def.accent} style={{ marginTop: 36 }}>
              {def.name}
            </AppText>
            <AppText variant="display" align="center" style={{ marginTop: 10 }}>
              {fromJournal ? formatLongDate(session.startedAt) : session.completed ? 'Session complete.' : 'Good effort.'}
            </AppText>
            <AppText variant="body" align="center" style={styles.sub}>
              {fromJournal
                ? session.completed
                  ? 'Full session.'
                  : 'Partial session — ended early.'
                : session.completed
                ? 'Take a slow breath. Your heart just did something good for its future.'
                : 'Every interval counts. This partial session has been saved to your journal.'}
            </AppText>
          </FadeIn>

          <FadeIn delay={380} style={styles.stats}>
            <Stat label="Duration" value={formatMinutes(session.durationSec)} />
            <View style={styles.statDivider} />
            <Stat label="Rounds" value={`${session.roundsCompleted}/${session.totalRounds}`} />
            <View style={styles.statDivider} />
            <Stat label="Started" value={formatTime(session.startedAt)} />
          </FadeIn>

          {session.hr ? (
            <FadeIn delay={420} style={{ alignSelf: 'stretch' }}>
              <FitnessCard session={session} isLatestWithHr={isLatestWithHr} />
            </FadeIn>
          ) : null}

          {session.hr ? (
            <FadeIn delay={450} style={styles.hrRow}>
              <Ionicons name="heart" size={14} color={colors.crimson} />
              <AppText variant="caption" color={colors.textSecondary} style={{ marginLeft: 8, flexShrink: 1 }}>
                Avg {session.hr.avg} · Peak {session.hr.max} bpm
                {session.hr.inZonePct !== null ? `  ·  ${session.hr.inZonePct}% of hard time in zone` : ''}
                {session.hr.recoveryAvg !== undefined ? `  ·  recovery −${session.hr.recoveryAvg} bpm` : ''}
              </AppText>
            </FadeIn>
          ) : null}

          {session.gps ? (
            <FadeIn delay={470} style={styles.hrRow}>
              <Ionicons name="navigate-outline" size={14} color={colors.textSecondary} />
              <AppText variant="caption" color={colors.textSecondary} style={{ marginLeft: 8, flexShrink: 1 }}>
                {formatDistance(session.gps.distanceM, unit)}
                {session.gps.workPaceSecPerKm ? `  ·  ${formatPace(session.gps.workPaceSecPerKm, unit)} hard pace` : ''}
                {session.gps.climbM >= 5 ? `  ·  ${formatClimb(session.gps.climbM, unit)} climb` : ''}
              </AppText>
            </FadeIn>
          ) : null}

          {session.gps?.hasRoute ? (
            <FadeIn delay={490} style={styles.routeCard}>
              <RouteSketch sessionId={session.id} phases={phases} />
            </FadeIn>
          ) : null}

          <FadeIn delay={500} style={{ alignSelf: 'stretch' }}>
            <RoundsTable session={session} unit={unit} accent={def.accent} />
          </FadeIn>
        </View>

        <FadeIn delay={520} style={styles.actions}>
          {logged ? (
            <View style={styles.loggedChip}>
              <Ionicons name="checkmark-circle" size={18} color={colors.sage} />
              <AppText variant="callout" color={colors.textSecondary} style={{ marginLeft: 8 }}>
                Metrics logged
              </AppText>
            </View>
          ) : (
            <GhostButton
              label="Log heart rate & VO₂"
              icon="add"
              onPress={() => router.push({ pathname: '/log', params: { sessionId: session.id } })}
            />
          )}
          <GhostButton
            label="Share workout"
            icon="share-social-outline"
            onPress={() => router.push({ pathname: '/share', params: { id: session.id } })}
          />
          <PrimaryButton label="Done" onPress={done} accent={colors.lavender} />
        </FadeIn>
      </ScrollView>
    </View>
  );
}

function formatClimb(m: number, unit: DistanceUnit): string {
  return unit === 'mi' ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`;
}

/**
 * One line per hard interval: pace and climb (GPS) and how far your heart
 * rate fell in the first minute of the recovery that followed.
 */
function RoundsTable({ session, unit, accent }: { session: SessionEntry; unit: DistanceUnit; accent: string }) {
  const work = session.gps?.stages.filter((s) => s.kind === 'work') ?? [];
  const recovery = session.hr?.recovery ?? [];
  const rounds = Math.max(work.length, recovery.length);
  if (rounds === 0) return null;
  const showPace = work.length > 0;
  const showRecovery = recovery.length > 0;
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        <AppText variant="caption" style={styles.cellRound}>Round</AppText>
        {showPace ? <AppText variant="caption" style={styles.cell}>Pace</AppText> : null}
        {showPace ? <AppText variant="caption" style={styles.cell}>Distance</AppText> : null}
        {showRecovery ? <AppText variant="caption" style={styles.cell}>HR recovery</AppText> : null}
      </View>
      {Array.from({ length: rounds }, (_, i) => {
        const w = work[i];
        const r = recovery[i];
        return (
          <View key={i} style={[styles.tableRow, styles.tableDivider]}>
            <AppText variant="callout" color={accent} style={styles.cellRound}>
              {w?.round ?? i + 1}
            </AppText>
            {showPace ? <AppText variant="callout" style={styles.cell}>{formatPace(w?.paceSecPerKm, unit)}</AppText> : null}
            {showPace ? (
              <AppText variant="callout" style={styles.cell}>
                {w ? formatDistance(w.distanceM, unit) : '—'}
              </AppText>
            ) : null}
            {showRecovery ? (
              <AppText variant="callout" style={styles.cell}>
                {r !== undefined ? `−${r} bpm` : '—'}
              </AppText>
            ) : null}
          </View>
        );
      })}
      {showRecovery ? (
        <AppText variant="caption" style={{ marginTop: 10 }}>
          HR recovery: how far your heart rate fell in the first minute after each hard interval. A bigger drop over the weeks means
          a fitter heart.
        </AppText>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="heading" style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
      <AppText variant="caption" style={{ marginTop: 4 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  routeCard: {
    alignSelf: 'stretch',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  table: {
    alignSelf: 'stretch',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tableDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  cellRound: {
    width: 52,
  },
  cell: {
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  sub: {
    marginTop: 12,
    maxWidth: 320,
  },
  stats: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: colors.hairline,
  },
  actions: {
    gap: 12,
  },
  hrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  loggedChip: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
