import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMPLETE_TEXT, COUNTDOWN_TEXT, HALFWAY_TEXT, ONE_MINUTE_TEXT, planCues } from '../src/domain/cuePlan.ts';
import { buildPhases, NORWEGIAN_4X4 } from '../src/domain/protocols.ts';

const MIN = 60_000;
const NOW = 1_700_000_000_000;
const phases = buildPhases(NORWEGIAN_4X4); // 5 warm-up, 4×(4+3), 5 cool-down = 38 min

const base = { phases, now: NOW, speed: 1, running: true, voice: true, haptics: true, announceCurrent: true };

test('at the start, every stage is announced at its wall-clock time', () => {
  const plan = planCues({ ...base, elapsedMs: 0 });
  const starts = plan.cues.filter((c) => c.status && !c.final);
  assert.equal(starts.length, phases.length);
  assert.equal(starts[0].at, NOW);
  assert.equal(starts[0].text, phases[0].announcement);
  assert.equal(starts[1].at, NOW + 5 * MIN); // round 1 after the 5-min warm-up
  assert.equal(starts[1].vibrate, 'hard');
  assert.equal(plan.announcedIndex, 0);
  const last = plan.cues[plan.cues.length - 1];
  assert.equal(last.text, COMPLETE_TEXT);
  assert.equal(last.final, true);
  assert.equal(last.at, NOW + 38 * MIN);
});

test('work intervals get halfway, one-minute and 3-2-1 cues', () => {
  const plan = planCues({ ...base, elapsedMs: 0 });
  const roundEnd = NOW + 9 * MIN;
  const texts = (from: number, to: number) => plan.cues.filter((c) => c.at > from && c.at < to).map((c) => c.text);
  assert.deepEqual(texts(NOW + 5 * MIN, roundEnd), [HALFWAY_TEXT, ONE_MINUTE_TEXT, COUNTDOWN_TEXT, null, null]);
  assert.equal(plan.cues.find((c) => c.text === HALFWAY_TEXT)!.at, NOW + 7 * MIN);
});

test('resuming mid-stage does not re-announce it and shifts the rest', () => {
  const elapsed = 6 * MIN; // 1 min into round 1
  const plan = planCues({ ...base, elapsedMs: elapsed, announceCurrent: true });
  assert.equal(plan.announcedIndex, null);
  assert.ok(!plan.cues.some((c) => c.text === phases[1].announcement));
  const rest1 = plan.cues.find((c) => c.text === phases[2].announcement)!;
  assert.equal(rest1.at, NOW + 3 * MIN);
  assert.equal(plan.status.endsAt, NOW + 3 * MIN);
});

test('skipping lands exactly on a stage start and announces it once', () => {
  const plan = planCues({ ...base, elapsedMs: 5 * MIN });
  assert.equal(plan.cues[0].text, phases[1].announcement);
  assert.equal(plan.cues[0].at, NOW);
  const again = planCues({ ...base, elapsedMs: 5 * MIN, announceCurrent: false });
  assert.ok(!again.cues.some((c) => c.text === phases[1].announcement));
});

test('paused sessions schedule nothing', () => {
  const plan = planCues({ ...base, elapsedMs: 6 * MIN, running: false });
  assert.deepEqual(plan.cues, []);
  assert.match(plan.status.title, /^Paused/);
});

test('voice and haptics off still keep stage cues for the notification', () => {
  const plan = planCues({ ...base, elapsedMs: 0, voice: false, haptics: false });
  assert.ok(plan.cues.every((c) => c.text === null && c.vibrate === null));
  assert.equal(plan.cues.filter((c) => c.status).length, phases.length + 1);
});

test('the dev fast-forward compresses wall-clock times', () => {
  const plan = planCues({ ...base, elapsedMs: 0, speed: 30 });
  assert.equal(plan.cues[plan.cues.length - 1].at, NOW + (38 * MIN) / 30);
});
