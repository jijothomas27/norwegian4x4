// Week maths depends on local time; pin a zone with daylight saving (clocks
// went back on Sunday 1 Nov 2026 and forward on Sunday 8 Mar 2026).
process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  countsTowardGoal,
  DEFAULT_GOALS,
  goalsFrom,
  planReminders,
  streak,
  suggestion,
  weekProgress,
  weekStart,
  type PlanSession,
  type ReminderSettings,
  type WeeklyGoals,
} from '../src/domain/weekPlan.ts';
import type { ProtocolId } from '../src/domain/types.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const HARD: ProtocolId = 'norwegian-4x4';
const WALK: ProtocolId = 'japanese-iwt';

function s(protocolId: ProtocolId, startedAt: number, extra: Partial<PlanSession> = {}): PlanSession {
  return { protocolId, startedAt, completed: true, roundsCompleted: 4, totalRounds: 4, ...extra };
}

/** Goals met in the week starting on `monday`: two 4×4s and four walks. */
function fullWeek(monday: number): PlanSession[] {
  return [
    s(HARD, addDays(monday, 1)),
    s(HARD, addDays(monday, 4)),
    s(WALK, addDays(monday, 0)),
    s(WALK, addDays(monday, 2)),
    s(WALK, addDays(monday, 3)),
    s(WALK, addDays(monday, 5)),
  ];
}

const EVERY_DAY: ReminderSettings = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], hour: 18, minute: 0 };

test('weeks start on Monday at local midnight', () => {
  assert.equal(weekStart(t(2026, 11, 1, 23, 59)), t(2026, 10, 26, 0));
  assert.equal(weekStart(t(2026, 11, 2, 0, 0)), t(2026, 11, 2, 0));
  assert.equal(weekStart(t(2026, 11, 8, 22)), t(2026, 11, 2, 0));
});

test('the week containing a daylight-saving change still ends at local midnight', () => {
  // Autumn: that week is 7 days + 1 hour long.
  assert.equal(addDays(t(2026, 10, 26, 0), 7), t(2026, 11, 2, 0));
  assert.equal(t(2026, 11, 2, 0) - t(2026, 10, 26, 0), 7 * DAY + HOUR);
  assert.equal(weekStart(t(2026, 11, 2, 0, 30)), t(2026, 11, 2, 0));
  // Spring: 7 days − 1 hour.
  assert.equal(addDays(t(2026, 3, 2, 0), 7), t(2026, 3, 9, 0));
  assert.equal(weekStart(t(2026, 3, 9, 0, 30)), t(2026, 3, 9, 0));
  assert.equal(weekStart(t(2026, 3, 8, 23, 30)), t(2026, 3, 2, 0));
});

test('finished sessions count, and partial ones once half the rounds are done', () => {
  assert.equal(countsTowardGoal(s(HARD, 0)), true);
  assert.equal(countsTowardGoal(s(HARD, 0, { completed: false, roundsCompleted: 2 })), true);
  assert.equal(countsTowardGoal(s(HARD, 0, { completed: false, roundsCompleted: 1 })), false);
  assert.equal(countsTowardGoal(s(WALK, 0, { completed: false, roundsCompleted: 0, totalRounds: 5 })), false);
});

test('goals fall back to the defaults for missing or invalid values', () => {
  assert.deepEqual(goalsFrom(undefined), DEFAULT_GOALS);
  assert.deepEqual(goalsFrom({ 'norwegian-4x4': 1 }), { 'norwegian-4x4': 1, 'japanese-iwt': 4 });
  assert.deepEqual(goalsFrom({ 'norwegian-4x4': 9, 'japanese-iwt': 0 }), { 'norwegian-4x4': 2, 'japanese-iwt': 0 });
});

test('week progress counts only this week, by local day', () => {
  const sessions = [
    s(HARD, t(2026, 11, 1, 23, 30)), // last Sunday night: last week
    s(HARD, t(2026, 11, 2, 7)),
    s(WALK, t(2026, 11, 3, 7)),
    s(WALK, t(2026, 11, 4, 7), { completed: false, roundsCompleted: 1, totalRounds: 5 }),
  ];
  const p = weekProgress(sessions, DEFAULT_GOALS, t(2026, 11, 5));
  assert.equal(p.weekStart, t(2026, 11, 2, 0));
  assert.deepEqual(p.done, { 'norwegian-4x4': 1, 'japanese-iwt': 1 });
  assert.equal(p.met, false);
});

test('streak counts consecutive full weeks, and this week only once it is met', () => {
  const w1 = t(2026, 10, 12, 0);
  const w2 = t(2026, 10, 19, 0);
  const w3 = t(2026, 10, 26, 0); // contains the DST change
  const now = t(2026, 11, 3, 9);
  const sessions = [...fullWeek(w1), ...fullWeek(w2), ...fullWeek(w3)];
  assert.deepEqual(streak(sessions, DEFAULT_GOALS, now), { weeks: 3, includesThisWeek: false });

  // A gap three weeks back ends the streak there.
  const broken = [...fullWeek(w1), ...fullWeek(w3)];
  assert.deepEqual(streak(broken, DEFAULT_GOALS, now), { weeks: 1, includesThisWeek: false });

  // Meeting this week's goals adds it.
  const withThisWeek = [...sessions, ...fullWeek(t(2026, 11, 2, 0)).map((x) => ({ ...x, startedAt: Math.min(x.startedAt, now - HOUR) }))];
  assert.deepEqual(streak(withThisWeek, DEFAULT_GOALS, now), { weeks: 4, includesThisWeek: true });

  // A goal of 0 means that protocol isn't required.
  const walksOnly: WeeklyGoals = { 'norwegian-4x4': 0, 'japanese-iwt': 4 };
  const walks = [w2, w3].flatMap((w) => [0, 1, 2, 3].map((d) => s(WALK, addDays(w, d))));
  assert.equal(streak(walks, walksOnly, now).weeks, 2);

  assert.deepEqual(streak(sessions, { 'norwegian-4x4': 0, 'japanese-iwt': 0 }, now), { weeks: 0, includesThisWeek: false });
});

