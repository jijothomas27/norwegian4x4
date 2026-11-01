import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

import type { Buzz, CueStatus, PlannedCue } from '../../src/domain/cuePlan';

/**
 * Android background session: a foreground service that keeps the workout
 * alive and plays voice/vibration cues on schedule even when another app is
 * open or the screen is off. Null on iOS, web and Expo Go — callers fall back
 * to in-app cues.
 */
export interface TempoWorkoutNative {
  /** Start the session if needed and replace its cue schedule. Resolves false if Android refused. */
  sync(cues: PlannedCue[], status: CueStatus): Promise<boolean>;
  stop(): Promise<void>;
  /** Speak now (zone coaching), ducking other audio. */
  speak(text: string, vibrate: Buzz | null): Promise<void>;
  silence(): Promise<void>;
}

export const backgroundSession: TempoWorkoutNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<TempoWorkoutNative>('TempoWorkout') : null;

/**
 * Android 13+ hides the "workout in progress" notification unless the app may
 * post notifications. The background session works either way; this only
 * decides whether you can see the stage countdown in the notification shade.
 */
export async function requestWorkoutNotificationPermission(): Promise<void> {
  if (!backgroundSession || Number(Platform.Version) < 33) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  try {
    if (await PermissionsAndroid.check(permission)) return;
    await PermissionsAndroid.request(permission);
  } catch {
    // Not critical.
  }
}
