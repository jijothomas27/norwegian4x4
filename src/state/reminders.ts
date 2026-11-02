import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { getProtocol } from '../domain/protocols';
import { DEFAULT_REMINDERS, goalsFrom, planReminders, type PlannedReminder, type PlanSession, type ReminderSettings } from '../domain/weekPlan';
import type { Settings } from './model';
import { useStore } from './store';

/**
 * Workout reminders as local notifications: one dated notification per
 * upcoming reminder day (four weeks ahead), re-planned whenever sessions,
 * goals or reminder settings change and whenever the app comes to the
 * foreground. Days you've already trained, or that have nothing left to
 * suggest, simply get no notification (see domain/weekPlan.ts).
 *
 * expo-notifications re-arms scheduled alarms after a phone restart. Without
 * the exact-alarm permission Android may deliver a reminder a few minutes late.
 */

const CHANNEL_ID = 'workout-reminders';
const ID_PREFIX = 'tempo-reminder-';

export const remindersSupported = Platform.OS !== 'web';

export type ReminderPermission = 'granted' | 'undetermined' | 'denied' | 'unsupported';

export function reminderSettings(s: Pick<Settings, 'reminders'>): ReminderSettings {
  return s.reminders ?? DEFAULT_REMINDERS;
}

if (remindersSupported) {
  // While the app is open the home screen already shows the suggestion; keep it quiet.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Workout reminders',
    description: 'On the days you choose, when there’s still a workout to do this week.',
    importance: AndroidImportance.DEFAULT,
  });
}

const toPermission = (p: Notifications.NotificationPermissionsStatus): ReminderPermission =>
  p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported) return 'unsupported';
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported) return 'unsupported';
  // Android 13+ only shows the prompt once the app has a notification channel.
  await ensureChannel();
  return toPermission(await Notifications.requestPermissionsAsync());
}

export function reminderText(r: Pick<PlannedReminder, 'protocolId' | 'done' | 'goal'>): { title: string; body: string } {
  const def = getProtocol(r.protocolId);
  const left = r.goal - r.done;
  const what = r.protocolId === 'norwegian-4x4' ? '4×4' : 'walk';
  return {
    title: `Time for ${def.name}`,
    body:
      r.done === 0
        ? `First ${what} of ${r.goal} this week.`
        : `${r.done} of ${r.goal} done this week — ${left} to go.`,
  };
}

const idFor = (r: PlannedReminder) => `${ID_PREFIX}${r.at}`;

type SyncInput = Pick<Settings, 'reminders' | 'weeklyGoals'>;
let queue: Promise<void> = Promise.resolve();

/** Brings the scheduled reminders in line with the plan. Calls run one at a time. */
export function syncReminders(sessions: readonly PlanSession[], settings: SyncInput, now = Date.now()): Promise<void> {
  const run = async () => {
    if (!remindersSupported) return;
    const reminders = reminderSettings(settings);
    const allowed = reminders.enabled && (await Notifications.getPermissionsAsync()).granted;
    const plan = allowed ? planReminders(sessions, goalsFrom(settings.weeklyGoals), reminders, now) : [];
    const wanted = new Map(plan.map((r) => [idFor(r), r]));

    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(ID_PREFIX));
    const keep = new Set<string>();
    for (const n of scheduled) {
      const want = wanted.get(n.identifier);
      const text = want ? reminderText(want) : null;
      if (text && n.content.title === text.title && n.content.body === text.body) keep.add(n.identifier);
      else await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }

    if (plan.length > 0) await ensureChannel();
    for (const r of plan) {
      const identifier = idFor(r);
      if (keep.has(identifier)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { ...reminderText(r), data: { url: `/prepare/${r.protocolId}` } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL_ID },
      });
    }
  };
  queue = queue.then(run).catch((err) => console.warn('[reminders] sync failed', err));
  return queue;
}

/** Keeps scheduled reminders in step with the journal. Mount once, inside the store. */
export function useReminderSync(): void {
  const { state } = useStore();
  const { hydrated, sessions } = state;
  const { reminders, weeklyGoals } = state.settings;

  useEffect(() => {
    if (!hydrated || !remindersSupported) return;
    const sync = () => void syncReminders(sessions, { reminders, weeklyGoals });
    const timer = setTimeout(sync, 800);
    // Coming back to the app may be a new day: extend the four-week window and drop stale ones.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [hydrated, sessions, reminders, weeklyGoals]);
}

/** Tapping a reminder opens that workout's overview. Native only. */
export function useReminderTaps(): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    const { identifier, content } = response.notification.request;
    if (!identifier.startsWith(ID_PREFIX) || handled.current === identifier) return;
    handled.current = identifier;
    Notifications.clearLastNotificationResponse();
    const url = content.data?.url;
    if (typeof url === 'string' && url.startsWith('/prepare/')) router.push(url as Href);
  }, [response, router]);
}
