import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface SegmentedProps<T extends string | number> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  accessibilityLabel: string;
}

/** Soft pill segmented control. */
export function Segmented<T extends string | number>({ options, value, onChange, accent = colors.lavender, accessibilityLabel }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
          >
            <AppText variant="callout" color={selected ? accent : colors.textTertiary} style={styles.segmentLabel}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

interface StepperProps {
  value: number;
  options: readonly number[];
  onChange: (value: number) => void;
  format: (value: number) => string;
  accent?: string;
  accessibilityLabel: string;
}

/** − value + stepper that walks through an allowed list of values. */
export function Stepper({ value, options, onChange, format, accent = colors.text, accessibilityLabel }: StepperProps) {
  const i = options.indexOf(value);
  const canDec = i > 0;
  const canInc = i < options.length - 1;
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && canInc) onChange(options[i + 1]);
        if (e.nativeEvent.actionName === 'decrement' && canDec) onChange(options[i - 1]);
      }}
    >
      <PressableScale disabled={!canDec} onPress={() => onChange(options[i - 1])} style={styles.stepBtn} hitSlop={6}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </PressableScale>
      <AppText variant="callout" color={accent} style={styles.stepValue}>
        {format(value)}
      </AppText>
      <PressableScale disabled={!canInc} onPress={() => onChange(options[i + 1])} style={styles.stepBtn} hitSlop={6}>
        <Ionicons name="add" size={18} color={colors.text} />
      </PressableScale>
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  accent?: string;
}

export function ToggleRow({ label, hint, value, onChange, accent = colors.lavender }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <AppText variant="callout">{label}</AppText>
        {hint ? <AppText variant="caption">{hint}</AppText> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(255,255,255,0.12)', true: accent }}
        thumbColor="#F4F2FA"
        ios_backgroundColor="rgba(255,255,255,0.12)"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  segmentLabel: {
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 72,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
});
