import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPhases, JAPANESE_IWT, NORWEGIAN_4X4, normalizeConfig } from '../src/domain/protocols.ts';
import { formatClock, locate, phaseOffsetsMs, totalDurationMs, workRoundsCompleted } from '../src/domain/timeline.ts';

const MIN = 60_000;

test('Norwegian 4×4 default: 5 warm-up + 4×(4+3) + 5 cool-down = 38 min', () => {
  const phases = buildPhases(NORWEGIAN_4X4);
  assert.equal(phases.length, 1 + 4 * 2 + 1);
  assert.equal(totalDurationMs(phases), 38 * MIN);
  assert.deepEqual(
    phases.map((p) => `${p.kind}:${p.durationSec / 60}`),
    ['warmup:5', 'work:4', 'rest:3', 'work:4', 'rest:3', 'work:4', 'rest:3', 'work:4', 'rest:3', 'cooldown:5'],
  );
});

test('Norwegian 4×4 warm-up is adjustable 5–10 min; rounds fixed at 4', () => {
  assert.equal(totalDurationMs(buildPhases(NORWEGIAN_4X4, { warmupMin: 10 })), 43 * MIN);
  assert.deepEqual(normalizeConfig(NORWEGIAN_4X4, { warmupMin: 11, rounds: 6 }), { warmupMin: 5, rounds: 4 });
});

test('Japanese IWT: 3 + 5×(3+3) + 3 = 36 min, or 42 min with 6 rounds', () => {
  assert.equal(totalDurationMs(buildPhases(JAPANESE_IWT)), 36 * MIN);
  assert.equal(totalDurationMs(buildPhases(JAPANESE_IWT, { rounds: 6 })), 42 * MIN);
  assert.equal(buildPhases(JAPANESE_IWT, { rounds: 7 }).filter((p) => p.kind === 'work').length, 5);
  const tones = buildPhases(JAPANESE_IWT).map((p) => p.tone);
  assert.equal(tones[1], 'brisk');
  assert.equal(tones[2], 'easy');
});

test('locate() finds phase and remaining time at boundaries', () => {
  const phases = buildPhases(NORWEGIAN_4X4);
  let pos = locate(phases, 0);
  assert.equal(pos.index, 0);
  assert.equal(pos.phaseRemainingMs, 5 * MIN);

  pos = locate(phases, 5 * MIN - 1);
  assert.equal(pos.index, 0);

  pos = locate(phases, 5 * MIN);
  assert.equal(pos.index, 1);
  assert.equal(pos.phase.kind, 'work');
  assert.equal(pos.phase.round, 1);
  assert.equal(pos.phaseRemainingMs, 4 * MIN);

  pos = locate(phases, 5 * MIN + 2.5 * MIN);
  assert.equal(pos.phaseProgress, 0.625);

  pos = locate(phases, 38 * MIN);
  assert.equal(pos.done, true);
  assert.equal(pos.totalProgress, 1);

  pos = locate(phases, 999 * MIN);
  assert.equal(pos.done, true);
});

test('phase offsets end with the total (used by skip)', () => {
  const phases = buildPhases(JAPANESE_IWT);
  const offsets = phaseOffsetsMs(phases);
  assert.equal(offsets.length, phases.length + 1);
  assert.equal(offsets[1], 3 * MIN);
  assert.equal(offsets.at(-1), totalDurationMs(phases));
});

test('work rounds completed counts finished hard intervals only', () => {
  const phases = buildPhases(NORWEGIAN_4X4);
  assert.equal(workRoundsCompleted(phases, 8 * MIN), 0);
  assert.equal(workRoundsCompleted(phases, 9 * MIN), 1);
  assert.equal(workRoundsCompleted(phases, 38 * MIN), 4);
});

test('formatClock rounds up so a phase never shows 0:00 while running', () => {
  assert.equal(formatClock(4 * MIN), '4:00');
  assert.equal(formatClock(239_001), '4:00');
  assert.equal(formatClock(238_999), '3:59');
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65 * MIN), '1:05:00');
});

test('announcements read naturally', () => {
  const [warm, work1] = buildPhases(NORWEGIAN_4X4);
  assert.equal(warm.announcement, 'Warm up. five minutes. Ease into it.');
  assert.equal(work1.announcement, 'Round 1 of 4. High intensity. four minutes.');
});

test('skipped work intervals do not count as completed rounds', () => {
  const phases = buildPhases(NORWEGIAN_4X4);
  // Round 1 work = [5, 9) min. Skip from 6 min → 9 min (3 of 4 min skipped).
  assert.equal(workRoundsCompleted(phases, 10 * MIN, [[6 * MIN, 9 * MIN]]), 0);
  // Skip only the last minute → still counts.
  assert.equal(workRoundsCompleted(phases, 10 * MIN, [[8 * MIN, 9 * MIN]]), 1);
});
