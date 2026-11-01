import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

import type { Buzz, CueStatus, PlannedCue } from '../../src/domain/cuePlan';
import type { TrackPoint } from '../../src/domain/track';
import type { TtsVoice } from '../../src/domain/voices';

export interface EventSubscription {
  remove(): void;
}

export interface WorkoutActionEvent {
  action: 'pause' | 'resume' | 'skip';
  /** Wall-clock time the button was pressed. */
  at: number;
}

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
  getVoices(): Promise<TtsVoice[]>;
  /** null = the phone's default voice. */
  setVoice(id: string | null): Promise<void>;
  /** GPS fixes recorded this workout, from index `from`. */
  getTrack(from: number): Promise<TrackPoint[]>;
  addListener(event: 'onAction', listener: (e: WorkoutActionEvent) => void): EventSubscription;
  addListener(event: 'onLocation', listener: (p: TrackPoint) => void): EventSubscription;
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

/**
 * GPS needs location access for pace, distance and the route. Asked once, the
 * first time you start a workout; Tempo works without it.
 */
export async function requestWorkoutLocationPermission(): Promise<boolean> {
  if (!backgroundSession) return false;
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  try {
    if (await PermissionsAndroid.check(fine)) return true;
    const result = await PermissionsAndroid.request(fine, {
      title: 'Track pace and route?',
      message: 'Tempo uses GPS during workouts to show your pace and distance for each interval and draw your route. Location is only used while a workout is running.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
