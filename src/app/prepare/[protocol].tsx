import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requestWorkoutLocationPermission, requestWorkoutNotificationPermission } from '../../../modules/tempo-workout';
import { AppText } from '../../components/AppText';
import { IconButton, PrimaryButton } from '../../components/Buttons';
import { Segmented, Stepper, ToggleRow } from '../../components/Controls';
import { FadeIn } from '../../components/FadeIn';
import { PhaseStrip } from '../../components/PhaseStrip';
import { PressableScale } from '../../components/PressableScale';
import { buildPhases, getProtocol, isProtocolId } from '../../domain/protocols';
import { formatClock, formatMinutes, totalDurationMs } from '../../domain/timeline';
import type { HrTarget, ProtocolDef, WorkoutConfig } from '../../domain/types';
import { bpmRange } from '../../domain/zones';
import { useHeartRate } from '../../hr/HeartRateProvider';
import { useStore } from '../../state/store';
import { colors, radius, space, tones } from '../../theme/tokens';
import { maxHrFor } from '../../state/fitness';

export default function PrepareRoute() {
  const { protocol } = useLocalSearchParams<{ protocol: string }>();
  if (!isProtocolId(protocol)) return <Redirect href="/" />;
  return <PrepareScreen def={getProtocol(protocol)} />;
}

