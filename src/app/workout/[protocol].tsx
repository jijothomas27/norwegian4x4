import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { IconButton } from '../../components/Buttons';
import { FadeIn } from '../../components/FadeIn';
import { BeatingHeart, statusColor } from '../../components/HeartRate';
import { LiveHeartRate } from '../../components/LiveHeartRate';
import { PhaseBackdrop } from '../../components/PhaseBackdrop';
import { PhaseStrip } from '../../components/PhaseStrip';
import { ProgressRing } from '../../components/ProgressRing';
import { ActionSheet, type SheetAction } from '../../components/Sheet';
import { buildPhases, getProtocol, isProtocolId, normalizeConfig } from '../../domain/protocols';
import { formatClock } from '../../domain/timeline';
import type { HrSummary } from '../../domain/hrStats';
import { buildSeries, type RawHrSample } from '../../domain/hrSeries';
import { learnMaxHr } from '../../domain/vo2';
import type { ProtocolDef, WorkoutConfig } from '../../domain/types';
import { useBackgroundSession } from '../../hooks/useBackgroundSession';
import { useIntervalTimer, type TimerResult } from '../../hooks/useIntervalTimer';
import { useWorkoutGps, type GpsResult } from '../../hooks/useWorkoutGps';
import { useWorkoutHeartRate } from '../../hooks/useWorkoutHeartRate';
import { LiveGps } from '../../components/LiveGps';
import { saveHrSeries } from '../../state/hrSeries';
import { saveRoute } from '../../state/routes';
import { cues, type CueOptions } from '../../lib/cues';
import { maxHrFor, vo2EstimateFor } from '../../state/fitness';
import { useStore } from '../../state/store';
import { colors, tones } from '../../theme/tokens';

const LEAD_IN_SECONDS = 3;
const MIN_SAVE_MS = 60_000;
const DEV_SPEED = 30;
const WAKE_TAG = 'tempo-workout';

interface HrFinish {
  summary: HrSummary | null;
  isDemo: boolean;
  samples: readonly RawHrSample[];
}

const summarizeNone = (): HrFinish => ({ summary: null, isDemo: false, samples: [] });

/** Keep the display on for the whole session (errors ignored — e.g. unsupported browsers). */
function useScreenAwake() {
  useEffect(() => {
    activateKeepAwakeAsync(WAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(WAKE_TAG).catch(() => {});
    };
  }, []);
}

export default function WorkoutRoute() {
  const params = useLocalSearchParams<{ protocol: string; warmup?: string; rounds?: string }>();
  if (!isProtocolId(params.protocol)) return <Redirect href="/" />;
  return <WorkoutScreen def={getProtocol(params.protocol)} warmup={params.warmup} rounds={params.rounds} />;
}

