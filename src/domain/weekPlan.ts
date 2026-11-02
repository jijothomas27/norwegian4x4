import type { ProtocolId } from './types';

/**
 * Weekly goals, streaks and "what to do today". Pure logic, unit-tested in
 * tests/weekPlan.test.ts.
 *
 * Weeks start on Monday at local midnight. All date arithmetic goes through
 * calendar days (setDate), never "+ 7 × 24 h", so the week that contains a
 * daylight-saving change still ends at local midnight.
 */

export type WeeklyGoals = Record<ProtocolId, number>;

/** 4×4: the protocol says once or twice a week. Interval Walking: four or more. */
export const DEFAULT_GOALS: WeeklyGoals = { 'norwegian-4x4': 2, 'japanese-iwt': 4 };
export const GOAL_OPTIONS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];
export const PLAN_PROTOCOLS: readonly ProtocolId[] = ['norwegian-4x4', 'japanese-iwt'];

/** The fields of a journal session this module needs. */
export interface PlanSession {
  protocolId: ProtocolId;
  /** epoch ms */
  startedAt: number;
  completed: boolean;
  roundsCompleted: number;
  totalRounds: number;
}

/** A session counts toward the week when it was finished, or at least half its rounds were done. */
export function countsTowardGoal(s: PlanSession): boolean {
  return s.completed || (s.roundsCompleted > 0 && s.roundsCompleted * 2 >= s.totalRounds);
}

export function goalsFrom(partial: Partial<Record<ProtocolId, number>> | undefined): WeeklyGoals {
  const pick = (id: ProtocolId) => {
    const v = partial?.[id];
    return typeof v === 'number' && GOAL_OPTIONS.includes(v) ? v : DEFAULT_GOALS[id];
  };
  return { 'norwegian-4x4': pick('norwegian-4x4'), 'japanese-iwt': pick('japanese-iwt') };
}

// ── Calendar helpers (local time) ───────────────────────────────────────────

export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  d.setDate(d.getDate() + days);
  // Keep the wall-clock time across a DST change.
  d.setHours(h, m, d.getSeconds(), d.getMilliseconds());
  return d.getTime();
}

/** Monday 00:00 local of the week containing `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(dayStart(ts));
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/** Days left in the week including the day of `ts`: Monday 7 … Sunday 1. */
export function daysLeftInWeek(ts: number): number {
  return 7 - ((new Date(ts).getDay() + 6) % 7);
}

