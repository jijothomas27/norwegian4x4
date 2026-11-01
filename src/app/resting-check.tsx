import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, IconButton, PrimaryButton } from '../components/Buttons';
import { FadeIn } from '../components/FadeIn';
import { BeatingHeart } from '../components/HeartRate';
import { PhaseBackdrop } from '../components/PhaseBackdrop';
import { ProgressRing } from '../components/ProgressRing';
import { formatClock } from '../domain/timeline';
import { restingFromSamples } from '../domain/vo2';
import { DEMO_DEVICE, HR_STALE_MS, useHeartRate } from '../hr/HeartRateProvider';
import { useNow } from '../hooks/useNow';
import { useStore } from '../state/store';
import { colors } from '../theme/tokens';

const DURATION_MS = 120_000;

type Stage = 'intro' | 'measuring' | 'done';

/**
 * Two quiet minutes, sitting or lying still; resting HR is the average of the
 * final minute (the first minute lets heart rate settle).
 */
export default function RestingCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hr = useHeartRate();
  const { updateSettings } = useStore();
  const now = useNow(250);

  const [stage, setStage] = useState<Stage>('intro');
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const samples = useRef<{ at: number; bpm: number }[]>([]);

  const live = hr.status === 'connected' && hr.bpm !== null && hr.at !== null && now - hr.at < HR_STALE_MS;

  // Collect every reading while measuring.
  const collect = useEffectEvent(() => {
    if (stage === 'measuring' && hr.bpm !== null && hr.at !== null) samples.current.push({ at: hr.at, bpm: hr.bpm });
  });
  useEffect(() => {
    collect();
  }, [hr.at]);

  const finish = useEffectEvent(() => {
    setResult(restingFromSamples(samples.current));
    setStage('done');
  });
  useEffect(() => {
    if (stage !== 'measuring') return;
    const id = setTimeout(finish, DURATION_MS);
    return () => clearTimeout(id);
  }, [stage]);

  const start = () => {
    samples.current = [];
    if (hr.device?.id === DEMO_DEVICE.id) hr.setDemoTarget(56);
    setStartedAt(Date.now());
    setResult(null);
    setStage('measuring');
  };

  const elapsed = stage === 'measuring' ? Math.min(DURATION_MS, now - startedAt) : 0;

  return (
    <View style={styles.root}>
      <PhaseBackdrop tone="recover" paused={stage !== 'measuring'} />
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <AppText variant="eyebrow" color={colors.textSecondary}>
            Resting heart rate
          </AppText>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        <View style={styles.center}>
          <ProgressRing size={260} progress={elapsed / DURATION_MS} color={colors.teal} strokeWidth={2}>
            {stage === 'done' ? (
              <FadeIn from={0} style={{ alignItems: 'center' }}>
                <AppText variant="clock" style={{ fontSize: 72 }}>
                  {result ?? '—'}
                </AppText>
                <AppText variant="caption">bpm at rest</AppText>
              </FadeIn>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <BeatingHeart bpm={live ? hr.bpm : null} color={live ? colors.teal : colors.textTertiary} size={24} />
                <AppText variant="clock" style={{ fontSize: 64, marginTop: 6 }}>
                  {live ? hr.bpm : '—'}
                </AppText>
                <AppText variant="caption">
                  {stage === 'measuring' ? formatClock(DURATION_MS - elapsed) : 'live bpm'}
                </AppText>
              </View>
            )}
          </ProgressRing>

          <AppText variant="body" align="center" style={styles.copy}>
            {stage === 'intro'
              ? 'Best first thing in the morning. Sit or lie down, stay still and breathe normally for two minutes. The final minute is averaged.'
              : stage === 'measuring'
                ? 'Stay still. Let your breathing slow down…'
                : result
                  ? 'Use this as your resting heart rate? It’s used for your VO₂ max estimate.'
                  : 'Not enough readings came through. Check the watch is broadcasting and try again.'}
          </AppText>
        </View>

        {!live && stage !== 'done' ? (
          <View style={{ gap: 12 }}>
            <AppText variant="caption" align="center">
              Needs a connected heart-rate sensor.
            </AppText>
            <PrimaryButton label="Connect sensor" accent={colors.teal} onPress={() => router.push('/heart-rate')} />
          </View>
        ) : stage === 'intro' ? (
          <PrimaryButton label="Start" trailing="2 min" accent={colors.teal} onPress={start} />
        ) : stage === 'measuring' ? (
          <GhostButton label="Cancel" onPress={() => setStage('intro')} />
        ) : (
          <View style={{ gap: 12 }}>
            {result ? (
              <PrimaryButton
                label="Save"
                trailing={`${result} bpm`}
                accent={colors.teal}
                onPress={() => {
                  updateSettings({ restingHr: result, restingHrAt: Date.now() });
                  router.back();
                }}
              />
            ) : null}
            <GhostButton label="Measure again" onPress={start} />
          </View>
        )}
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    marginTop: 36,
    maxWidth: 320,
  },
});
