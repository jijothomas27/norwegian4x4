import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  children: ReactNode;
  delay?: number;
  /** Starting vertical offset in px. */
  from?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/** Soft rise-and-fade entrance. Re-mount (change `key`) to replay. */
export function FadeIn({ children, delay = 0, from = 12, duration = 600, style }: Props) {
  const progress = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [delay, duration, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
