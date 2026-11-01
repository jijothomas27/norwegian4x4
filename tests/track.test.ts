import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPhases, JAPANESE_IWT } from '../src/domain/protocols.ts';
import {
  briskPaceTarget,
  cleanTrack,
  defaultDistanceUnit,
  distanceM,
  encodeRoute,
  formatDistance,
  formatPace,
  projectRoute,
  spokenPace,
  summarizeTrack,
  type TrackPoint,
} from '../src/domain/track.ts';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
// Walking north: 1e-5° latitude ≈ 1.112 m.
const M_PER_DEG = distanceM({ lat: 40, lon: -74 }, { lat: 41, lon: -74 });

/** One fix per second, walking north at `speeds[i]` m/s during minute i. */
function walk(speedsPerMinute: number[], start = T0): TrackPoint[] {
  const pts: TrackPoint[] = [];
  let lat = 40;
  let t = start;
  for (const v of speedsPerMinute) {
    for (let s = 0; s < 60; s++) {
      pts.push({ t, lat, lon: -74, acc: 5, alt: 10 });
      lat += v / M_PER_DEG;
      t += 1000;
    }
  }
  pts.push({ t, lat, lon: -74, acc: 5, alt: 10 });
  return pts;
}

test('haversine: one degree of latitude is ~111 km', () => {
  assert.ok(Math.abs(M_PER_DEG - 111_195) < 50);
});

test('cleanTrack drops inaccurate fixes and GPS jumps', () => {
  const pts = walk([1.5]).slice(0, 10);
  pts.splice(3, 0, { t: pts[2].t + 500, lat: 40.01, lon: -74, acc: 5 }); // 1 km jump in half a second
  pts.splice(6, 0, { t: pts[5].t + 500, lat: pts[5].lat, lon: -74, acc: 80 }); // poor accuracy
  const clean = cleanTrack(pts);
  assert.equal(clean.length, 10);
  assert.ok(clean.every((p) => p.acc === 5));
});

test('summarizeTrack splits distance and pace by stage (Japanese walking)', () => {
  const phases = buildPhases(JAPANESE_IWT); // 3 warm-up, 5×(3 brisk + 3 easy), 3 cool-down
  // Warm-up 1.2 m/s, round 1 brisk 1.8 m/s, round 1 easy 1.1 m/s.
  const pts = walk([1.2, 1.2, 1.2, 1.8, 1.8, 1.8, 1.1, 1.1, 1.1]);
  const s = summarizeTrack(pts, phases, (t) => t - T0);
  const brisk = s.stages[1];
  assert.equal(brisk.kind, 'work');
  assert.equal(brisk.round, 1);
  assert.ok(Math.abs(brisk.distanceM - 3 * 60 * 1.8) < 3);
  assert.ok(Math.abs(brisk.paceSecPerKm! - 1000 / 1.8) < 2);
  assert.ok(Math.abs(s.stages[2].paceSecPerKm! - 1000 / 1.1) < 2);
  assert.ok(Math.abs(s.distanceM - 60 * (3 * 1.2 + 3 * 1.8 + 3 * 1.1)) < 5);
  assert.ok(Math.abs(s.workPaceSecPerKm! - 1000 / 1.8) < 2);
  assert.equal(s.stages[3].paceSecPerKm, null); // not reached yet
});

test('paused stretches are left out', () => {
  const phases = buildPhases(JAPANESE_IWT);
  const pts = walk([1.2, 1.2, 1.2, 1.2]);
  const s = summarizeTrack(pts, phases, (t) => (t - T0 < 2 * MIN ? t - T0 : null)); // paused after 2 min
  assert.ok(Math.abs(s.distanceM - 2 * 60 * 1.2) < 3);
});

test('climb ignores small altitude wobble', () => {
  const phases = buildPhases(JAPANESE_IWT);
  const pts = walk([1.2, 1.2]).map((p, i) => ({ ...p, alt: 10 + (i % 2) * 2 + (i > 60 ? 20 : 0) }));
  const s = summarizeTrack(pts, phases, (t) => t - T0);
  assert.ok(s.climbM >= 18 && s.climbM <= 24, `climb ${s.climbM}`);
});

test('encodeRoute keeps a point every few metres and at stage changes', () => {
  const phases = buildPhases(JAPANESE_IWT);
  const pts = walk([1.2, 1.2, 1.2, 1.8]);
  const route = encodeRoute(pts, phases, (t) => t - T0);
  assert.ok(route.length > 30 && route.length < 60, `${route.length} points`);
  assert.equal(route[0][2], 0);
  assert.equal(route[route.length - 1][2], 1);
  const xy = projectRoute(route, 300, 200);
  assert.ok(xy.every((p) => p.x >= 0 && p.x <= 300 && p.y >= 0 && p.y <= 200));
  assert.ok(xy[0].y > xy[xy.length - 1].y, 'north is up');
});

test('formatting in miles and kilometres', () => {
  assert.equal(formatPace(1000 / 1.8, 'km'), '9:16 /km');
  assert.equal(formatPace(1000 / 1.8, 'mi'), '14:54 /mi');
  assert.equal(formatPace(null, 'mi'), '—');
  assert.equal(formatDistance(2414, 'mi'), '1.50 mi');
  assert.equal(formatDistance(350, 'km'), '350 m');
  assert.equal(formatDistance(2414, 'km'), '2.41 km');
  assert.equal(spokenPace(360, 'km'), '6 minutes per kilometre');
  assert.equal(defaultDistanceUnit('en-US'), 'mi');
  assert.equal(defaultDistanceUnit('nb-NO'), 'km');
  assert.equal(defaultDistanceUnit(undefined), 'km');
});

test('brisk pace target prefers walks that were in zone', () => {
  assert.equal(briskPaceTarget([]), null);
  assert.equal(briskPaceTarget([{ workPaceSecPerKm: 600 }, { workPaceSecPerKm: 560 }, { workPaceSecPerKm: 580 }]), 580);
  assert.equal(
    briskPaceTarget([
      { workPaceSecPerKm: 650, inZonePct: 20 },
      { workPaceSecPerKm: 540, inZonePct: 80 },
      { workPaceSecPerKm: 560, inZonePct: 70 },
    ]),
    550,
  );
});
