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

## Live heart rate (Garmin & any Bluetooth HR sensor)

Tempo reads the standard Bluetooth **Heart Rate Service** (0x180D / 0x2A37), so it works with Garmin watches in broadcast mode (Venu 2 needs software 5.27+), and Polar / Wahoo / Garmin chest straps.

1. On the watch: hold the bottom button › Settings › Wrist Heart Rate › **Broadcast** (or *Broadcast In Activity*).
2. In Tempo: workout overview › **Heart rate** › *Find my watch*, tap it, and enter your age (or a measured max HR).
3. During a session the timer shows live bpm, the target band for the current stage, and coaching. With voice coaching on, you'll hear a prompt after 15 s out of zone (at most every 45 s). Nothing is said during the first 60–120 s of a stage, while heart rate is still catching up.
4. Sessions store average and peak heart rate and the % of hard-interval time spent in zone. The peak pre-fills the *Log metrics* screen.

| Stage | Norwegian 4×4 | Interval Walking (approx.) |
| --- | --- | --- |
| Work | 85–95 % HRmax | 75–85 % HRmax |
| Recovery | 60–70 % HRmax | 55–68 % HRmax |

Max HR = your measured value, else Tanaka's estimate (208 − 0.7 × age). Bands live in `src/domain/protocols.ts`; logic in `src/domain/zones.ts`.

**Needs a real build.** Bluetooth isn't available in Expo Go or the browser. There, a *demo sensor* simulates a heart that follows the plan, so the UI can still be tried. Build with `eas build -p android --profile preview` to use your watch. For day-to-day development with live reload *and* Bluetooth, make a development build once (`npx expo install expo-dev-client`, then `eas build -p android --profile development`).

## Estimated VO₂ max

After every session with heart-rate data, Tempo estimates VO₂ max with the **heart-rate ratio method** (Uth et al., *Eur J Appl Physiol* 2004): `VO₂max ≈ 15.3 × HRmax ÷ HRrest`.

- **Max HR is learned:** the highest heart rate you *hold for 10 s* in a workout raises it (single-sample sensor spikes are ignored, and the demo sensor never counts). A measured max you enter always wins.
- **Resting HR:** type in the value Garmin Connect shows, or use *Heart rate › measure it now*, a 2-minute still reading that averages the final minute.
- **Calibration:** log a VO₂ max from your Garmin once (*Log metrics*) and Tempo derives a personal factor, so the estimate tracks your watch.
- Shown as its own trend in the Journal (± error band), on the session summary, and on Home. Treat it as a trend, not a lab value.
- Logic: `src/domain/vo2.ts` (pure, tested in `tests/vo2.test.ts`).

Garmin's own VO₂ max can't be read automatically: Garmin doesn't share it with Health Connect, and its developer API is for approved businesses only.

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

## Background cues (Android)

Android pauses an app's JavaScript timers once another app is in front, so in-app voice cues would only play when you came back to Tempo. During a workout Tempo therefore starts a small foreground service (`modules/tempo-workout`, a local Expo module):

- The workout screen sends the full cue schedule — stage announcements, 3-2-1, halfway, one minute left, workout complete — as wall-clock times (`src/domain/cuePlan.ts`, tested in `tests/cuePlan.test.ts`). It is rebuilt on pause, resume and skip.
- The service speaks them with Android text-to-speech, briefly ducking music or podcasts, and vibrates — whatever app is open and with the screen off.
- A "workout in progress" notification shows the current stage with a live countdown; tap it to return.
- Being a foreground service keeps the Bluetooth heart-rate stream alive in the background too.

- The notification has **Pause / Resume / Skip** buttons. Pause and resume are handled by the service itself (so they work even if the app is asleep) and passed on to the timer with the exact time you pressed them.

It needs a native build (`eas build --profile preview --platform android`); Expo Go, iOS and web fall back to in-app cues.

## GPS: pace, distance and route

With location permission (asked the first time you tap Begin), the background service records GPS once a second for the length of the workout.

- **Live:** distance and your pace for the current stage, under the heart rate. On interval walks, a **brisk-pace target** learned from your recent walks (preferring walks where your heart rate was in zone); with no heart-rate sensor connected, Tempo nudges you by voice when you're more than ~7% slower than it.
- **Summary / journal:** total distance, hard-interval pace and climb; a per-round table (pace, distance, heart-rate recovery); and a route sketch coloured by stage — drawn with SVG, so no map API key or network is needed. Tap any session in the journal to open it.
- Fixes with poor accuracy and impossible jumps are dropped, paused time is left out (`src/domain/track.ts`, `tests/track.test.ts`). Routes are stored per session under their own storage key (`src/state/routes.ts`).
- `plugins/withWorkoutLocation.js` makes sure the location permission is declared for modern Android — react-native-ble-manager's `neverForLocation` option would otherwise cap it at Android 11.

## Heart-rate recovery

How far your heart rate falls in the first 60 seconds after each hard interval (average of the last 15 s of the interval vs. the reading at 60 s). It's one of the clearest fitness signals: the drop gets bigger as you get fitter. Shown per round in the summary and as a trend in the journal.

## Voice

Cues use the phone's text-to-speech. Tempo picks the most natural **offline** voice automatically (Android reports a quality score per voice; network voices are skipped so cues work with poor signal). Choose another under *Workout › Cues › Voice & units* — tapping a voice plays a sample. Install more voices in Android Settings › System › Languages › Text-to-speech output.
