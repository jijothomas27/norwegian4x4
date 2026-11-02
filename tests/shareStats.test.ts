import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickShareStats } from '../src/domain/shareStats.ts';

const hr = { avg: 148, max: 176, inZonePct: 82, sustainedMax: 172, recoveryAvg: 31 };

test('4×4 leads with time in zone, peak HR and VO₂', () => {
  const stats = pickShareStats({ protocolId: 'norwegian-4x4', hr, vo2Estimate: 46.2, gps: { distanceM: 5200, workPaceSecPerKm: 330 } });
  assert.deepEqual(
    stats.map((s) => s.kind),
    ['inZone', 'peakHr', 'vo2', 'distance'],
  );
  assert.equal(stats[1].value, 172, 'uses the sustained peak, not a single-sample spike');
});

test('interval walking leads with distance and pace', () => {
  const stats = pickShareStats({ protocolId: 'japanese-iwt', hr, gps: { distanceM: 3100, workPaceSecPerKm: 560 } });
  assert.deepEqual(
    stats.map((s) => s.kind),
    ['distance', 'workPace', 'inZone', 'avgHr'],
  );
});

test('falls back through the list when data is missing', () => {
  const stats = pickShareStats({ protocolId: 'norwegian-4x4', hr: { avg: 140, max: 168, inZonePct: null } });
  assert.deepEqual(
    stats.map((s) => s.kind),
    ['peakHr', 'avgHr'],
  );
});

test('ignores a GPS track that barely moved', () => {
  const stats = pickShareStats({ protocolId: 'japanese-iwt', gps: { distanceM: 40 } });
  assert.equal(stats.length, 0);
});

test('no heart rate and no GPS gives no stats', () => {
  assert.deepEqual(pickShareStats({ protocolId: 'norwegian-4x4' }), []);
});
