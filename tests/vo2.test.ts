import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addHrSample, EMPTY_HR_STATS, summarizeHr } from '../src/domain/hrStats.ts';
import {
  calibrateFactor,
  estimateVo2Max,
  learnMaxHr,
  restingFromSamples,
  UTH_FACTOR,
} from '../src/domain/vo2.ts';
import { effectiveMaxHr } from '../src/domain/zones.ts';

test('heart-rate ratio estimate: 15.3 × HRmax / HRrest', () => {
  assert.equal(estimateVo2Max(180, 60), 45.9);
  assert.equal(estimateVo2Max(190, 50), 58.1);
  assert.equal(estimateVo2Max(180, 60, 14.6), 43.8);
});

test('estimate rejects implausible inputs', () => {
  assert.equal(estimateVo2Max(180, 20), null);
  assert.equal(estimateVo2Max(100, 60), null);
  assert.equal(estimateVo2Max(140, 110), null);
});

test('calibration reproduces the reference reading', () => {
  const k = calibrateFactor(44, 180, 60)!;
  assert.equal(k, 14.67);
  assert.ok(Math.abs(estimateVo2Max(180, 60, k)! - 44) < 0.1);
  // nonsense reference → no calibration
  assert.equal(calibrateFactor(90, 150, 80), null);
  assert.ok(UTH_FACTOR > 14 && UTH_FACTOR < 16);
});

test('learned max only rises and ignores glitches', () => {
  assert.equal(learnMaxHr(undefined, 176), 176);
  assert.equal(learnMaxHr(180, 176), 180);
  assert.equal(learnMaxHr(180, 184), 184);
  assert.equal(learnMaxHr(180, 250), 180);
  assert.equal(learnMaxHr(180, undefined), 180);
});

test('max HR: workouts beat the age estimate only when higher; measured always wins', () => {
  assert.deepEqual(effectiveMaxHr({ age: 45, learnedMaxHr: 170 }), { bpm: 177, source: 'age' });
  assert.deepEqual(effectiveMaxHr({ age: 45, learnedMaxHr: 184 }), { bpm: 184, source: 'workouts' });
  assert.deepEqual(effectiveMaxHr({ age: 45, learnedMaxHr: 184, maxHr: 181 }), { bpm: 181, source: 'measured' });
  assert.deepEqual(effectiveMaxHr({ learnedMaxHr: 175 }), { bpm: 175, source: 'workouts' });
});

test('sustained peak ignores a one-second spike', () => {
  let s = EMPTY_HR_STATS;
  for (let i = 0; i < 60; i++) {
    const bpm = i === 30 ? 205 : 170; // optical-sensor glitch at 30 s
    s = addHrSample(s, { at: i * 1000, bpm, phaseKind: 'work', inZone: true });
  }
  const sum = summarizeHr(s)!;
  assert.equal(sum.max, 205);
  assert.ok(sum.sustainedMax <= 174, `sustained ${sum.sustainedMax}`);
  assert.ok(sum.sustainedMax >= 170);
});

test('resting HR uses the last minute of a check', () => {
  const samples = Array.from({ length: 120 }, (_, i) => ({ at: i * 1000, bpm: i < 60 ? 72 : 58 }));
  assert.equal(restingFromSamples(samples), 58);
  assert.equal(restingFromSamples(samples.slice(0, 5)), null);
});
