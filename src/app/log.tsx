import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode, type Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton, PrimaryButton } from '../components/Buttons';
import { Segmented } from '../components/Controls';
import { getProtocol } from '../domain/protocols';
import { formatDayHeading, formatNumber, formatTime, kgToUnit, unitToKg } from '../lib/format';
import type { WeightUnit } from '../state/model';
import { metricSeries } from '../state/selectors';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme/tokens';
import { useNow } from '../hooks/useNow';

/** Plausible human ranges — anything outside is almost certainly a typo. */
const RANGES = {
  vo2max: { min: 10, max: 95, label: 'VO₂ max' },
  weightKg: { min: 25, max: 300, label: 'Weight' },
  heartRate: { min: 40, max: 230, label: 'Heart rate' },
} as const;

function parseDecimal(text: string): number | undefined {
  const cleaned = text.replace(',', '.').trim();
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export default function LogScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, addMetric, updateSettings } = useStore();
  const unit = state.settings.weightUnit;

  const [vo2, setVo2] = useState('');
  const [weight, setWeight] = useState('');
  const [hr, setHr] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const weightRef = useRef<TextInputInstance>(null);
  const hrRef = useRef<TextInputInstance>(null);
  const notesRef = useRef<TextInputInstance>(null);

  const session = sessionId ? state.sessions.find((s) => s.id === sessionId) : undefined;
  const lastVo2 = metricSeries(state.metrics, 'vo2max').at(-1);
  const lastWeight = metricSeries(state.metrics, 'weightKg').at(-1);

  const now = useNow();
  const hasInput = [vo2, weight, hr, notes].some((v) => v.trim() !== '');

  const changeUnit = (next: WeightUnit) => {
    if (next === unit) return;
    // Convert anything already typed so the number stays meaningful.
    const w = parseDecimal(weight);
    if (w !== undefined && !Number.isNaN(w)) {
      setWeight(formatNumber(kgToUnit(unitToKg(w, unit), next)));
    }
    updateSettings({ weightUnit: next });
  };

  const save = () => {
    const vo2max = parseDecimal(vo2);
    const weightRaw = parseDecimal(weight);
    const heartRate = parseDecimal(hr);
    const weightKg = weightRaw === undefined || Number.isNaN(weightRaw) ? weightRaw : unitToKg(weightRaw, unit);

    const checks: [number | undefined, (typeof RANGES)[keyof typeof RANGES]][] = [
      [vo2max, RANGES.vo2max],
      [weightKg, RANGES.weightKg],
      [heartRate, RANGES.heartRate],
    ];
    for (const [value, range] of checks) {
      if (value === undefined) continue;
      if (Number.isNaN(value)) return setError(`${range.label} doesn’t look like a number.`);
      if (value < range.min || value > range.max) return setError(`${range.label} looks unusual — please double-check it.`);
    }

    addMetric({
      vo2max: vo2max !== undefined ? Math.round(vo2max * 10) / 10 : undefined,
      weightKg: weightKg !== undefined ? Math.round(weightKg * 100) / 100 : undefined,
      heartRate: heartRate !== undefined ? Math.round(heartRate) : undefined,
      notes: notes.trim() || undefined,
      sessionId: session?.id,
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="eyebrow">
              {formatDayHeading(now)} · {formatTime(now)}
            </AppText>
            <AppText variant="title" style={{ marginTop: 8 }}>
              Log metrics
            </AppText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        {session ? (
          <View style={styles.linked}>
            <View style={[styles.linkedDot, { backgroundColor: getProtocol(session.protocolId).accent }]} />
            <AppText variant="caption" color={colors.textSecondary}>
              Linked to today’s {getProtocol(session.protocolId).name}
            </AppText>
          </View>
        ) : null}

        <View style={styles.fields}>
          <MetricField
            label="VO₂ max"
            unit="mL/kg/min"
            hint={lastVo2 ? `Last: ${formatNumber(lastVo2.value)}` : 'From your watch or a lab test'}
            value={vo2}
            onChangeText={(t) => {
              setVo2(t);
              setError(null);
            }}
            placeholder="—"
            returnKeyType="next"
            onSubmitEditing={() => weightRef.current?.focus()}
            accent={colors.cyan}
          />

          <MetricField
            ref={weightRef}
            label="Body weight"
            unit={unit}
            hint={lastWeight ? `Last: ${formatNumber(kgToUnit(lastWeight.value, unit))} ${unit}` : 'Same time of day is most comparable'}
            value={weight}
            onChangeText={(t) => {
              setWeight(t);
              setError(null);
            }}
            placeholder="—"
            returnKeyType="next"
            onSubmitEditing={() => hrRef.current?.focus()}
            accent={colors.lavender}
            accessory={
              <View style={{ width: 112 }}>
                <Segmented
                  options={[
                    { value: 'kg' as const, label: 'kg' },
                    { value: 'lbs' as const, label: 'lbs' },
                  ]}
                  value={unit}
                  onChange={changeUnit}
                  accessibilityLabel="Weight unit"
                />
              </View>
            }
          />

          <MetricField
            ref={hrRef}
            label="Heart rate"
            unit="bpm"
            hint="Peak reached during your hardest interval"
            value={hr}
            onChangeText={(t) => {
              setHr(t);
              setError(null);
            }}
            placeholder="—"
            keyboardType="number-pad"
            returnKeyType="next"
            onSubmitEditing={() => notesRef.current?.focus()}
            accent={colors.crimson}
          />

          <View style={styles.field}>
            <AppText variant="eyebrow">Notes</AppText>
            <TextInput
              ref={notesRef}
              value={notes}
              onChangeText={setNotes}
              placeholder="How did it feel? Sleep, energy, conditions…"
              placeholderTextColor={colors.textFaint}
              multiline
              style={styles.notes}
              selectionColor={colors.lavender}
              accessibilityLabel="Notes"
            />
          </View>
        </View>

        {error ? (
          <AppText variant="callout" color={colors.amber} align="center" style={{ marginTop: space.md }} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <PrimaryButton label="Save to journal" onPress={save} disabled={!hasInput} style={{ marginTop: space.lg }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface MetricFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  unit: string;
  hint?: string;
  accent: string;
  accessory?: ReactNode;
  ref?: Ref<TextInputInstance>;
}

/** One big, calm numeric input: label above, oversized value, unit beside it. */
function MetricField({ label, unit, hint, accent, accessory, ref, ...input }: MetricFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && { backgroundColor: colors.surface }]}>
      <View style={styles.fieldHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.fieldDot, { backgroundColor: accent }]} />
          <AppText variant="eyebrow">{label}</AppText>
        </View>
        {accessory}
      </View>
      <View style={styles.valueRow}>
        <TextInput
          ref={ref}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.textFaint}
          selectionColor={accent}
          style={styles.valueInput}
          accessibilityLabel={`${label} in ${unit}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={6}
          {...input}
        />
        <AppText variant="callout" color={colors.textTertiary}>
          {unit}
        </AppText>
      </View>
      {hint ? <AppText variant="caption">{hint}</AppText> : null}
    </View>
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
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: space.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  linkedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  fields: {
    marginTop: space.lg,
    gap: 12,
  },
  field: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 20,
  },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  fieldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    marginBottom: 6,
  },
  valueInput: {
    flex: 1,
    fontSize: 44,
    fontWeight: '200',
    letterSpacing: -1,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  notes: {
    marginTop: 12,
    minHeight: 96,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
});
