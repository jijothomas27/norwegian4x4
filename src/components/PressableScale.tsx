import { useState, type ReactNode } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Scale while pressed. */
  pressedScale?: number;
}

/** Pressable that gently sinks when touched — the app's universal tap affordance. */
export function PressableScale({ style, children, pressedScale = 0.97, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const scale = useState(() => new Animated.Value(1))[0];

  const animateTo = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        animateTo(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.4 } : null]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