/** Local time `hour:minute` on the calendar day of `ts`. */
export function atTime(ts: number, hour: number, minute: number): number {
  const d = new Date(ts);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

// ── Progress & streak ───────────────────────────────────────────────────────

const zero = (): WeeklyGoals => ({ 'norwegian-4x4': 0, 'japanese-iwt': 0 });

function countByWeek(sessions: readonly PlanSession[]): Map<number, WeeklyGoals> {
  const weeks = new Map<number, WeeklyGoals>();
  for (const s of sessions) {
    if (!countsTowardGoal(s)) continue;
    const key = weekStart(s.startedAt);
    const c = weeks.get(key) ?? zero();
    c[s.protocolId] += 1;
    weeks.set(key, c);
  }
  return weeks;
}

const hasGoals = (goals: WeeklyGoals) => PLAN_PROTOCOLS.some((id) => goals[id] > 0);
const meets = (done: WeeklyGoals, goals: WeeklyGoals) => hasGoals(goals) && PLAN_PROTOCOLS.every((id) => done[id] >= goals[id]);

export interface WeekProgress {
  weekStart: number;
  done: WeeklyGoals;
  goals: WeeklyGoals;
  /** Every protocol with a goal has reached it (false when no goals are set). */
  met: boolean;
}

export function weekProgress(sessions: readonly PlanSession[], goals: WeeklyGoals, now: number): WeekProgress {
  const start = weekStart(now);
  const done = countByWeek(sessions).get(start) ?? zero();
  return { weekStart: start, done, goals, met: meets(done, goals) };
}

export interface Streak {
  /** Consecutive weeks with every goal met, ending last week — plus this week once it's met. */
  weeks: number;
  includesThisWeek: boolean;
}

/**
 * Past weeks are judged against the current goals (goals aren't kept per
 * week). This week can only add to the streak, never break it: it isn't over.
 */
export function streak(sessions: readonly PlanSession[], goals: WeeklyGoals, now: number): Streak {
  if (!hasGoals(goals)) return { weeks: 0, includesThisWeek: false };
  const byWeek = countByWeek(sessions);
  const thisWeek = weekStart(now);
  const includesThisWeek = meets(byWeek.get(thisWeek) ?? zero(), goals);
  let weeks = 0;
  let week = weekStart(addDays(thisWeek, -7));
  while (weeks < 1000 && meets(byWeek.get(week) ?? zero(), goals)) {
    weeks += 1;
    week = weekStart(addDays(week, -7));
  }
  return { weeks: weeks + (includesThisWeek ? 1 : 0), includesThisWeek };
}

// ── Today's suggestion ──────────────────────────────────────────────────────

export type Suggestion =
  | { kind: 'train'; protocolId: ProtocolId; done: number; goal: number }
  /** A session that counts was already done today. */
  | { kind: 'done-today' }
  /** Only 4×4s are left, and one was done yesterday. */
  | { kind: 'rest-after-hard' }
  | { kind: 'goals-met' }
  | { kind: 'no-goals' };

/**
 * What to do on the day of `at`, from what's left this week. A 4×4 is never
 * suggested the day after a 4×4. When both are behind, the one with less
 * room left in the week goes first: a 4×4 needs a rest day between sessions,
 * so it has about half as many free days as walking. Ties go to the 4×4.
 *
 * Only sessions before `at` are considered, so asking about a future day
 * answers "if nothing else is done before then".
 */
export function suggestion(sessions: readonly PlanSession[], goals: WeeklyGoals, at: number): Suggestion {
  if (!hasGoals(goals)) return { kind: 'no-goals' };
  const past = sessions.filter((s) => s.startedAt < at && countsTowardGoal(s));
  const today = dayStart(at);
  if (past.some((s) => s.startedAt >= today)) return { kind: 'done-today' };

  const { done } = weekProgress(past, goals, at);
  const left = (id: ProtocolId) => Math.max(0, goals[id] - done[id]);
  const hardLeft = left('norwegian-4x4');
  const walksLeft = left('japanese-iwt');
  if (hardLeft + walksLeft === 0) return { kind: 'goals-met' };

  const yesterday = dayStart(addDays(today, -1));
  const hardYesterday = past.some((s) => s.protocolId === 'norwegian-4x4' && s.startedAt >= yesterday && s.startedAt < today);
  const days = daysLeftInWeek(at);
  const hardSlots = hardYesterday ? Math.floor(days / 2) : Math.ceil(days / 2);

  const train = (protocolId: ProtocolId): Suggestion => ({ kind: 'train', protocolId, done: done[protocolId], goal: goals[protocolId] });
  const canHard = hardLeft > 0 && !hardYesterday;
  if (canHard && walksLeft > 0) return hardLeft / Math.max(hardSlots, 1) >= walksLeft / days ? train('norwegian-4x4') : train('japanese-iwt');
  if (canHard) return train('norwegian-4x4');
  if (walksLeft > 0) return train('japanese-iwt');
  return { kind: 'rest-after-hard' };
}

// ── Reminders ───────────────────────────────────────────────────────────────

export interface ReminderSettings {
  enabled: boolean;
  /** Days of the week, 0 = Sunday … 6 = Saturday (JavaScript's getDay). */
  days: number[];
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, days: [1, 2, 3, 4, 5, 6, 0], hour: 18, minute: 0 };

export interface PlannedReminder {
  at: number;
  protocolId: ProtocolId;
  done: number;
  goal: number;
}

/**
 * Reminders for the next `horizonDays` days. A day gets one only when it's a
 * chosen day, the time is still ahead, and there's a workout to suggest — so
 * no reminder once you've trained that day, after a 4×4 when only 4×4s are
 * left, or when the week's goals are met.
 *
 * Every session is recorded in the app, which re-plans after each one, so
 * "assuming nothing else is done before then" is exactly what's true when a
 * reminder fires.
 */
export function planReminders(
  sessions: readonly PlanSession[],
  goals: WeeklyGoals,
  reminders: ReminderSettings,
  now: number,
  horizonDays = 28,
): PlannedReminder[] {
  if (!reminders.enabled || reminders.days.length === 0) return [];
  const out: PlannedReminder[] = [];
  let day = dayStart(now);
  for (let i = 0; i < horizonDays; i++, day = dayStart(addDays(day, 1))) {
    if (!reminders.days.includes(new Date(day).getDay())) continue;
    const at = atTime(day, reminders.hour, reminders.minute);
    if (at <= now) continue;
    const s = suggestion(sessions, goals, at);
    if (s.kind === 'train') out.push({ at, protocolId: s.protocolId, done: s.done, goal: s.goal });
  }
  return out;
}
