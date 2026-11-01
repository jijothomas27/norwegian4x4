import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { backgroundSession } from '../../modules/tempo-workout';
import type { Phase } from '../domain/types';

/**
 * Audio + haptic feedback for workout transitions.
 *
 * Voice uses the device's built-in text-to-speech (expo-speech), so no audio
 * assets are needed. To use your own chimes instead, replace `say()` with an
 * expo-audio player — every call site goes through the functions below.
 *
 * On Android builds, scheduled cues (stage changes, 3-2-1, halfway, complete)
 * are played by the background workout service instead, so they keep coming
 * when another app is open. While that is active the in-app versions stay
 * quiet to avoid hearing everything twice.
 */

let scheduledInBackground = false;
let voiceId: string | null = null;

/** Voice for every cue, native and in-app (null = phone default). */
export function setCueVoice(id: string | null) {
  voiceId = id;
  backgroundSession?.setVoice(id).catch(() => {});
}

/** Say a sample sentence in a given voice (voice picker preview). */
export function previewVoice(id: string | null, text: string) {
  if (backgroundSession) {
    backgroundSession
      .setVoice(id)
      .then(() => backgroundSession?.speak(text, null))
      .catch(() => {});
    return;
  }
  say(text, id);
}

/** Called by the workout screen while the background session owns scheduled cues. */
export function setScheduledCuesInBackground(on: boolean) {
  scheduledInBackground = on && backgroundSession !== null;
}

export interface CueOptions {
  voice: boolean;
  haptics: boolean;
}

const hapticsAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(promise: Promise<unknown> | void) {
  if (promise && typeof (promise as Promise<unknown>).catch === 'function') {
    (promise as Promise<unknown>).catch(() => {});
  }
}

function say(text: string, voice: string | null = voiceId) {
  try {
    void Speech.stop();
    Speech.speak(text, { rate: 0.96, pitch: 1.0, ...(voice ? { voice } : {}) });
  } catch {
    // Speech unavailable (e.g. some web browsers) — fail silently.
  }
}

function buzz(kind: 'start-hard' | 'start-easy' | 'tick' | 'success' | 'soft') {
  if (!hapticsAvailable) return;
  switch (kind) {
    case 'start-hard':
      safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
      setTimeout(() => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 180);
      break;
    case 'start-easy':
      safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
      break;
    case 'tick':
      safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      break;
    case 'success':
      safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      break;
    case 'soft':
      safe(Haptics.selectionAsync());
      break;
  }
}

export const cues = {
  /** A new stage has begun. */
  phaseStart(phase: Phase, opts: CueOptions) {
    if (scheduledInBackground) return;
    if (opts.haptics) buzz(phase.kind === 'work' ? 'start-hard' : 'start-easy');
    if (opts.voice) say(phase.announcement);
  },
  /** Final 3-2-1 of a stage. */
  countdown(secondsLeft: number, opts: CueOptions) {
    if (scheduledInBackground) return;
    if (opts.haptics) buzz('tick');
    if (opts.voice && secondsLeft === 3) say('Three. Two. One.');
  },
  /** Mid-stage nudges during work intervals. */
  milestone(text: string, opts: CueOptions) {
    if (scheduledInBackground) return;
    if (opts.haptics) buzz('soft');
    if (opts.voice) say(text);
  },
  /** Heart-rate coaching ("Ease off a little") — live, so never scheduled ahead. */
  coach(text: string, opts: CueOptions) {
    if (backgroundSession && opts.voice) {
      backgroundSession.speak(text, opts.haptics ? 'soft' : null).catch(() => say(text));
      return;
    }
    if (opts.haptics) buzz('soft');
    if (opts.voice) say(text);
  },
  complete(opts: CueOptions) {
    if (scheduledInBackground) return;
    if (opts.haptics) buzz('success');
    if (opts.voice) say('Workout complete. Beautifully done.');
  },
  tap(opts: Pick<CueOptions, 'haptics'>) {
    if (opts.haptics) buzz('soft');
  },
  silence() {
    backgroundSession?.silence().catch(() => {});
    try {
      void Speech.stop();
    } catch {
      // ignore
    }
  },
};
