import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, IconButton, PrimaryButton } from '../components/Buttons';
import { ToggleRow } from '../components/Controls';
import { BeatingHeart } from '../components/HeartRate';
import { PressableScale } from '../components/PressableScale';
import { buildPhases, PROTOCOL_LIST } from '../domain/protocols';
import { bpmRange, estimateMaxHrFromAge } from '../domain/zones';
import { DEMO_DEVICE, HR_STALE_MS, useHeartRate, type FoundDevice } from '../hr/HeartRateProvider';
import { useNow } from '../hooks/useNow';
import { formatNumber, formatShortDate } from '../lib/format';
import { maxHrFor, vo2EstimateFor } from '../state/fitness';
import { useStore } from '../state/store';
import { colors, radius, space, tones } from '../theme/tokens';

export default function HeartRateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, updateSettings } = useStore();
  const { settings } = state;

  const [ageText, setAgeText] = useState(settings.age ? String(settings.age) : '');
  const [maxText, setMaxText] = useState(settings.maxHr ? String(settings.maxHr) : '');
  const [restText, setRestText] = useState(settings.restingHr ? String(settings.restingHr) : '');
  // Re-sync the fields when stored data arrives (cold start) or the resting
  // check saves a new value while this screen is underneath it.
  const [synced, setSynced] = useState({ hydrated: state.hydrated, resting: settings.restingHr });
  if (state.hydrated !== synced.hydrated || settings.restingHr !== synced.resting) {
    setSynced({ hydrated: state.hydrated, resting: settings.restingHr });
    setRestText(settings.restingHr ? String(settings.restingHr) : '');
    if (state.hydrated !== synced.hydrated) {
      setAgeText(settings.age ? String(settings.age) : '');
      setMaxText(settings.maxHr ? String(settings.maxHr) : '');
    }
  }
  const estimate = vo2EstimateFor(settings);

  const maxHr = maxHrFor(settings);

  const saveAge = (text: string) => {
    setAgeText(text);
    const n = parseInt(text, 10);
    updateSettings({ age: n >= 12 && n <= 100 ? n : undefined });
  };
  const saveRest = (text: string) => {
    setRestText(text);
    const n = parseInt(text, 10);
    const valid = n >= 30 && n <= 100;
    setSynced((x) => ({ ...x, resting: valid ? n : undefined }));
    updateSettings({ restingHr: valid ? n : undefined, restingHrAt: valid ? Date.now() : undefined });
  };
  const saveMax = (text: string) => {
    setMaxText(text);
    const n = parseInt(text, 10);
    updateSettings({ maxHr: n >= 120 && n <= 230 ? n : undefined });
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="eyebrow">Live training</AppText>
            <AppText variant="title" style={{ marginTop: 8 }}>
              Heart rate
            </AppText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        <AppText variant="body" style={{ marginTop: 12 }}>
          Stream your heart rate from your watch or a chest strap and Tempo will show your target zone for every stage — and
          nudge you when you drift out of it.
        </AppText>

        <SensorSection />

        {/* Max heart rate & zones */}
        <AppText variant="eyebrow" style={styles.section}>
          Your zones
        </AppText>
        <View style={styles.card}>
          <View style={styles.inputRow}>
            <View style={styles.inputLabel}>
              <AppText variant="callout">Age</AppText>
              <AppText variant="caption">Estimates max heart rate</AppText>
            </View>
            <TextInput
              value={ageText}
              onChangeText={saveAge}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="—"
              placeholderTextColor={colors.textFaint}
              style={styles.numberInput}
              selectionColor={colors.lavender}
              accessibilityLabel="Age in years"
            />
          </View>
          <View style={[styles.inputRow, styles.divider]}>
            <View style={styles.inputLabel}>
              <AppText variant="callout">Measured max HR</AppText>
              <AppText variant="caption">Optional — more accurate if you know it</AppText>
            </View>
            <TextInput
              value={maxText}
              onChangeText={saveMax}
              keyboardType="number-pad"
              maxLength={3}
              placeholder={settings.age ? String(estimateMaxHrFromAge(settings.age)) : '—'}
              placeholderTextColor={colors.textFaint}
              style={styles.numberInput}
              selectionColor={colors.lavender}
              accessibilityLabel="Measured maximum heart rate in beats per minute"
            />
          </View>
          <View style={[styles.inputRow, styles.divider]}>
            <View style={styles.inputLabel}>
              <AppText variant="callout">Resting HR</AppText>
              <AppText variant="caption">
                {settings.restingHrAt ? `Updated ${formatShortDate(settings.restingHrAt)} · ` : ''}Garmin Connect shows yours, or{' '}
              </AppText>
              <PressableScale onPress={() => router.push('/resting-check')} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <AppText variant="caption" color={colors.teal} style={{ fontWeight: '600' }}>
                  measure it now (2 min)
                </AppText>
              </PressableScale>
            </View>
            <TextInput
              value={restText}
              onChangeText={saveRest}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="—"
              placeholderTextColor={colors.textFaint}
              style={styles.numberInput}
              selectionColor={colors.lavender}
              accessibilityLabel="Resting heart rate in beats per minute"
            />
          </View>
        </View>

        {maxHr ? (
          <View style={[styles.card, { marginTop: 12, paddingVertical: 16 }]}>
            <AppText variant="caption">
              Using <AppText variant="caption" color={colors.text}>{maxHr.bpm} bpm</AppText> max
              {maxHr.source === 'age'
                ? ' (estimated: 208 − 0.7 × age — rises automatically if your workouts show it’s higher)'
                : maxHr.source === 'workouts'
                  ? ` (highest held for 10 s in your workouts${settings.learnedMaxHrAt ? `, ${formatShortDate(settings.learnedMaxHrAt)}` : ''})`
                  : ' (measured)'}
            </AppText>
            {settings.learnedMaxHr ? (
              <PressableScale
                onPress={() => updateSettings({ learnedMaxHr: undefined, learnedMaxHrAt: undefined })}
                accessibilityRole="button"
                style={{ alignSelf: 'flex-start', marginTop: 6 }}
              >
                <AppText variant="caption" color={colors.textSecondary}>
                  Reset learned max ({settings.learnedMaxHr})
                </AppText>
              </PressableScale>
            ) : null}
            {PROTOCOL_LIST.map((p) => {
              const [, work, rest] = buildPhases(p);
              return (
                <View key={p.id} style={{ marginTop: 16 }}>
                  <AppText variant="eyebrow" color={p.accent}>
                    {p.name}
                  </AppText>
                  {[work, rest].map((ph) => {
                    const r = bpmRange(ph.target, maxHr.bpm);
                    return (
                      <View key={ph.key} style={styles.zoneRow}>
                        <View style={[styles.dot, { backgroundColor: tones[ph.tone].accent }]} />
                        <AppText variant="callout" style={{ flex: 1 }}>
                          {ph.title}
                        </AppText>
                        <AppText variant="caption" style={{ marginRight: 12 }}>
                          {Math.round(ph.target.low * 100)}–{Math.round(ph.target.high * 100)}%
                        </AppText>
                        <AppText variant="callout" color={tones[ph.tone].accent} style={styles.tabular}>
                          {r.low}–{r.high}
                        </AppText>
                      </View>
                    );
                  })}
                </View>
              );
            })}
            <AppText variant="caption" style={{ marginTop: 16 }}>
              Interval Walking is defined by effort rather than heart rate, so its zones are approximate — use the talk test
              too. Heart rate lags effort by a minute or two, so Tempo waits before correcting you.
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" style={{ marginTop: 12 }}>
            Add your age to see your personal targets.
          </AppText>
        )}

        <AppText variant="eyebrow" style={styles.section}>
          VO₂ max estimate
        </AppText>
        <View style={[styles.card, { paddingVertical: 18 }]}>
          {estimate ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <AppText variant="metric">{formatNumber(estimate.value)}</AppText>
              <AppText variant="caption" style={{ marginLeft: 8 }}>
                ± {estimate.uncertainty} mL/kg/min
              </AppText>
            </View>
          ) : (
            <AppText variant="callout" color={colors.textSecondary}>
              {maxHr ? 'Add your resting heart rate to see an estimate.' : 'Add your age and resting heart rate to see an estimate.'}
            </AppText>
          )}
          <AppText variant="caption" style={{ marginTop: 10 }}>
            Heart-rate ratio method (Uth et al., 2004): 15.3 × max HR ÷ resting HR. It improves as your max HR is learned
            from hard intervals and your resting HR falls with fitness.{' '}
            {settings.vo2Factor
              ? `Calibrated to your logged reading (factor ${settings.vo2Factor}).`
              : 'Log a VO₂ max from your Garmin once and Tempo will calibrate the formula to you.'}{' '}
            Treat it as a trend, not a lab value.
          </AppText>
        </View>

        <AppText variant="eyebrow" style={styles.section}>
          Coaching
        </AppText>
        <View style={[styles.card, { paddingVertical: 4 }]}>
          <ToggleRow
            label="Voice coaching"
            hint="“Push a little harder” / “Ease off” when you drift out of zone"
            value={settings.voiceCoaching}
            onChange={(voiceCoaching) => updateSettings({ voiceCoaching })}
          />
        </View>

        <GarminGuide />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SensorSection() {
  const hr = useHeartRate();
  const now = useNow(1000);
  const live = hr.status === 'connected' && hr.at !== null && now - hr.at < HR_STALE_MS;
  const showDemo = __DEV__ || !hr.bleAvailable;
  const scanning = hr.status === 'scanning';

  const statusLine = (() => {
    switch (hr.status) {
      case 'connected':
        return live ? 'Connected' : 'Connected — waiting for data';
      case 'connecting':
        return 'Connecting…';
      case 'reconnecting':
        return 'Signal lost — reconnecting…';
      case 'scanning':
        return 'Searching…';
      case 'bluetooth-off':
        return 'Bluetooth is off';
      case 'permission-denied':
        return 'Nearby-devices permission needed (Android Settings → Apps → Tempo → Permissions)';
      case 'unavailable':
        return 'Bluetooth needs the installed app (it isn’t available in Expo Go or the browser)';
      default:
        return hr.device ? 'Not connected' : 'No sensor yet';
    }
  })();

  return (
    <>
      <AppText variant="eyebrow" style={styles.section}>
        Sensor
      </AppText>
      <View style={styles.card}>
        <View style={styles.sensorHead}>
          <View style={[styles.sensorIcon, live && { backgroundColor: 'rgba(255,90,110,0.14)' }]}>
            <BeatingHeart bpm={live ? hr.bpm : null} color={live ? colors.crimson : colors.textTertiary} size={22} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <AppText variant="callout">{hr.device?.name ?? 'Heart-rate sensor'}</AppText>
            <AppText variant="caption">{statusLine}</AppText>
          </View>
          {live ? (
            <AppText style={styles.liveBpm} accessibilityLabel={`${hr.bpm} beats per minute`}>
              {hr.bpm}
            </AppText>
          ) : null}
        </View>

        {hr.error ? (
          <AppText variant="caption" color={colors.amber} style={{ marginTop: 12 }}>
            {hr.error}
          </AppText>
        ) : null}

        <View style={styles.sensorActions}>
          {hr.device && (hr.status === 'connected' || hr.status === 'reconnecting' || hr.status === 'connecting') ? (
            <>
              <View style={styles.flex}>
                <GhostButton label="Disconnect" onPress={hr.disconnect} />
              </View>
              <View style={styles.flex}>
                <GhostButton label="Forget" onPress={hr.forget} color={colors.textSecondary} />
              </View>
            </>
          ) : (
            <>
              {hr.bleAvailable ? (
                <View style={styles.flex}>
                  <PrimaryButton
                    label={scanning ? 'Searching…' : hr.device ? 'Search again' : 'Find my watch'}
                    onPress={() => (scanning ? hr.stopScan() : void hr.scan())}
                    accent={colors.crimson}
                  />
                </View>
              ) : null}
              {hr.device && hr.device.id !== DEMO_DEVICE.id && hr.bleAvailable && !scanning ? (
                <View style={styles.flex}>
                  <GhostButton label={`Connect ${hr.device.name}`} onPress={() => void hr.connect(hr.device!)} />
                </View>
              ) : null}
            </>
          )}
        </View>

        {hr.found.length > 0 && hr.status !== 'connected' ? (
          <View style={{ marginTop: 8 }}>
            {hr.found.map((d) => (
              <DeviceRow key={d.id} device={d} onPress={() => void hr.connect({ id: d.id, name: d.name })} />
            ))}
          </View>
        ) : null}

        {hr.bleAvailable && hr.scanDone && !scanning && hr.status !== 'connected' && !hr.found.some((d) => d.heartRate) ? (
          <View style={styles.trouble}>
            <AppText variant="callout">No heart-rate broadcast found</AppText>
            {[
              'On the watch: hold the bottom button › Settings › Wrist Heart Rate › Broadcast. The watch should show a broadcasting screen — keep it there.',
              'If your watch is listed above as “Paired with this phone”, tap it — Tempo can use the existing connection.',
              'Still nothing? Choose Broadcast In Activity instead and start any activity on the watch (e.g. Walk). Some Garmin firmware only advertises during an activity.',
              'Close other apps that might be using the broadcast (Zwift, Strava, a bike computer) — the watch accepts few connections at once.',
            ].map((t, i) => (
              <View key={t} style={[styles.step, { marginTop: 10 }]}>
                <View style={styles.stepNum}>
                  <AppText variant="caption" color={colors.text} style={{ fontSize: 12 }}>
                    {i + 1}
                  </AppText>
                </View>
                <AppText variant="caption" style={{ flex: 1, lineHeight: 19 }}>
                  {t}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {hr.bleAvailable && hr.status === 'idle' && hr.found.length === 0 && hr.device === null && !hr.scanDone ? (
          <AppText variant="caption" style={{ marginTop: 12 }}>
            Turn on heart-rate broadcast on your watch first (see below), then tap Find my watch.
          </AppText>
        ) : null}

        {hr.bleAvailable && !scanning && hr.status !== 'connected' ? (
          <PressableScale onPress={() => void hr.scan({ all: true })} style={styles.textLink} accessibilityRole="button">
            <AppText variant="caption" color={colors.textSecondary}>
              Not listed? Show all nearby Bluetooth devices
            </AppText>
          </PressableScale>
        ) : null}

        {showDemo && hr.device?.id !== DEMO_DEVICE.id ? (
          <PressableScale onPress={() => void hr.connect(DEMO_DEVICE)} style={styles.textLink} accessibilityRole="button">
            <AppText variant="caption" color={colors.lavender}>
              No watch handy? Try the demo sensor
            </AppText>
          </PressableScale>
        ) : null}
      </View>
    </>
  );
}

function DeviceRow({ device, onPress }: { device: FoundDevice; onPress: () => void }) {
  const bars = device.rssi > -60 ? 3 : device.rssi > -75 ? 2 : 1;
  return (
    <PressableScale onPress={onPress} style={styles.deviceRow} accessibilityRole="button" accessibilityLabel={`Connect to ${device.name}`}>
      <Ionicons name={device.heartRate ? 'heart' : 'bluetooth'} size={16} color={device.heartRate ? colors.crimson : colors.textTertiary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <AppText variant="callout" numberOfLines={1}>
          {device.name}
        </AppText>
        {device.paired || device.heartRate ? (
          <AppText variant="caption" style={{ fontSize: 12 }}>
            {device.heartRate ? 'Broadcasting heart rate' : 'Paired with this phone — tap to try'}
          </AppText>
        ) : null}
      </View>
      <View style={styles.bars}>
        {[1, 2, 3].map((b) => (
          <View key={b} style={[styles.bar, { height: 4 + b * 3 }, b <= bars && { backgroundColor: colors.textSecondary }]} />
        ))}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 12 }} />
    </PressableScale>
  );
}

function GarminGuide() {
  const steps = [
    'Update your watch in Garmin Connect — Bluetooth heart-rate broadcast arrived in Venu 2 software 5.27.',
    'On the watch, hold the bottom button, then open Settings (gear) › Wrist Heart Rate.',
    'Choose Broadcast to start now — or Broadcast In Activity to broadcast whenever you start a timed activity on the watch.',
    'Keep the watch within a few metres of your phone. Tempo connects directly — no need to pair it in Android’s Bluetooth settings.',
    'Turn broadcasting off afterwards; it uses extra watch battery.',
  ];
  return (
    <>
      <AppText variant="eyebrow" style={styles.section}>
        Garmin Venu 2 setup
      </AppText>
      <View style={[styles.card, { paddingVertical: 16 }]}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.step, i > 0 && { marginTop: 12 }]}>
            <View style={styles.stepNum}>
              <AppText variant="caption" color={colors.text} style={{ fontSize: 12 }}>
                {i + 1}
              </AppText>
            </View>
            <AppText variant="body" style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>
              {s}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" style={{ marginTop: 16 }}>
          Any standard Bluetooth heart-rate sensor works the same way — Polar, Wahoo and Garmin chest straps, Coros, Suunto and
          most other watches with a broadcast mode.
        </AppText>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  section: {
    marginTop: space.xl,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 20,
  },
  sensorHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sensorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBpm: {
    fontSize: 34,
    fontWeight: '200',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  sensorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  textLink: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  inputLabel: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    marginTop: 8,
    paddingTop: 8,
  },
  flex: {
    flex: 1,
  },
  numberInput: {
    width: 96,
    textAlign: 'right',
    fontSize: 28,
    fontWeight: '300',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 12,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
    minWidth: 64,
    textAlign: 'right',
  },
  trouble: {
    marginTop: 16,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,179,71,0.07)',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
});
