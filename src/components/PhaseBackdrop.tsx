import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { tones, type Tone } from '../theme/tokens';

const ALL_TONES = Object.keys(tones) as Tone[];

/**
 * Full-screen ambient background for the timer. Each tone has its own wash;
 * switching tone cross-fades between them, and a soft radial glow
 * "breathes" at a tempo that matches the intensity (fast pulse for hard
 * work, slow breathing for recovery).
 */
export function PhaseBackdrop({ tone, paused = false }: { tone: Tone; paused?: boolean }) {
  const [layers] = useState(
    () => Object.fromEntries(ALL_TONES.map((t) => [t, new Animated.Value(t === tone ? 1 : 0)])) as Record<Tone, Animated.Value>,
  );

  useEffect(() => {
    Animated.parallel(
      ALL_TONES.map((t) =>
        Animated.timing(layers[t], {
          toValue: t === tone ? 1 : 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [tone, layers]);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {ALL_TONES.map((t) => (
        <Animated.View key={t} style={[StyleSheet.absoluteFill, { opacity: layers[t] }]}>
          <LinearGradient colors={tones[t].wash} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}
      <PulseGlow tone={tone} paused={paused} />
    </View>
  );
}

function PulseGlow({ tone, paused }: { tone: Tone; paused: boolean }) {
  const pulse = useState(() => new Animated.Value(0))[0];
  const { accent, pulseMs } = tones[tone];

  useEffect(() => {
    if (paused) {
      Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }).start();
      return;
    }
    const half = pulseMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseMs, paused, pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });

  return (
    <Animated.View style={[styles.glowWrap, { opacity, transform: [{ scale }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <Defs>
          <RadialGradient id="glow" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={accent} stopOpacity={0.28} />
            <Stop offset="0.45" stopColor={accent} stopOpacity={0.1} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#glow)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glowWrap: {
    position: 'absolute',
    left: '-30%',
    right: '-30%',
    top: '8%',
    aspectRatio: 1,
  },
});
