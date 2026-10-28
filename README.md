# Tempo — Norwegian 4×4 & Japanese Interval Walking

A calm, dark-mode interval coach for two evidence-based longevity workouts, built with **Expo SDK 58**, **React Native 0.88**, **TypeScript** and **Expo Router**.

- **Norwegian 4×4**: 5–10 min warm-up, 4 × (4 min at 85–95 % HRmax + 3 min active recovery), 5 min cool-down
- **Japanese Interval Walking**: 3 min warm-up, 5 or 6 × (3 min fast + 3 min slow walk), 3 min cool-down

## Run it

```bash
npm install
npx expo start          # press i (iOS simulator), a (Android) or scan the QR with Expo Go
```

Everything used (`expo-haptics`, `expo-speech`, `expo-keep-awake`, `expo-linear-gradient`, `react-native-svg`, AsyncStorage) ships in Expo Go, so no custom dev build is needed.

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint (incl. React Compiler rules)
npm test                # node:test unit tests for the timer engine & protocols
npx expo start --web    # quick look in a browser
```

## Install on an Android phone (standalone APK)

`eas.json` has a `preview` profile that builds a sideloadable APK in Expo's cloud — no Android Studio needed.

```bash
npx eas-cli@latest login                                   # free Expo account
npx eas-cli@latest build -p android --profile preview      # ~10–20 min
```

Open the link/QR it prints on your phone, download the APK and install it (allow "Install unknown apps" for your browser when asked). The app ID is `com.jijothomas.tempo` (set in `app.json`) — change it before your first build if you ever plan to publish to Google Play, as it can't be changed afterwards.

## What's inside

| Screen | File |
| --- | --- |
| Practice (home) — two protocol cards, weekly summary | `src/app/(tabs)/index.tsx` |
| Journal — VO₂ max & weight sparklines, day-grouped history | `src/app/(tabs)/journal.tsx` |
| Protocol overview + adjustments (warm-up length, rounds, cues) | `src/app/prepare/[protocol].tsx` |
| Focused timer — 3-2-1 lead-in, ring, phase wash, pause / skip / end | `src/app/workout/[protocol].tsx` |
| Completion summary | `src/app/summary.tsx` |
| Log metrics (VO₂ max, weight kg/lbs, heart rate, notes) | `src/app/log.tsx` |

### Architecture

```
src/
  domain/      Pure TypeScript — no React Native imports, unit-tested in Node
    protocols.ts   Protocol definitions → ordered list of timed phases
    timeline.ts    Locate a position in the workout from elapsed ms; formatting
    clock.ts       Timer state machine (start / pause / resume / skip / tick)
  hooks/
    useIntervalTimer.ts   Binds the clock to React, emits phase / second / complete events
  state/
    store.tsx      Context + reducer, persisted to AsyncStorage (debounced, hydration-safe)
    model.ts       Data model + defensive parsing of stored data
    selectors.ts   Weekly summary, metric series, day-grouped journal
  lib/
    cues.ts        Voice (expo-speech) + haptic (expo-haptics) cues — one place to swap in sounds
  components/      Design-system primitives (text, buttons, ring, sparkline, phase strip, sheet…)
  theme/tokens.ts  Colours, phase tones, type scale, radii — re-skin the app here
```

**Why the timer is reliable:** the clock never counts down a number. It stores *when* it started running and derives elapsed time from `Date.now()`, so it can't drift, survives the app being backgrounded (it catches up on return), and pause/skip are exact. Skipped time is excluded from the recorded duration, and a round only counts as completed if at least half of it was actually done.

**Cues:** each stage change gives a haptic (stronger for work intervals) and a spoken announcement ("Round 2 of 4. High intensity. Four minutes."). Work intervals also get "Halfway" and "One minute left", and every stage ends with a 3-2-1. Toggle voice/haptics on the overview screen. The screen stays awake during a session.

**Dev preview:** in development builds, long-press the big clock to run the session at 30× speed (long-press again to return to 1×) — handy for checking a full workout end-to-end.

## Customising

- Change durations, labels or guidance text in `src/domain/protocols.ts` (tests will tell you if totals change).
- Change colours or the intensity "pulse" tempo per phase in `src/theme/tokens.ts`.
- Rename the app in `app.json` (`expo.name`).
- To use audio chimes instead of speech, replace `say()` in `src/lib/cues.ts` with an `expo-audio` player.

> Heart-rate zones are guidance, not medical advice. If you have a heart condition or haven't trained at high intensity before, check with a clinician before starting the 4×4.
