import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clockElapsedMs, clockReducer, initialClock, type ClockState } from '../src/domain/clock.ts';
import { buildPhases, NORWEGIAN_4X4 } from '../src/domain/protocols.ts';
import { locate, phaseOffsetsMs, totalDurationMs } from '../src/domain/timeline.ts';

const MIN = 60_000;
const phases = buildPhases(NORWEGIAN_4X4);
const total = totalDurationMs(phases);
const offsets = phaseOffsetsMs(phases);
const T0 = 1_000_000;

const started = (): ClockState => clockReducer(initialClock(T0, total), { type: 'start', now: T0, totalMs: total });

test('elapsed follows the wall clock while running', () => {
  let c = started();
  c = clockReducer(c, { type: 'tick', now: T0 + 90_000 });
  assert.equal(clockElapsedMs(c), 90_000);
  assert.equal(c.status, 'running');
});

test('pause freezes time; resume continues from the same point', () => {
  let c = started();
  c = clockReducer(c, { type: 'pause', now: T0 + 2 * MIN });
  c = clockReducer(c, { type: 'tick', now: T0 + 10 * MIN }); // time passes while paused
  assert.equal(clockElapsedMs(c), 2 * MIN);
  c = clockReducer(c, { type: 'resume', now: T0 + 10 * MIN });
  c = clockReducer(c, { type: 'tick', now: T0 + 11 * MIN });
  assert.equal(clockElapsedMs(c), 3 * MIN);
});

test('a long gap (app backgrounded) is caught up on the next tick', () => {
  let c = started();
  c = clockReducer(c, { type: 'tick', now: T0 + 10 * MIN + 30_000 });
  const pos = locate(phases, clockElapsedMs(c));
  assert.equal(pos.phase.key, 'rest-1');
});

test('skip jumps to the next stage and records skipped time', () => {
  let c = started();
  c = clockReducer(c, { type: 'skip', now: T0 + 60_000, offsets }); // 1 min into 5-min warm-up
  assert.equal(clockElapsedMs(c), 5 * MIN);
  assert.equal(c.skippedMs, 4 * MIN);
  assert.equal(locate(phases, clockElapsedMs(c)).phase.key, 'work-1');
  c = clockReducer(c, { type: 'tick', now: T0 + 2 * MIN });
  assert.equal(clockElapsedMs(c), 6 * MIN);
});

test('skip works while paused and stays paused', () => {
  let c = started();
  c = clockReducer(c, { type: 'pause', now: T0 + 30_000 });
  c = clockReducer(c, { type: 'skip', now: T0 + 5 * MIN, offsets });
  assert.equal(c.status, 'paused');
  assert.equal(clockElapsedMs(c), 5 * MIN);
});

test('the clock completes at the end and skipping the last stage completes it', () => {
  let c = started();
  c = clockReducer(c, { type: 'tick', now: T0 + total + 5000 });
  assert.equal(c.status, 'complete');
  assert.equal(clockElapsedMs(c), total);

  let d = started();
  d = clockReducer(d, { type: 'tick', now: T0 + total - 60_000 }); // inside cool-down
  d = clockReducer(d, { type: 'skip', now: T0 + total - 60_000, offsets });
  assert.equal(d.status, 'complete');
  assert.equal(d.skippedMs, 60_000);
});

test('dev speed multiplier scales only time after it is set', () => {
  let c = started();
  c = clockReducer(c, { type: 'speed', now: T0 + 10_000, factor: 30 });
  c = clockReducer(c, { type: 'tick', now: T0 + 20_000 });
  assert.equal(clockElapsedMs(c), 10_000 + 10_000 * 30);
});

test('skips are recorded as timeline ranges', () => {
  let c = started();
  c = clockReducer(c, { type: 'skip', now: T0 + 60_000, offsets });
  assert.deepEqual(c.skips, [[60_000, 5 * MIN]]);
});

test('wallToTimeline maps past moments through pauses and skips', async () => {
  const { wallToTimeline } = await import('../src/domain/clock.ts');
  let c = started();
  c = clockReducer(c, { type: 'pause', now: T0 + 2 * MIN }); // ran 0–2 min
  c = clockReducer(c, { type: 'resume', now: T0 + 5 * MIN }); // paused 3 min
  c = clockReducer(c, { type: 'skip', now: T0 + 6 * MIN, offsets }); // at timeline 3 min → jump to 5 min
  c = clockReducer(c, { type: 'tick', now: T0 + 7 * MIN });

  assert.equal(wallToTimeline(c, T0 - 1), null); // before start
  assert.equal(wallToTimeline(c, T0 + MIN), MIN);
  assert.equal(wallToTimeline(c, T0 + 3 * MIN), null); // paused
  assert.equal(wallToTimeline(c, T0 + 5 * MIN + 30_000), 2 * MIN + 30_000);
  assert.equal(wallToTimeline(c, T0 + 6 * MIN + 30_000), 5 * MIN + 30_000); // after the skip
});

test('wallToTimeline stops at the end of the workout', async () => {
  const { wallToTimeline } = await import('../src/domain/clock.ts');
  let c = started();
  c = clockReducer(c, { type: 'tick', now: T0 + total + 5000 });
  assert.equal(c.status, 'complete');
  assert.equal(wallToTimeline(c, T0 + total - 1000), total - 1000);
  assert.equal(wallToTimeline(c, T0 + total + 1000), null);
});
