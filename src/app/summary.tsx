import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { FadeIn } from '../components/FadeIn';
import { PhaseBackdrop } from '../components/PhaseBackdrop';
import { ProgressRing } from '../components/ProgressRing';
import { getProtocol } from '../domain/protocols';
import { formatMinutes } from '../domain/timeline';
import { formatTime } from '../lib/format';
import { useStore } from '../state/store';
import { colors, radius } from '../theme/tokens';

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const logged = state.metrics.some((m) => m.sessionId === session.id);

  function done() {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  }

  return (
    <View style={styles.root}>
      <PhaseBackdrop tone="complete" />
      <View style={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
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
              {session.completed ? 'Session complete.' : 'Good effort.'}
            </AppText>
            <AppText variant="body" align="center" style={styles.sub}>
              {session.completed
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
          <PrimaryButton label="Done" onPress={done} accent={colors.lavender} />
        </FadeIn>
      </View>
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
    flex: 1,
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  loggedChip: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