test('suggestion: the protocol with less room left this week goes first', () => {
  // Monday, nothing done: 2 hard in 4 possible days vs 4 walks in 7 → walk.
  assert.deepEqual(suggestion([], DEFAULT_GOALS, t(2026, 11, 2, 18)), { kind: 'train', protocolId: WALK, done: 0, goal: 4 });
  // Tuesday after Monday's walk: 2 hard in 3 days vs 3 walks in 6 → 4×4.
  const monWalk = [s(WALK, t(2026, 11, 2, 7))];
  assert.deepEqual(suggestion(monWalk, DEFAULT_GOALS, t(2026, 11, 3, 18)), { kind: 'train', protocolId: HARD, done: 0, goal: 2 });
});

test('suggestion: never a 4×4 the day after a 4×4, even across the week boundary', () => {
  const tueHard = [s(HARD, t(2026, 11, 3, 7))];
  assert.equal((suggestion(tueHard, DEFAULT_GOALS, t(2026, 11, 4, 18)) as { protocolId: ProtocolId }).protocolId, WALK);

  // Only 4×4s left and one was done yesterday → rest.
  const hardOnly: WeeklyGoals = { 'norwegian-4x4': 2, 'japanese-iwt': 0 };
  assert.deepEqual(suggestion(tueHard, hardOnly, t(2026, 11, 4, 18)), { kind: 'rest-after-hard' });
  // Sunday's 4×4 (last week) still blocks Monday.
  assert.deepEqual(suggestion([s(HARD, t(2026, 11, 1, 9))], hardOnly, t(2026, 11, 2, 18)), { kind: 'rest-after-hard' });
  // The day after that it's fine again.
  assert.equal(suggestion(tueHard, hardOnly, t(2026, 11, 5, 18)).kind, 'train');
});

test('suggestion: done today, goals met, no goals', () => {
  assert.deepEqual(suggestion([s(WALK, t(2026, 11, 4, 7))], DEFAULT_GOALS, t(2026, 11, 4, 18)), { kind: 'done-today' });
  // A session later the same day doesn't count yet when asking about the morning.
  assert.equal(suggestion([s(WALK, t(2026, 11, 4, 19))], DEFAULT_GOALS, t(2026, 11, 4, 8)).kind, 'train');
  const met = fullWeek(t(2026, 11, 2, 0));
  assert.deepEqual(suggestion(met, DEFAULT_GOALS, t(2026, 11, 8, 18)), { kind: 'goals-met' });
  assert.deepEqual(suggestion([], { 'norwegian-4x4': 0, 'japanese-iwt': 0 }, t(2026, 11, 4, 18)), { kind: 'no-goals' });
});

test('reminders: chosen days only, skipped once trained, and not in the past', () => {
  const now = t(2026, 11, 2, 10); // Monday 10:00
  const all = planReminders([], DEFAULT_GOALS, EVERY_DAY, now, 7);
  assert.equal(all.length, 7);
  assert.equal(all[0].at, t(2026, 11, 2, 18));

  const trainedToday = planReminders([s(WALK, t(2026, 11, 2, 7))], DEFAULT_GOALS, EVERY_DAY, now, 7);
  assert.equal(trainedToday[0].at, t(2026, 11, 3, 18));

  const evening = planReminders([], DEFAULT_GOALS, EVERY_DAY, t(2026, 11, 2, 19), 7);
  assert.equal(evening[0].at, t(2026, 11, 3, 18));

  const monWedFri = planReminders([], DEFAULT_GOALS, { ...EVERY_DAY, days: [1, 3, 5] }, now, 7);
  assert.deepEqual(monWedFri.map((r) => new Date(r.at).getDay()), [1, 3, 5]);

  assert.deepEqual(planReminders([], DEFAULT_GOALS, { ...EVERY_DAY, enabled: false }, now), []);
});

test('reminders: none once the week is covered, back next week', () => {
  const hardOnce: WeeklyGoals = { 'norwegian-4x4': 1, 'japanese-iwt': 0 };
  const plan = planReminders([s(HARD, t(2026, 11, 2, 7))], hardOnce, EVERY_DAY, t(2026, 11, 2, 10), 14);
  assert.equal(plan[0].at, t(2026, 11, 9, 18));
  assert.equal(plan[0].protocolId, HARD);
});

test('reminders keep their local time across a daylight-saving change', () => {
  const plan = planReminders([], DEFAULT_GOALS, EVERY_DAY, t(2026, 3, 5, 10), 7);
  assert.ok(plan.every((r) => new Date(r.at).getHours() === 18 && new Date(r.at).getMinutes() === 0));
  assert.equal(plan.length, 7);
});
