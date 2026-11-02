import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanSamples,
  efficiencyIndex,
  efficiencySamples,
  efficiencyTrend,
  paceAtFraction,
  sessionEfficiency,
  type EfficiencyPoint,
  type GpsStage,
} from '../src/domain/efficiency.ts';
import type { HrSeries, SeriesStage } from '../src/domain/hrSeries.ts';

const DAY = 86_400_000;
const REF = { restHr: 60, maxHr: 180 };

/** Interval Walking plan: 3 min warm-up, then `rounds` × (3 min fast + 3 min slow). */
function plan(rounds: number): SeriesStage[] {
  const stages: SeriesStage[] = [{ kind: 'warmup', tone: 'warmup', startSec: 0, endSec: 180 }];
  let t = 180;
  for (let r = 1; r <= rounds; r++) {
    stages.push({ kind: 'work', tone: 'brisk', round: r, startSec: t, endSec: t + 180 });
    stages.push({ kind: 'rest', tone: 'easy', round: r, startSec: t + 180, endSec: t + 360 });
    t += 360;
  }
  return stages;
}

/** Heart rate: 100 bpm, rising over the first minute of each fast walk to `workHr`. */
function series(rounds: number, workHr: number | ((round: number) => number), skip: (t: number) => boolean = () => false): HrSeries {
  const stages = plan(rounds);
  const points: [number, number][] = [];
  const end = stages[stages.length - 1].endSec;
  for (let t = 0; t < end; t += 3) {
    if (skip(t)) continue;
    const work = stages.find((s) => s.kind === 'work' && t >= s.startSec && t < s.endSec);
    const target = typeof workHr === 'function' ? workHr(work?.round ?? 0) : workHr;
    const bpm = work ? (t - work.startSec < 60 ? 100 + ((target - 100) * (t - work.startSec)) / 60 : target) : 100;
    points.push([t, Math.round(bpm)]);
  }
  return { bucketSec: 3, maxHr: 180, stages, points };
}

function gps(rounds: number, extra: (round: number) => Partial<GpsStage> = () => ({})): GpsStage[] {
  const out: GpsStage[] = [];
  for (let r = 1; r <= rounds; r++) {
    out.push({ kind: 'work', round: r, distanceM: 300, paceSecPerKm: 640, steadyPaceSecPerKm: 625, climbM: 0, movingSec: 180, ...extra(r) });
    out.push({ kind: 'rest', round: r, distanceM: 200, paceSecPerKm: 900, climbM: 0, movingSec: 180 });
  }
  return out;
}

test('samples use the steady part: steady pace and heart rate after the first minute', () => {
  const samples = efficiencySamples(gps(2), series(2, 150));
  assert.equal(samples.length, 2);
  assert.deepEqual(samples[0], { round: 1, speedMps: 1.6, hr: 150 });
});

test('sessions recorded before steady pace was kept fall back to the whole interval', () => {
  const samples = efficiencySamples(gps(2, () => ({ steadyPaceSecPerKm: undefined, movingSec: undefined })), series(2, 150));
  assert.equal(samples[0].speedMps, 1.563);
});

test('intervals that are hilly, poorly tracked, too fast or missing heart rate are left out', () => {
  const s = series(5, 150, (t) => t >= 1300 && t < 1400); // round 4 (1260–1440) loses 100 s of readings
  const stages = gps(5, (r) =>
    r === 1 ? { climbM: 9 } : r === 2 ? { movingSec: 120 } : r === 3 ? { steadyPaceSecPerKm: 300 } : {},
  );
  assert.deepEqual(
    efficiencySamples(stages, s).map((x) => x.round),
    [5],
  );
});

test('index: speed per unit of heart-rate reserve, shown as pace at 75% of max', () => {
  const index = efficiencyIndex({ speedMps: 1.6, hr: 150 }, REF)!; // 75% of reserve
  assert.ok(Math.abs(index - 1.6 / 0.75) < 1e-9);
  // 75% of max = 135 bpm = 62.5% of reserve → 1.333 m/s → 750 s/km.
  assert.ok(Math.abs(paceAtFraction(index, REF)! - 750) < 1e-6);
  assert.equal(efficiencyIndex({ speedMps: 1.6, hr: 70 }, REF), null); // barely above rest: noise
  assert.equal(efficiencyIndex({ speedMps: 1.6, hr: 150 }, { restHr: 60, maxHr: 90 }), null);
});

test('a session needs two good intervals; its value is their median', () => {
  const one = [{ round: 1, speedMps: 1.6, hr: 150 }];
  assert.equal(sessionEfficiency(one, REF), null);
  const three = [...one, { round: 2, speedMps: 1.5, hr: 150 }, { round: 3, speedMps: 1.9, hr: 150 }];
  assert.ok(Math.abs(sessionEfficiency(three, REF)! - 1.6 / 0.75) < 1e-9);
});

test('same walk at a lower heart rate scores higher', () => {
  const fitter = sessionEfficiency(efficiencySamples(gps(3), series(3, 140)), REF)!;
  const before = sessionEfficiency(efficiencySamples(gps(3), series(3, 150)), REF)!;
  assert.ok(fitter > before);
});

const points = (days: number[], index: (d: number) => number, start = 1_780_000_000_000): EfficiencyPoint[] =>
  days.map((d) => ({ at: start + d * DAY, index: index(d) }));

test('trend: no comparison before four weeks of history', () => {
  const t = efficiencyTrend(points([0, 3, 7, 10, 20], () => 2))!;
  assert.equal(t.baseline, null);
  assert.equal(t.spanDays, 20);
  assert.equal(t.sessions, 5);
  assert.equal(efficiencyTrend([]), null);
});

test('trend: with 4–6 weeks, compares recent sessions with the first week', () => {
  const t = efficiencyTrend(points([0, 2, 5, 12, 19, 26, 30, 33], (d) => (d < 7 ? 2 : d > 20 ? 2.2 : 2.1)))!;
  assert.equal(t.baseline?.index, 2);
  assert.equal(t.current, 2.2);
});

test('trend: with longer history, compares with about six weeks before the latest', () => {
  const days = Array.from({ length: 30 }, (_, i) => i * 3); // every 3 days for 87 days
  const t = efficiencyTrend(points(days, (d) => 2 + d / 1000))!;
  // Latest is day 87, so ~day 45 (window 38–52) is the baseline; the last two weeks (days 75–87, last four) are current.
  assert.ok(Math.abs(t.baseline!.index - 2.045) < 1e-9);
  assert.ok(Math.abs(t.current - 2.0825) < 1e-9);
  assert.equal(Math.round((t.currentAt - t.baseline!.at) / DAY), 42);
});

test('stored samples are read defensively', () => {
  assert.deepEqual(cleanSamples('x'), []);
  assert.deepEqual(cleanSamples([{ round: 1, speedMps: 1.6, hr: 150 }, { round: 2, speedMps: 'fast', hr: 150 }, null]), [
    { round: 1, speedMps: 1.6, hr: 150 },
  ]);
});
