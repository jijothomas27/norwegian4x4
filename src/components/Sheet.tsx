import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface SheetAction {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'primary' | 'destructive';
}

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  actions: SheetAction[];
  onDismiss: () => void;
}

/**
 * Calm bottom sheet for confirmations. Used instead of the system Alert so
 * it matches the visual language (and works on web, where Alert is a no-op).
 */
export function ActionSheet({ visible, title, message, actions, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const progress = useState(() => new Animated.Value(0))[0];
  const [mounted, setMounted] = useState(visible);
  // Mount immediately when asked to show; unmount only after the exit animation.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 320 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, progress]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { bottom: Math.max(insets.bottom, 12) },
          {
            opacity: progress,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.handle} />
        <AppText variant="heading" align="center">
          {title}
        </AppText>
        {message ? (
          <AppText variant="body" align="center" style={styles.message}>
            {message}
          </AppText>
        ) : null}
        <View style={styles.actions}>
          {actions.map((a) => (
            <PressableScale
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={[
                styles.action,
                a.tone === 'primary' && { backgroundColor: colors.lavender },
                a.tone === 'destructive' && { backgroundColor: 'rgba(255,90,110,0.14)' },
              ]}
            >
              <AppText
                variant="callout"
                color={a.tone === 'primary' ? '#141218' : a.tone === 'destructive' ? colors.crimson : colors.text}
                style={{ fontWeight: '600' }}
              >
                {a.label}
              </AppText>
            </PressableScale>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: colors.surface,
    paddingBottom: 20,
    borderRadius: radius.xl,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 20,
  },
  message: {
    marginTop: 8,
    paddingHorizontal: 8,
  },
  actions: {
    marginTop: 24,
    gap: 10,
  },
  action: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
