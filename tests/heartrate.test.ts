import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isHeartRateServiceUuid, parseHeartRateMeasurement } from '../src/domain/heartRatePacket.ts';
import { addHrSample, EMPTY_HR_STATS, summarizeHr } from '../src/domain/hrStats.ts';
import { buildPhases, JAPANESE_IWT, NORWEGIAN_4X4 } from '../src/domain/protocols.ts';
import { bpmRange, classify, effectiveMaxHr, estimateMaxHrFromAge } from '../src/domain/zones.ts';

test('parses uint8 heart rate with no contact info', () => {
  assert.deepEqual(parseHeartRateMeasurement([0x00, 72]), { bpm: 72, contact: null, energyKj: undefined, rrMs: [] });
});

test('parses uint16 heart rate, contact detected, energy and RR intervals', () => {
  // flags: uint16 | contact supported+detected | energy | RR = 0x01|0x06|0x08|0x10 = 0x1F
  const bytes = [0x1f, 0xa5, 0x00, 0x10, 0x00, 0x00, 0x04, 0x00, 0x02];
  const m = parseHeartRateMeasurement(bytes)!;
  assert.equal(m.bpm, 165);
  assert.equal(m.contact, true);
  assert.equal(m.energyKj, 16);
  assert.deepEqual(m.rrMs, [1000, 500]);
});

test('reports lost skin contact and rejects truncated packets', () => {
  assert.equal(parseHeartRateMeasurement([0x04, 80])!.contact, false);
  assert.equal(parseHeartRateMeasurement([0x01, 80]), null);
  assert.equal(parseHeartRateMeasurement([0x00]), null);
});

test('max HR: measured beats age estimate; Tanaka formula', () => {
  assert.equal(estimateMaxHrFromAge(40), 180);
  assert.deepEqual(effectiveMaxHr({ age: 40 }), { bpm: 180, source: 'age' });
  assert.deepEqual(effectiveMaxHr({ age: 40, maxHr: 188 }), { bpm: 188, source: 'measured' });
  assert.equal(effectiveMaxHr({}), null);
  assert.equal(effectiveMaxHr({ maxHr: 400 }), null);
});

test('4×4 work zone is 85–95 % of max; recovery 60–70 %', () => {
  const [, work, rest] = buildPhases(NORWEGIAN_4X4);
  assert.deepEqual(bpmRange(work.target, 180), { low: 153, high: 171 });
  assert.deepEqual(bpmRange(rest.target, 180), { low: 108, high: 126 });
});

test('interval-walking zones are gentler than 4×4', () => {
  const [, fast, slow] = buildPhases(JAPANESE_IWT);
  assert.deepEqual(bpmRange(fast.target, 180), { low: 135, high: 153 });
  assert.ok(slow.target.high < fast.target.low);
});

test('no correction while heart rate is still catching up', () => {
  const r = { low: 153, high: 171 };
  assert.equal(classify(160, r, 10, 90), 'in');
  assert.equal(classify(130, r, 30, 90), 'settling');
  assert.equal(classify(130, r, 120, 90), 'below');
  assert.equal(classify(180, r, 120, 90), 'above');
});

test('HR stats are time-weighted and track time in zone for work only', () => {
  let s = EMPTY_HR_STATS;
  const t0 = 0;
  // 60 s of work at 160 (in zone), 1 Hz
  for (let i = 0; i < 60; i++) s = addHrSample(s, { at: t0 + i * 1000, bpm: 160, phaseKind: 'work', inZone: true });
  // 30 s of work at 140 (below)
  for (let i = 60; i < 90; i++) s = addHrSample(s, { at: t0 + i * 1000, bpm: 140, phaseKind: 'work', inZone: false });
  // 30 s rest at 120 — doesn't affect time-in-zone
  for (let i = 90; i < 120; i++) s = addHrSample(s, { at: t0 + i * 1000, bpm: 120, phaseKind: 'rest', inZone: true });
  const sum = summarizeHr(s)!;
  assert.equal(sum.max, 160);
  assert.equal(sum.avg, Math.round((160 * 60 + 140 * 30 + 120 * 30) / 120));
  assert.equal(sum.inZonePct, 67);
});

test('a long sensor dropout is not credited to the last reading', () => {
  let s = addHrSample(EMPTY_HR_STATS, { at: 0, bpm: 100, phaseKind: 'work', inZone: true });
  s = addHrSample(s, { at: 60_000, bpm: 100, phaseKind: 'work', inZone: true });
  assert.equal(s.workMs, 1000 + 5000);
});

test('recognises the Heart Rate service UUID in every form', () => {
  for (const u of ['180d', '180D', '0x180D', '0000180d-0000-1000-8000-00805f9b34fb', '0000180D-0000-1000-8000-00805F9B34FB']) {
    assert.ok(isHeartRateServiceUuid(u), u);
  }
  for (const u of ['1814', '2a37', '0000180f-0000-1000-8000-00805f9b34fb', '']) {
    assert.ok(!isHeartRateServiceUuid(u), u);
  }
});

test('heart-rate recovery: drop 60 s into the recovery after each hard interval', async () => {
  const { addHrSample, EMPTY_HR_STATS, summarizeHr } = await import('../src/domain/hrStats.ts');
  let s = EMPTY_HR_STATS;
  let t = 0;
  const add = (bpm: number, phaseKind: 'work' | 'rest', round: number, elapsed: number, remaining: number) => {
    t += 1000;
    s = addHrSample(s, { at: t, bpm, phaseKind, inZone: true, round, phaseElapsedMs: elapsed, phaseRemainingMs: remaining });
  };
  for (const [round, peak, after] of [[1, 160, 130], [2, 165, 140]] as const) {
    for (let i = 0; i < 20; i++) add(peak, 'work', round, 220_000 + i * 1000, 20_000 - i * 1000);
    for (let i = 0; i < 70; i++) add(i < 60 ? peak - i * 0.5 : after, 'rest', round, i * 1000, 180_000 - i * 1000);
  }
  const summary = summarizeHr(s)!;
  assert.deepEqual(summary.recovery, [30, 25]);
  assert.equal(summary.recoveryAvg, 28);
});

test('no recovery without readings at the end of the interval', async () => {
  const { addHrSample, EMPTY_HR_STATS, summarizeHr } = await import('../src/domain/hrStats.ts');
  let s = EMPTY_HR_STATS;
  for (let i = 0; i < 70; i++) s = addHrSample(s, { at: i * 1000, bpm: 120, phaseKind: 'rest', inZone: true, round: 1, phaseElapsedMs: i * 1000 });
  assert.equal(summarizeHr(s)?.recovery, undefined);
});
