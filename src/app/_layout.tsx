import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { HeartRateProvider } from '../hr/HeartRateProvider';
import { useApplyVoice } from '../hooks/useVoice';
import { StoreProvider } from '../state/store';
import { colors } from '../theme/tokens';

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: 'transparent',
    primary: colors.lavender,
  },
};

export default function RootLayout() {
  useEffect(() => {
    // Prevents a white flash behind screens / the keyboard on Android & iOS.
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, []);

  return (
    <StoreProvider>
      <HeartRateProvider>
        <ThemeProvider value={theme}>
          <VoiceSetup />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="prepare/[protocol]" />
            <Stack.Screen
              name="workout/[protocol]"
              options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen
              name="summary"
              options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen name="log" options={{ presentation: 'modal' }} />
            <Stack.Screen name="heart-rate" options={{ presentation: 'modal' }} />
            <Stack.Screen name="voice" options={{ presentation: 'modal' }} />
            <Stack.Screen name="resting-check" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          </Stack>
        </ThemeProvider>
      </HeartRateProvider>
    </StoreProvider>
  );
}

/** Applies the chosen cue voice (needs the store, so it lives inside the providers). */
function VoiceSetup() {
  useApplyVoice();
  return null;
}