function PrepareScreen({ def }: { def: ProtocolDef }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, updateSettings } = useStore();
  const [config, setConfig] = useState<WorkoutConfig>(def.defaults);

  const phases = useMemo(() => buildPhases(def, config), [def, config]);
  const totalSec = totalDurationMs(phases) / 1000;
  const hr = useHeartRate();
  const maxHr = maxHrFor(state.settings);
  const zone = (t: HrTarget) => {
    if (!maxHr) return null;
    const r = bpmRange(t, maxHr.bpm);
    return `${r.low}–${r.high} bpm`;
  };
  const hrLine = (() => {
    const sensor = hr.device
      ? `${hr.device.name} · ${hr.status === 'connected' ? 'connected' : 'not connected'}`
      : 'Connect your watch for live zones';
    const src = maxHr?.source === 'age' ? ' (from age)' : maxHr?.source === 'workouts' ? ' (from your workouts)' : '';
    const max = maxHr ? `Max ${maxHr.bpm} bpm${src}` : 'Add your age to see targets';
    return { sensor, max };
  })();

  const begin = async () => {
    await requestWorkoutNotificationPermission();
    await requestWorkoutLocationPermission();
    router.push({
      pathname: '/workout/[protocol]',
      params: { protocol: def.id, warmup: String(config.warmupMin), rounds: String(config.rounds) },
    });
  };

  const structure = [
    { tone: def.warmup.tone, title: def.warmup.title, detail: def.warmup.guidance, time: formatClock(config.warmupMin * 60_000), zone: zone(def.warmup.target) },
    { tone: def.work.tone, title: def.work.title, detail: def.work.guidance, time: `${config.rounds} × ${formatClock(def.workSec * 1000)}`, zone: zone(def.work.target) },
    { tone: def.rest.tone, title: def.rest.title, detail: def.rest.guidance, time: `${config.rounds} × ${formatClock(def.restSec * 1000)}`, zone: zone(def.rest.target) },
    { tone: def.cooldown.tone, title: def.cooldown.title, detail: def.cooldown.guidance, time: formatClock(def.cooldownSec * 1000), zone: zone(def.cooldown.target) },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[def.cardGradient[0], def.cardGradient[1], colors.bg]}
        locations={[0, 0.28, 0.6]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 128 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pad}>
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />

          <FadeIn style={styles.hero}>
            <AppText variant="eyebrow" color={def.accent}>
              {def.eyebrow}
            </AppText>
            <AppText variant="display" style={styles.title}>
              {def.name}
            </AppText>
            <AppText variant="body" style={styles.tagline}>
              {def.tagline}
            </AppText>
          </FadeIn>

          <FadeIn delay={100} style={styles.durationBlock}>
            <View style={styles.durationRow}>
              <AppText variant="metric" style={styles.durationValue}>
                {Math.round(totalSec / 60)}
              </AppText>
              <AppText variant="callout" color={colors.textSecondary} style={styles.durationUnit}>
                minutes
              </AppText>
            </View>
            <PhaseStrip phases={phases} height={6} gap={3} style={styles.strip} />
          </FadeIn>

          {/* Structure */}
          <FadeIn delay={180}>
            <AppText variant="eyebrow" style={styles.section}>
              The session
            </AppText>
            <View style={styles.card}>
              {structure.map((s, i) => (
                <View key={s.title} style={[styles.stageRow, i > 0 && styles.stageDivider]}>
                  <View style={[styles.stageDot, { backgroundColor: tones[s.tone].accent }]} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout">{s.title}</AppText>
                    <AppText variant="caption" style={{ marginTop: 2 }}>
                      {s.detail}
                    </AppText>
                  </View>
                  <View style={styles.stageRight}>
                    <AppText variant="callout" color={colors.textSecondary} style={styles.stageTime}>
                      {s.time}
                    </AppText>
                    {s.zone ? (
                      <AppText variant="caption" color={tones[s.tone].accent} style={styles.stageZone}>
                        {s.zone}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </FadeIn>

          {/* Adjustments */}
          {(def.warmupOptions.length > 1 || def.roundOptions.length > 1) && (
            <FadeIn delay={240}>
              <AppText variant="eyebrow" style={styles.section}>
                Adjust
              </AppText>
              <View style={styles.card}>
                {def.warmupOptions.length > 1 && (
                  <View style={styles.adjustRow}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="callout">Warm-up</AppText>
                      <AppText variant="caption">Longer if you’re stiff or it’s cold</AppText>
                    </View>
                    <Stepper
                      value={config.warmupMin}
                      options={def.warmupOptions}
                      onChange={(warmupMin) => setConfig((c) => ({ ...c, warmupMin }))}
                      format={(v) => `${v} min`}
                      accessibilityLabel="Warm-up length"
                    />
                  </View>
                )}
                {def.roundOptions.length > 1 && (
                  <View style={[styles.adjustRow, def.warmupOptions.length > 1 && styles.stageDivider]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="callout">Rounds</AppText>
                      <AppText variant="caption">Fast + slow walking pairs</AppText>
                    </View>
                    <View style={{ width: 132 }}>
                      <Segmented
                        options={def.roundOptions.map((r) => ({ value: r, label: String(r) }))}
                        value={config.rounds}
                        onChange={(rounds) => setConfig((c) => ({ ...c, rounds }))}
                        accent={def.accent}
                        accessibilityLabel="Number of rounds"
                      />
                    </View>
                  </View>
                )}
              </View>
            </FadeIn>
          )}

          {/* Heart rate */}
          <FadeIn delay={270}>
            <AppText variant="eyebrow" style={styles.section}>
              Heart rate
            </AppText>
            <PressableScale
              onPress={() => router.push('/heart-rate')}
              accessibilityRole="button"
              accessibilityLabel={`Heart rate settings. ${hrLine.sensor}. ${hrLine.max}`}
              style={[styles.card, styles.hrCard]}
            >
              <View style={[styles.hrIcon, hr.status === 'connected' && { backgroundColor: 'rgba(255,90,110,0.14)' }]}>
                <Ionicons
                  name={hr.status === 'connected' ? 'heart' : 'heart-outline'}
                  size={18}
                  color={hr.status === 'connected' ? colors.crimson : colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="callout">{hrLine.sensor}</AppText>
                <AppText variant="caption">{hrLine.max}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </PressableScale>
          </FadeIn>

          {/* Cues */}
          <FadeIn delay={300}>
            <AppText variant="eyebrow" style={styles.section}>
              Cues
            </AppText>
            <View style={[styles.card, { paddingVertical: 4 }]}>
              <ToggleRow
                label="Voice guidance"
                hint="Spoken stage changes and countdowns"
                value={state.settings.voiceCues}
                onChange={(voiceCues) => updateSettings({ voiceCues })}
                accent={def.accent}
              />
              <View style={styles.stageDivider} />
              <ToggleRow
                label="Haptics"
                hint="Gentle taps at every transition"
                value={state.settings.haptics}
                onChange={(haptics) => updateSettings({ haptics })}
                accent={def.accent}
              />
              <View style={styles.stageDivider} />
              <PressableScale onPress={() => router.push('/voice')} accessibilityRole="button" style={styles.linkRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="callout">Voice & units</AppText>
                  <AppText variant="caption">Choose a more natural voice · miles or kilometres</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </PressableScale>
            </View>
          </FadeIn>

          {/* Overview */}
          <FadeIn delay={360}>
            <AppText variant="eyebrow" style={styles.section}>
              About this protocol
            </AppText>
            <AppText variant="body">{def.overview}</AppText>
            <View style={{ marginTop: space.md, gap: 12 }}>
              {def.principles.map((p) => (
                <View key={p} style={styles.principle}>
                  <View style={[styles.principleDot, { backgroundColor: def.accent }]} />
                  <AppText variant="body" style={{ flex: 1 }}>
                    {p}
                  </AppText>
                </View>
              ))}
            </View>
          </FadeIn>
        </View>
      </ScrollView>

      <LinearGradient
        colors={['rgba(18,18,20,0)', colors.bg]}
        locations={[0, 0.45]}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        <PrimaryButton label="Begin" trailing={formatMinutes(totalSec)} accent={def.accent} onPress={begin} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pad: {
    paddingHorizontal: 20,
  },
  hero: {
    marginTop: space.xl,
  },
  title: {
    marginTop: 10,
  },
  tagline: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 25,
  },
  durationBlock: {
    marginTop: space.xl,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  durationValue: {
    fontSize: 56,
    letterSpacing: -2,
  },
  durationUnit: {
    marginLeft: 10,
  },
  strip: {
    marginTop: 16,
  },
  section: {
    marginTop: space.xl + 4,
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(26,26,30,0.85)',
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  stageDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 14,
  },
  stageRight: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  stageTime: {
    fontVariant: ['tabular-nums'],
  },
  stageZone: {
    marginTop: 2,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  hrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  hrIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  principle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  principleDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginRight: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 36,
  },
});
