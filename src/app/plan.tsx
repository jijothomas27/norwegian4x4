import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, IconButton } from '../components/Buttons';
import { Stepper, ToggleRow } from '../components/Controls';
import { getProtocol } from '../domain/protocols';
import {
  GOAL_OPTIONS,
  PLAN_PROTOCOLS,
  dayStart,
  goalsFrom,
  planReminders,
  streak as weekStreak,
  weekProgress,
  type ReminderSettings,
} from '../domain/weekPlan';
import type { ProtocolId } from '../domain/types';
import { useNow } from '../hooks/useNow';
import { formatShortDate } from '../lib/format';
import { DAY_INITIALS, DAY_NAMES, PLAN_LABEL, WEEK_ORDER, clockTime } from '../lib/planText';
import {
  getReminderPermission,
  reminderSettings,
  reminderText,
  remindersSupported,
  requestReminderPermission,
  type ReminderPermission,
} from '../state/reminders';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme/tokens';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 05–22
const MINUTES = [0, 15, 30, 45];

const GOAL_HINTS: Record<ProtocolId, string> = {
  'norwegian-4x4': 'The protocol: once or twice a week, with a day between them.',
  'japanese-iwt': 'The Shinshu programme: four or more a week.',
};

/** Weekly goals, streak and workout reminders. */
export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { state, updateSettings } = useStore();
  const [permission, setPermission] = useState<ReminderPermission | null>(null);

  const goals = useMemo(() => goalsFrom(state.settings.weeklyGoals), [state.settings.weeklyGoals]);
  const reminders = reminderSettings(state.settings);
  const progress = useMemo(() => weekProgress(state.sessions, goals, now), [state.sessions, goals, now]);
  const streak = useMemo(() => weekStreak(state.sessions, goals, now), [state.sessions, goals, now]);
  const next = useMemo(
    () => (reminders.enabled ? (planReminders(state.sessions, goals, reminders, now)[0] ?? null) : null),
    [state.sessions, goals, reminders, now],
  );

  // Re-check when coming back from the system settings.
  useEffect(() => {
    let alive = true;
    const check = () =>
      void getReminderPermission().then((p) => {
        if (alive) setPermission(p);
      });
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const setGoal = (id: ProtocolId, value: number) => updateSettings({ weeklyGoals: { ...goals, [id]: value } });
  const setReminders = (patch: Partial<ReminderSettings>) => updateSettings({ reminders: { ...reminders, ...patch } });

  async function toggleReminders(on: boolean) {
    if (!on) {
      setReminders({ enabled: false });
      return;
    }
    const p = permission === 'granted' ? 'granted' : await requestReminderPermission();
    setPermission(p);
    if (p === 'granted') setReminders({ enabled: true, days: reminders.days.length > 0 ? reminders.days : [1, 2, 3, 4, 5, 6, 0] });
  }

  const toggleDay = (day: number) =>
    setReminders({ days: reminders.days.includes(day) ? reminders.days.filter((d) => d !== day) : [...reminders.days, day] });

  const blocked = permission === 'denied';
  const tracked = PLAN_PROTOCOLS.filter((id) => goals[id] > 0);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="eyebrow">Plan</AppText>
            <AppText variant="title" style={{ marginTop: 8 }}>
              Weekly plan
            </AppText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        <View style={[styles.card, { marginTop: space.lg }]}>
          <AppText variant="caption">Week of {formatShortDate(progress.weekStart)}</AppText>
          <View style={[styles.row, { marginTop: 6 }]}>
            {streak.weeks > 0 ? <Ionicons name="flame-outline" size={20} color={colors.amber} style={{ marginRight: 6 }} /> : null}
            <AppText variant="heading">
              {streak.weeks > 0 ? `${streak.weeks}-week streak` : progress.met ? 'Goals met this week' : 'No streak yet'}
            </AppText>
          </View>
          {tracked.length > 0 ? (
            <AppText variant="body" style={{ marginTop: 4 }}>
              {tracked.map((id) => `${PLAN_LABEL[id]} ${progress.done[id]} of ${goals[id]}`).join('  ·  ')}
            </AppText>
          ) : null}
          <AppText variant="caption" style={styles.hint}>
            A week counts toward the streak when every goal is met. Weeks run Monday to Sunday; a session ended early counts once
            half its rounds are done.
          </AppText>
        </View>

        <AppText variant="eyebrow" style={styles.section}>
          Goals
        </AppText>
        {PLAN_PROTOCOLS.map((id) => {
          const def = getProtocol(id);
          return (
            <View key={id} style={styles.goal}>
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: def.accent }]} />
                <AppText variant="callout" style={{ flex: 1 }}>
                  {def.shortName}
                </AppText>
                <Stepper
                  value={goals[id]}
                  options={GOAL_OPTIONS}
                  onChange={(v) => setGoal(id, v)}
                  format={(v) => (v === 0 ? 'Off' : `${v} / wk`)}
                  accent={goals[id] === 0 ? colors.textTertiary : def.accent}
                  accessibilityLabel={`${def.name} sessions per week`}
                />
              </View>
              <AppText variant="caption" style={styles.goalHint}>
                {GOAL_HINTS[id]}
              </AppText>
            </View>
          );
        })}

        <AppText variant="eyebrow" style={styles.section}>
          Reminders
        </AppText>
        {!remindersSupported ? (
          <AppText variant="caption">Reminders are available in the Android app.</AppText>
        ) : (
          <>
            <ToggleRow
              label="Remind me to train"
              hint="Only when there’s a workout left this week and you haven’t trained that day"
              value={reminders.enabled && !blocked}
              onChange={(on) => void toggleReminders(on)}
            />

            {blocked ? (
              <View style={styles.notice}>
                <Ionicons name="notifications-off-outline" size={18} color={colors.amber} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <AppText variant="callout">Notifications are turned off for Tempo.</AppText>
                  <AppText variant="caption" style={{ marginTop: 2 }}>
                    Allow them in the phone’s settings, then come back here.
                  </AppText>
                  <GhostButton label="Open settings" icon="settings-outline" color={colors.amber} onPress={() => void Linking.openSettings()} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                </View>
              </View>
            ) : null}

            {reminders.enabled && !blocked ? (
              <>
                <View style={styles.days} accessibilityRole="none">
                  {WEEK_ORDER.map((d) => {
                    const on = reminders.days.includes(d);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => toggleDay(d)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={DAY_NAMES[d]}
                        style={[styles.day, on && styles.dayOn]}
                      >
                        <AppText variant="callout" color={on ? colors.bg : colors.textTertiary}>
                          {DAY_INITIALS[d]}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.row, styles.timeRow]}>
                  <AppText variant="callout" style={{ flex: 1 }}>
                    Hour
                  </AppText>
                  <Stepper
                    value={reminders.hour}
                    options={HOURS}
                    onChange={(hour) => setReminders({ hour })}
                    format={(h) => String(h).padStart(2, '0')}
                    accessibilityLabel="Reminder hour"
                  />
                </View>
                <View style={[styles.row, styles.timeRow]}>
                  <AppText variant="callout" style={{ flex: 1 }}>
                    Minute
                  </AppText>
                  <Stepper
                    value={reminders.minute}
                    options={MINUTES}
                    onChange={(minute) => setReminders({ minute })}
                    format={(m) => `:${String(m).padStart(2, '0')}`}
                    accessibilityLabel="Reminder minute"
                  />
                </View>

                <View style={[styles.card, { marginTop: space.md }]}>
                  <AppText variant="caption">Next reminder</AppText>
                  {next ? (
                    <>
                      <AppText variant="callout" style={{ marginTop: 4 }}>
                        {dayName(next.at, now)} at {clockTime(reminders.hour, reminders.minute)}
                      </AppText>
                      <AppText variant="caption" style={{ marginTop: 2 }}>
                        “{reminderText(next).title}” — {reminderText(next).body}
                      </AppText>
                    </>
                  ) : (
                    <AppText variant="callout" style={{ marginTop: 4 }}>
                      {reminders.days.length === 0 ? 'Pick at least one day.' : 'None coming up — set a goal above.'}
                    </AppText>
                  )}
                </View>
                <AppText variant="caption" style={styles.hint}>
                  The suggestion follows what’s left this week, and never puts a 4×4 the day after a 4×4. A reminder may arrive
                  a few minutes late when the phone is saving battery.
                </AppText>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function dayName(at: number, now: number): string {
  const days = Math.round((dayStart(at) - dayStart(now)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${DAY_NAMES[new Date(at).getDay()]} ${formatShortDate(at)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
  },
  goal: {
    paddingVertical: 10,
  },
  goalHint: {
    marginTop: 4,
    marginLeft: 18,
    fontSize: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: space.sm,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,179,71,0.08)',
  },
  days: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  day: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dayOn: {
    backgroundColor: colors.lavender,
  },
  timeRow: {
    minHeight: 52,
    marginTop: 4,
  },
});
