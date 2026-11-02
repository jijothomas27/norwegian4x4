import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bucketSamples,
  buildSeries,
  decodeSeries,
  encodeSeries,
  splitAtGaps,
  stagesFromPhases,
  zoneStatsByRound,
  type RawHrSample,
} from '../src/domain/hrSeries.ts';
import { buildPhases, NORWEGIAN_4X4 } from '../src/domain/protocols.ts';

const phases = buildPhases(NORWEGIAN_4X4, { warmupMin: 10, rounds: 4 });
const MAX = 180; // work band 153–171

/** One reading per second from `fromSec` to `toSec` (exclusive), bpm given by `f`. */
function readings(fromSec: number, toSec: number, f: (sec: number) => number): RawHrSample[] {
  const out: RawHrSample[] = [];
  for (let s = fromSec; s < toSec; s++) out.push({ tMs: s * 1000, bpm: f(s) });
  return out;
}

test('buckets average the readings in each 3 s window, stamped at the bucket start', () => {
  const pts = bucketSamples([
    { tMs: 0, bpm: 100 },
    { tMs: 1000, bpm: 102 },
    { tMs: 2999, bpm: 104 },
    { tMs: 3000, bpm: 120 },
    { tMs: 7500, bpm: 130 },
  ]);
  assert.deepEqual(pts, [
    [0, 102],
    [3, 120],
    [6, 130],
  ]);
});

test('bucketing sorts out-of-order readings and drops implausible ones', () => {
  const pts = bucketSamples([
    { tMs: 6000, bpm: 140 },
    { tMs: 0, bpm: 100 },
    { tMs: 3000, bpm: 0 },
    { tMs: 3100, bpm: 300 },
    { tMs: -500, bpm: 90 },
    { tMs: Number.NaN, bpm: 90 },
  ]);
  assert.deepEqual(pts, [
    [0, 100],
    [6, 140],
  ]);
});

test('a 40-minute session at 1 Hz becomes ~800 points', () => {
  const pts = bucketSamples(readings(0, 2400, () => 130));
  assert.equal(pts.length, 800);
});

test('stages carry timeline offsets and bpm bands from the plan', () => {
  const stages = stagesFromPhases(phases, MAX);
  assert.equal(stages.length, phases.length);
  assert.deepEqual(stages[0], { kind: 'warmup', tone: 'warmup', startSec: 0, endSec: 600, low: 90, high: 126 });
  assert.deepEqual(stages[1], { kind: 'work', tone: 'intense', round: 1, startSec: 600, endSec: 840, low: 153, high: 171 });
  assert.equal(stages[stages.length - 1].endSec, 600 + 4 * (240 + 180) + 300);
});

test('without a known max heart rate the stages have no bands', () => {
  const stages = stagesFromPhases(phases, null);
  assert.equal(stages[1].low, undefined);
  assert.equal(stages[1].high, undefined);
});

test('too few readings give no series', () => {
  assert.equal(buildSeries(readings(0, 20, () => 120), phases, MAX), null);
  assert.ok(buildSeries(readings(0, 60, () => 120), phases, MAX));
});

test('gaps longer than 12 s split the line', () => {
  const runs = splitAtGaps([
    [0, 100],
    [3, 101],
    [6, 102],
    [30, 120],
    [33, 121],
  ]);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[1], [
    [30, 120],
    [33, 121],
  ]);
  assert.deepEqual(splitAtGaps([]), []);
});

test('time to zone: seconds into each hard interval until HR first reaches the band', () => {
  // HR climbs 1 bpm/s from 120 at the start of each interval, so it reaches 153 after ~33 s.
  const samples = [
    ...readings(0, 600, () => 110),
    ...readings(600, 840, (s) => Math.min(165, 120 + (s - 600))),
    ...readings(840, 1020, () => 120),
    // Round 2 is slower: 0.5 bpm/s → ~66 s.
    ...readings(1020, 1260, (s) => Math.min(165, 120 + (s - 1020) / 2)),
  ];
  const series = buildSeries(samples, phases, MAX)!;
  const stats = zoneStatsByRound(series);
  assert.equal(stats.length, 4);
  assert.equal(stats[0].round, 1);
  assert.ok(stats[0].timeToZoneSec! >= 30 && stats[0].timeToZoneSec! <= 36, `round 1: ${stats[0].timeToZoneSec}`);
  assert.ok(stats[1].timeToZoneSec! >= 63 && stats[1].timeToZoneSec! <= 69, `round 2: ${stats[1].timeToZoneSec}`);
  // Rounds 3–4 never happened: no data, not "never reached".
  assert.deepEqual(stats[2], { round: 3, timeToZoneSec: null, inZonePct: null, hasData: false });
});

test('time in zone per round, and "never reached" when HR stays low', () => {
  const samples = [
    ...readings(600, 840, (s) => (s < 720 ? 160 : 175)), // half in, half above
    ...readings(1020, 1260, () => 140), // never reaches 153
  ];
  const stats = zoneStatsByRound(buildSeries(samples, phases, MAX)!);
  assert.equal(stats[0].timeToZoneSec, 0);
  assert.equal(stats[0].inZonePct, 50);
  assert.equal(stats[1].timeToZoneSec, null);
  assert.equal(stats[1].inZonePct, 0);
  assert.equal(stats[1].hasData, true);
});

test('after a pause the series is continuous; after a skip the skipped time is a gap', () => {
  // Timeline time doesn't advance while paused, so a pause leaves no trace.
  // A skip jumps the timeline forward: here the rest of round 1 (720–840) is skipped.
  const samples = [...readings(600, 720, () => 160), ...readings(840, 1020, () => 120)];
  const series = buildSeries(samples, phases, MAX)!;
  const runs = splitAtGaps(series.points);
  assert.equal(runs.length, 2);
  assert.equal(runs[0][runs[0].length - 1][0], 717);
  assert.equal(runs[1][0][0], 840);
  assert.equal(zoneStatsByRound(series)[0].inZonePct, 100, 'only the time actually done counts');
});

test('encode → decode round-trips, and stays small', () => {
  const samples = readings(0, 2580, (s) => 110 + Math.round(40 * Math.sin(s / 200)));
  const series = buildSeries(samples, phases, MAX)!;
  const raw = encodeSeries(series);
  assert.deepEqual(decodeSeries(raw), series);
  assert.ok(raw.length < 15_000, `encoded size ${raw.length}`);
});

test('decode round-trips a series with no max heart rate', () => {
  const series = buildSeries(readings(0, 120, () => 100), phases, null)!;
  assert.deepEqual(decodeSeries(encodeSeries(series)), series);
});

test('decode rejects malformed input', () => {
  assert.equal(decodeSeries(null), null);
  assert.equal(decodeSeries('not json'), null);
  assert.equal(decodeSeries('[]'), null);
  assert.equal(decodeSeries(JSON.stringify({ v: 2, b: 3, m: 180, s: [], p: [] })), null);
  assert.equal(decodeSeries(JSON.stringify({ v: 1, b: 3, m: 180, s: [], p: [0, 100, 3] })), null, 'odd point list');
  assert.equal(decodeSeries(JSON.stringify({ v: 1, b: 3, m: 180, s: [['sprint', 'intense', 1, 0, 60, 150, 170]], p: [] })), null);
  assert.equal(decodeSeries(JSON.stringify({ v: 1, b: 3, m: 180, s: [], p: [0, 'x'] })), null);
});