function WorkoutScreen({ def, warmup, rounds }: { def: ProtocolDef; warmup?: string; rounds?: string }) {
  useScreenAwake();
  const config: WorkoutConfig = useMemo(
    () =>
      normalizeConfig(def, {
        warmupMin: warmup ? Number(warmup) : undefined,
        rounds: rounds ? Number(rounds) : undefined,
      }),
    [def, warmup, rounds],
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { state, addSession, updateSettings } = useStore();

  const phases = useMemo(() => buildPhases(def, config), [def, config]);

  const cueOpts: CueOptions = { voice: state.settings.voiceCues, haptics: state.settings.haptics };

  // The heart-rate hook needs the timer's position, so it's created after the
  // timer; finish() reaches its summary through this ref.
  const hrSummaryRef = useRef<() => HrFinish>(summarizeNone);
  const gpsFinishRef = useRef<() => Promise<GpsResult | null>>(async () => null);
  const finishing = useRef(false);

  const finish = useCallback(
    async (result: TimerResult, completed: boolean) => {
      if (finishing.current) return;
      finishing.current = true;
      const { summary: hrSummary, isDemo, samples: hrSamples } = hrSummaryRef.current();
      const gpsResult = await gpsFinishRef.current().catch(() => null);
      // A sustained peak above what we knew raises the learned max HR,
      // which sharpens both the zones and the VO₂ max estimate.
      let settings = state.settings;
      const maxBefore = maxHrFor(settings);
      if (hrSummary && !isDemo) {
        const learned = learnMaxHr(settings.learnedMaxHr, hrSummary.sustainedMax || undefined);
        if (learned !== settings.learnedMaxHr) {
          settings = { ...settings, learnedMaxHr: learned, learnedMaxHrAt: result.endedAt };
          updateSettings({ learnedMaxHr: learned, learnedMaxHrAt: result.endedAt });
        }
      }
      // Bands are drawn with the max heart rate that was in effect during the workout.
      const hrSeries = buildSeries(hrSamples, phases, maxBefore?.bpm ?? null);
      const vo2 = hrSummary ? vo2EstimateFor(settings) : null;
      const maxAfter = hrSummary ? maxHrFor(settings) : null;
      const entry = addSession({
        protocolId: def.id,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        durationSec: Math.round(result.activeMs / 1000),
        roundsCompleted: result.roundsCompleted,
        totalRounds: config.rounds,
        completed,
        hr: hrSummary ?? undefined,
        hasHrSeries: hrSeries ? true : undefined,
        vo2Estimate: vo2?.value,
        maxHr: maxAfter
          ? {
              bpm: maxAfter.bpm,
              source: maxAfter.source,
              previous: maxBefore && maxAfter.bpm > maxBefore.bpm ? maxBefore.bpm : undefined,
            }
          : undefined,
        gps: gpsResult?.gps,
      });
      if (gpsResult?.gps.hasRoute) await saveRoute(entry.id, gpsResult.route).catch(() => {});
      if (hrSeries) await saveHrSeries(entry.id, hrSeries).catch(() => {});
      router.replace({ pathname: '/summary', params: { id: entry.id } });
    },
    [addSession, config.rounds, def.id, phases, router, state.settings, updateSettings],
  );

  const timer = useIntervalTimer(phases, {
    onPhaseStart: (phase) => cues.phaseStart(phase, cueOpts),
    onSecond: (secondsLeft, pos) => {
      const { phase } = pos;
      if (secondsLeft <= 3 && secondsLeft >= 1 && phase.durationSec > 10) {
        cues.countdown(secondsLeft, cueOpts);
        return;
      }
      if (phase.kind === 'work' && secondsLeft !== phase.durationSec) {
        if (secondsLeft === Math.round(phase.durationSec / 2)) cues.milestone('Halfway. Hold steady.', cueOpts);
        else if (secondsLeft === 60) cues.milestone('One minute left.', cueOpts);
      }
    },
    onComplete: (result) => {
      cues.complete(cueOpts);
      void finish(result, true);
    },
  });

  // Android: keep cues (and the heart-rate stream) going when another app is in front.
  useBackgroundSession(phases, timer, cueOpts);

  const heart = useWorkoutHeartRate(timer.position, timer.status, cueOpts, timer.positionAt, timer.toTimeline);
  const { getSummary, getSamples, isDemo } = heart;
  useEffect(() => {
    hrSummaryRef.current = () => ({ summary: getSummary(), isDemo, samples: getSamples() });
  }, [getSummary, getSamples, isDemo]);

  const gps = useWorkoutGps(def, phases, timer, timer.position, cueOpts, heart.connection === 'connected' && heart.bpm !== null);
  const gpsFinish = gps.finish;
  useEffect(() => {
    gpsFinishRef.current = gpsFinish;
  }, [gpsFinish]);

  // ── Lead-in "3 · 2 · 1" before the clock starts ───────────────────────────
  const [leadIn, setLeadIn] = useState(LEAD_IN_SECONDS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const stepLeadIn = useEffectEvent(() => {
    const next = leadIn - 1;
    if (next > 0) cues.tap(cueOpts);
    setLeadIn(next);
    if (next === 0) timer.start();
  });
  useEffect(() => {
    if (leadIn <= 0 || sheetOpen) return;
    const id = setTimeout(stepLeadIn, 1000);
    return () => clearTimeout(id);
  }, [leadIn, sheetOpen]);

  // Stop talking if the screen closes mid-sentence — except "Workout complete".
  const statusRef = useRef(timer.status);
  useEffect(() => {
    statusRef.current = timer.status;
  }, [timer.status]);
  useEffect(
    () => () => {
      if (statusRef.current !== 'complete') cues.silence();
    },
    [],
  );

  // ── End / cancel flow ──────────────────────────────────────────────────────
  const resumeOnClose = useRef(false);
  const openEndSheet = useCallback(() => {
    resumeOnClose.current = timer.status === 'running';
    if (timer.status === 'running') timer.pause();
    cues.silence();
    setSheetOpen(true);
  }, [timer]);

  const closeEndSheet = () => {
    setSheetOpen(false);
    if (resumeOnClose.current) timer.resume();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!sheetOpen) openEndSheet();
      return true;
    });
    return () => sub.remove();
  }, [openEndSheet, sheetOpen]);

  const canSave = timer.status !== 'idle' && timer.activeMs >= MIN_SAVE_MS;

  const sheetActions: SheetAction[] = [
    { label: 'Keep going', tone: 'primary', onPress: closeEndSheet },
    ...(canSave
      ? [
          {
            label: 'End & save',
            onPress: () => {
              setSheetOpen(false);
              void finish(timer.snapshot(), false);
            },
          } satisfies SheetAction,
        ]
      : []),
    {
      label: 'Discard workout',
      tone: 'destructive',
      onPress: () => {
        setSheetOpen(false);
        cues.silence();
        router.back();
      },
    },
  ];

  // ── Derived display values ────────────────────────────────────────────────
  const { position, status } = timer;
  const phase = position.phase;
  const tone = leadIn > 0 ? 'warmup' : phase.tone;
  const accent = tones[tone].accent;
  const next = phases[position.index + 1];
  const paused = status === 'paused';
  const hrShown = heart.connection !== 'none';
  // The heart-rate panel is taller than it used to be, so give the ring a little less height when it's showing.
  const ringSize = Math.max(200, Math.min(width - 72, height * (hrShown ? 0.3 : 0.34), 320));
  const clockSize = Math.min(92, Math.round(ringSize * 0.33));
  // Heart rate big in the ring (and the clock in the panel) — tap either to swap.
  const hrFocus = hrShown && state.settings.hrFocus === true;
  const hrLive = heart.connection === 'connected' && heart.bpm !== null;
  const hrTint = hrLive ? statusColor(heart.status, accent) : colors.textTertiary;
  const toggleHrFocus = () => {
    cues.tap(cueOpts);
    updateSettings({ hrFocus: !hrFocus });
  };
  const remainingTotal = timer.totalMs - timer.elapsedMs;

  const roundLabel =
    phase.round !== undefined ? `Round ${phase.round} of ${phase.totalRounds}` : phase.kind === 'warmup' ? 'Prepare' : 'Final stage';

  const toggleDevSpeed = () => {
    if (!__DEV__) return;
    timer.setSpeed(timer.speed === 1 ? DEV_SPEED : 1);
  };

  return (
    <View style={styles.root}>
      <PhaseBackdrop tone={tone} paused={paused || sheetOpen} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.topSide}>
            <AppText variant="caption" color={colors.textSecondary} style={styles.tabular}>
              {formatClock(timer.elapsedMs)}
            </AppText>
            <AppText variant="caption" color={colors.textTertiary} style={{ fontSize: 11 }}>
              elapsed
            </AppText>
          </View>
          <AppText variant="eyebrow" color={colors.textSecondary} numberOfLines={1} style={styles.topTitle}>
            {def.shortName}
          </AppText>
          <View style={[styles.topSide, { alignItems: 'flex-end' }]}>
            <AppText variant="caption" color={colors.textSecondary} style={styles.tabular}>
              {formatClock(remainingTotal)}
            </AppText>
            <AppText variant="caption" color={colors.textTertiary} style={{ fontSize: 11 }}>
              remaining
            </AppText>
          </View>
        </View>

        <PhaseStrip
          phases={phases}
          activeIndex={leadIn > 0 ? 0 : position.index}
          activeProgress={leadIn > 0 ? 0 : position.phaseProgress}
          height={3}
          gap={3}
          style={styles.strip}
        />

        {/* Centre stage */}
        <View style={styles.center}>
          {leadIn > 0 ? (
            <FadeIn key={`lead-${leadIn}`} from={0} duration={400} style={styles.centerInner}>
              <AppText variant="eyebrow" color={accent}>
                Get ready
              </AppText>
              <AppText variant="clock" style={styles.leadNumber}>
                {leadIn}
              </AppText>
              <AppText variant="body" align="center" style={styles.guidance}>
                {phases[0].title} · {formatClock(phases[0].durationSec * 1000)}
              </AppText>
            </FadeIn>
          ) : (
            <View style={styles.centerInner}>
              <FadeIn key={phase.key} from={8} duration={700} style={styles.labelBlock}>
                <AppText variant="eyebrow" color={colors.textSecondary}>
                  {roundLabel}
                </AppText>
                <AppText style={[styles.stageLabel, { color: accent }]} accessibilityRole="header" accessibilityLiveRegion="polite">
                  {phase.label.toUpperCase()}
                </AppText>
              </FadeIn>

              <ProgressRing size={ringSize} progress={position.phaseProgress} color={accent} strokeWidth={3}>
                <Pressable
                  onPress={hrShown ? toggleHrFocus : undefined}
                  onLongPress={toggleDevSpeed}
                  delayLongPress={600}
                  style={{ alignItems: 'center' }}
                  accessibilityRole={hrShown ? 'button' : undefined}
                  accessibilityHint={hrShown ? (hrFocus ? 'Shows the timer here' : 'Shows heart rate here') : undefined}
                  accessibilityLabel={
                    hrFocus
                      ? `Heart rate ${heart.bpm ?? 'unavailable'}`
                      : `${formatClock(position.phaseRemainingMs)} remaining in ${phase.title}`
                  }
                >
                  {hrFocus ? (
                    <>
                      <BeatingHeart bpm={hrLive ? heart.bpm : null} color={hrTint} size={22} />
                      <AppText
                        variant="clock"
                        maxFontSizeMultiplier={1}
                        style={[styles.tabular, { fontSize: clockSize + 8, fontWeight: '400', color: hrLive ? hrTint : colors.textTertiary }, paused && { opacity: 0.45 }]}
                      >
                        {hrLive ? heart.bpm : '—'}
                      </AppText>
                      <AppText variant="eyebrow" color={colors.textSecondary}>
                        bpm{heart.range ? `  ·  ${heart.range.low}–${heart.range.high}` : ''}
                      </AppText>
                    </>
                  ) : (
                    <AppText
                      variant="clock"
                      maxFontSizeMultiplier={1}
                      style={[styles.tabular, { fontSize: clockSize }, paused && { opacity: 0.45 }]}
                    >
                      {formatClock(position.phaseRemainingMs)}
                    </AppText>
                  )}
                </Pressable>
                {paused ? (
                  <AppText variant="eyebrow" color={colors.text} style={{ marginTop: 4 }}>
                    Paused
                  </AppText>
                ) : timer.speed !== 1 ? (
                  <AppText variant="eyebrow" color={colors.amber} style={{ marginTop: 4 }}>
                    {timer.speed}× preview
                  </AppText>
                ) : null}
              </ProgressRing>

              <FadeIn key={`${phase.key}-guide`} delay={250} style={{ alignItems: 'center' }}>
                <AppText variant="body" align="center" style={styles.guidance}>
                  {phase.guidance}
                </AppText>
                {next ? (
                  <AppText variant="caption" align="center" style={styles.next}>
                    Up next · {next.title} {formatClock(next.durationSec * 1000)}
                  </AppText>
                ) : (
                  <AppText variant="caption" align="center" style={styles.next}>
                    Last stage — almost there
                  </AppText>
                )}
              </FadeIn>
            </View>
          )}
        </View>

        {/* Live heart rate */}
        <View style={styles.hr}>
          <LiveHeartRate
            phase={phase}
            accent={accent}
            bpm={heart.bpm}
            range={heart.range}
            maxHr={heart.maxHr}
            status={heart.status}
            deviceName={heart.deviceName}
            connection={heart.connection}
            swappedClock={hrFocus ? formatClock(position.phaseRemainingMs) : null}
            onToggleFocus={toggleHrFocus}
          />
          <LiveGps
            state={gps.state}
            unit={gps.unit}
            distanceM={gps.distanceM}
            stagePaceSecPerKm={gps.stagePaceSecPerKm}
            targetPaceSecPerKm={leadIn > 0 || phase.kind !== 'work' ? null : gps.targetPaceSecPerKm}
          />
        </View>

        {/* Round dots */}
        <View style={styles.dots} accessibilityLabel={roundLabel}>
          {Array.from({ length: config.rounds }, (_, i) => {
            const round = i + 1;
            const done = (phase.round ?? (phase.kind === 'cooldown' ? config.rounds + 1 : 0)) > round ||
              (phase.round === round && phase.kind === 'rest');
            const active = phase.round === round && phase.kind === 'work';
            return (
              <View
                key={round}
                style={[
                  styles.dot,
                  done && { backgroundColor: accent, opacity: 0.85 },
                  active && { borderColor: accent, borderWidth: 1.5, backgroundColor: 'transparent', width: 10, height: 10 },
                ]}
              />
            );
          })}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <IconButton
            icon="close"
            label="End workout"
            onPress={openEndSheet}
            size={56}
            iconSize={22}
            background="rgba(255,255,255,0.07)"
          />
          <IconButton
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Resume' : 'Pause'}
            onPress={() => {
              if (leadIn > 0) return;
              cues.tap(cueOpts);
              if (paused) timer.resume();
              else timer.pause();
            }}
            size={84}
            iconSize={32}
            tint="#141218"
            background={accent}
            style={leadIn > 0 ? { opacity: 0.35 } : undefined}
          />
          <IconButton
            icon="play-skip-forward"
            label="Skip to next stage"
            onPress={() => {
              if (leadIn > 0) return;
              cues.tap(cueOpts);
              timer.skip();
            }}
            size={56}
            iconSize={20}
            background="rgba(255,255,255,0.07)"
            style={leadIn > 0 ? { opacity: 0.35 } : undefined}
          />
        </View>
      </View>

      <ActionSheet
        visible={sheetOpen}
        title="End this session?"
        message={
          canSave
            ? 'You can save what you’ve done so far — it will appear in your journal as a partial session.'
            : 'Less than a minute in, so there’s nothing to save yet.'
        }
        actions={sheetActions}
        onDismiss={closeEndSheet}
      />
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
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  topSide: {
    width: 64,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  strip: {
    marginTop: 18,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  centerInner: {
    alignItems: 'center',
  },
  labelBlock: {
    alignItems: 'center',
    marginBottom: 22,
  },
  stageLabel: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 4,
    textAlign: 'center',
  },
  leadNumber: {
    fontSize: 140,
    marginVertical: 8,
  },
  guidance: {
    marginTop: 20,
    paddingHorizontal: 16,
    color: colors.textSecondary,
  },
  next: {
    marginTop: 10,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  hr: {
    marginTop: 12,
    marginBottom: 18,
    alignItems: 'stretch',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
});
