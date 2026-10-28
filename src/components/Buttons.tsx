import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  accent?: string;
  trailing?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/** Large luminous pill used for the single most important action on a screen. */
export function PrimaryButton({ label, onPress, accent = colors.lavender, trailing, disabled, style, accessibilityHint }: PrimaryButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={trailing ? `${label}, ${trailing}` : label}
      accessibilityHint={accessibilityHint}
      style={[styles.primary, style]}
    >
      <LinearGradient
        colors={[accent, mix(accent)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AppText variant="callout" color="#141218" style={styles.primaryLabel}>
        {label}
      </AppText>
      {trailing ? (
        <AppText variant="callout" color="rgba(20,18,24,0.55)" style={styles.primaryLabel}>
          {'  ·  '}
          {trailing}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

/** Slightly lighter companion tone for the button gradient. */
function mix(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lift = (c: number) => Math.round(c + (255 - c) * 0.35);
  return `rgb(${lift(r)},${lift(g)},${lift(b)})`;
}

interface GhostButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

/** Quiet secondary action — text on a translucent pill. */
export function GhostButton({ label, onPress, icon, style, color = colors.text }: GhostButtonProps) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.ghost, style]}>
      {icon ? <Ionicons name={icon} size={18} color={color} style={{ marginRight: 8 }} /> : null}
      <AppText variant="callout" color={color}>
        {label}
      </AppText>
    </PressableScale>
  );
}

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  iconSize?: number;
  tint?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 44,
  iconSize = 20,
  tint = colors.text,
  background = 'rgba(255,255,255,0.06)',
  style,
}: IconButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      pressedScale={0.92}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: background }, styles.center, style]}
    >
      <View style={styles.center}>
        <Ionicons name={icon} size={iconSize} color={tint} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 60,
    borderRadius: radius.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  primaryLabel: {
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  ghost: {
    height: 52,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
