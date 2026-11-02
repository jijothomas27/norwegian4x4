import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  backupFileName,
  buildBackup,
  csvField,
  mergeSettings,
  needsBackupNudge,
  parseBackup,
  planRestore,
  sessionsToCsv,
  summarizeBackup,
  type BackupParsers,
} from '../src/domain/backup.ts';
import { decodeSeries, encodeSeries, type HrSeries } from '../src/domain/hrSeries.ts';
import type { RoutePoint } from '../src/domain/track.ts';
import { DEFAULT_SETTINGS, parsePersisted, type MetricEntry, type PersistedState, type SessionEntry } from '../src/state/model.ts';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 1, 12, 0).getTime();

const parsers: BackupParsers<HrSeries> = {
  journal: parsePersisted,
  hr: (raw) => decodeSeries(JSON.stringify(raw)),
};

function session(id: string, startedAt: number, extra: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id,
    type: 'session',
    protocolId: 'norwegian-4x4',
    startedAt,
    endedAt: startedAt + 40 * 60_000,
    durationSec: 2400,
    roundsCompleted: 4,
    totalRounds: 4,
    completed: true,
    ...extra,
  };
}

function metric(id: string, at: number, extra: Partial<MetricEntry> = {}): MetricEntry {
  return { id, type: 'metric', at, ...extra };
}

const series: HrSeries = {
  bucketSec: 3,
  maxHr: 180,
  stages: [
    { kind: 'warmup', tone: 'warmup', startSec: 0, endSec: 60, low: 108, high: 126 },
    { kind: 'work', tone: 'intense', round: 1, startSec: 60, endSec: 300, low: 153, high: 171 },
  ],
  points: Array.from({ length: 40 }, (_, i) => [i * 3, 100 + i] as const),
};

const route: RoutePoint[] = [
  [40.7128, -74.006, 0],
  [40.7138, -74.005, 1],
  [40.7148, -74.004, 1],
];

const journal: PersistedState = {
  version: 1,
  sessions: [
    session('b', NOW - DAY, {
      hasHrSeries: true,
      hr: { avg: 141, max: 172, inZonePct: 78.4, sustainedMax: 169, recovery: [31, 28], recoveryAvg: 29.5 },
      vo2Estimate: 44.26,
    }),
    session('a', NOW - 3 * DAY, {
      protocolId: 'japanese-iwt',
      gps: { distanceM: 3218.688, climbM: 12.4, workPaceSecPerKm: 400, stages: [], hasRoute: true },
    }),
  ],
  metrics: [metric('m1', NOW - 2 * DAY, { vo2max: 43, weightKg: 80 })],
  settings: { ...DEFAULT_SETTINGS, maxHr: 182, restingHr: 55, restingHrAt: NOW - 5 * DAY, distanceUnit: 'mi' },
};

function backupText(j: PersistedState = journal, extra: Record<string, unknown> = {}): string {
  const file = buildBackup({
    journal: j,
    routes: { a: route },
    hr: { b: JSON.parse(encodeSeries(series)) },
    exportedAt: NOW,
    appVersion: '1.0.0',
  });
  return JSON.stringify({ ...file, ...extra });
}

test('round trip keeps journal, routes and heart-rate graphs', () => {
  const result = parseBackup(backupText(), parsers);
  assert.ok(result.ok);
  const { backup } = result;
  assert.deepEqual(backup.journal, parsePersisted(JSON.stringify(journal)));
  assert.deepEqual(backup.routes, { a: route });
  assert.deepEqual(backup.hr.b, series);
  assert.equal(backup.exportedAt, NOW);
  assert.equal(backup.skipped, 0);
  assert.deepEqual(summarizeBackup(backup), {
    sessions: 2,
    metrics: 1,
    routes: 1,
    hrGraphs: 1,
    oldest: NOW - 3 * DAY,
    newest: NOW - DAY,
  });
});

test('bad files give a friendly error', () => {
  const cases: [string, RegExp][] = [
    ['not json {', /isn’t a Tempo backup/],
    [JSON.stringify([1, 2, 3]), /isn’t a Tempo backup/],
    [JSON.stringify({ format: 'something-else', version: 1 }), /isn’t a Tempo backup/],
    [JSON.stringify({ format: 'tempo-backup', version: 2, journal: {} }), /newer version/],
    [JSON.stringify({ format: 'tempo-backup', version: 1 }), /no journal/],
    [JSON.stringify({ format: 'tempo-backup', version: 1, journal: { sessions: [], metrics: [] } }), /no sessions or readings/],
  ];
  for (const [text, error] of cases) {
    const result = parseBackup(text, parsers);
    assert.equal(result.ok, false, text);
    if (!result.ok) assert.match(result.error, error);
  }
});

test('unreadable entries are skipped and counted; flags follow what was restored', () => {
  const data = JSON.parse(backupText());
  data.journal.sessions.push({ id: 'broken', type: 'session', protocolId: 'nope' });
  data.journal.sessions.push({ ...data.journal.sessions[0] }); // duplicate id 'b'
  data.routes.a = [[1, 2]]; // too short / malformed
  data.routes.ghost = route; // no such session: ignored, not counted
  data.hr.b = { v: 99 };
  const result = parseBackup(JSON.stringify(data), parsers);
  assert.ok(result.ok);
  const { backup } = result;
  assert.deepEqual(
    backup.journal.sessions.map((s) => s.id),
    ['b', 'a'],
  );
  assert.equal(backup.skipped, 4); // broken session, duplicate, bad route, bad hr
  assert.deepEqual(backup.routes, {});
  assert.deepEqual(backup.hr, {});
  const b = backup.journal.sessions.find((s) => s.id === 'b');
  const a = backup.journal.sessions.find((s) => s.id === 'a');
  assert.equal(b?.hasHrSeries, undefined);
  assert.equal(a?.gps?.hasRoute, false);
});

test('merge adds only what is missing and keeps the phone’s copy', () => {
  const phone: PersistedState = {
    version: 1,
    sessions: [session('b', NOW - DAY, { roundsCompleted: 3 }), session('c', NOW)],
    metrics: [],
    settings: { ...DEFAULT_SETTINGS, maxHr: 190, voiceId: 'phone-voice' },
  };
  const incoming = parsePersisted(JSON.stringify({ ...journal, settings: { ...journal.settings, voiceId: 'old-voice' } }));
  const plan = planRestore(phone, incoming, 'merge');
  assert.deepEqual(
    plan.journal.sessions.map((s) => s.id),
    ['c', 'b', 'a'],
  );
  assert.equal(plan.journal.sessions.find((s) => s.id === 'b')?.roundsCompleted, 3);
  assert.deepEqual(plan.writeIds, ['a']);
  assert.deepEqual(plan.removeIds, []);
  assert.deepEqual(plan.added, { sessions: 1, metrics: 1 });
  assert.deepEqual(plan.alreadyHere, { sessions: 1, metrics: 0 });
  assert.equal(plan.journal.settings.maxHr, 190); // phone wins
  assert.equal(plan.journal.settings.voiceId, 'phone-voice');
  assert.equal(plan.journal.settings.restingHr, 55); // gap filled
  assert.equal(plan.journal.settings.distanceUnit, 'mi');
});

test('merge into an empty phone takes the backup’s settings', () => {
  const empty: PersistedState = { version: 1, sessions: [], metrics: [], settings: DEFAULT_SETTINGS };
  const incoming = parsePersisted(JSON.stringify({ ...journal, settings: { ...journal.settings, weightUnit: 'lbs' } }));
  const plan = planRestore(empty, incoming, 'merge', NOW - DAY);
  assert.equal(plan.journal.settings.weightUnit, 'lbs');
  assert.equal(plan.journal.settings.maxHr, 182);
  assert.deepEqual(plan.writeIds.sort(), ['a', 'b']);
  // Everything on the phone came from that backup, so it counts as backed up then.
  assert.equal(plan.journal.settings.lastBackupAt, NOW - DAY);
});

test('merging into a phone with its own data doesn’t claim it is backed up', () => {
  const phone: PersistedState = { version: 1, sessions: [session('c', NOW)], metrics: [], settings: DEFAULT_SETTINGS };
  const plan = planRestore(phone, parsePersisted(JSON.stringify(journal)), 'merge', NOW - DAY);
  assert.equal(plan.journal.settings.lastBackupAt, undefined);
});

test('replace makes the phone match the backup', () => {
  const phone: PersistedState = {
    version: 1,
    sessions: [session('b', NOW - DAY, { roundsCompleted: 3 }), session('c', NOW)],
    metrics: [metric('m9', NOW)],
    settings: { ...DEFAULT_SETTINGS, lastBackupAt: NOW - DAY },
  };
  const incoming = parsePersisted(JSON.stringify(journal));
  const plan = planRestore(phone, incoming, 'replace', NOW - 3 * DAY);
  assert.deepEqual(
    plan.journal.sessions.map((s) => s.id),
    ['b', 'a'],
  );
  assert.equal(plan.journal.sessions[0].roundsCompleted, 4);
  assert.deepEqual(
    plan.journal.metrics.map((m) => m.id),
    ['m1'],
  );
  assert.deepEqual(plan.removeIds, ['c']);
  assert.deepEqual(plan.writeIds, ['b', 'a']);
  assert.equal(plan.journal.settings.maxHr, 182);
  assert.equal(plan.journal.settings.lastBackupAt, NOW - DAY); // the later of phone and backup
});

test('settings merge keeps the newer resting HR and the higher learned max', () => {
  const merged = mergeSettings(
    { ...DEFAULT_SETTINGS, restingHr: 58, restingHrAt: 100, learnedMaxHr: 178, learnedMaxHrAt: 50 },
    { ...DEFAULT_SETTINGS, restingHr: 54, restingHrAt: 200, learnedMaxHr: 175, learnedMaxHrAt: 300, voiceId: 'x', haptics: false },
  );
  assert.equal(merged.restingHr, 54);
  assert.equal(merged.restingHrAt, 200);
  assert.equal(merged.learnedMaxHr, 178);
  assert.equal(merged.learnedMaxHrAt, 50);
  assert.equal(merged.voiceId, undefined);
  assert.equal(merged.haptics, true);
});

test('backup reminder after 30 days of unsaved sessions', () => {
  const s = (daysAgo: number) => ({ startedAt: NOW - daysAgo * DAY });
  assert.equal(needsBackupNudge([], {}, NOW), false);
  assert.equal(needsBackupNudge([s(10)], {}, NOW), false);
  assert.equal(needsBackupNudge([s(31), s(2)], {}, NOW), true);
  assert.equal(needsBackupNudge([s(50)], { lastBackupAt: NOW - 40 * DAY }, NOW), false); // nothing new since
  assert.equal(needsBackupNudge([s(50), s(3)], { lastBackupAt: NOW - 40 * DAY }, NOW), true);
  assert.equal(needsBackupNudge([s(3)], { lastBackupAt: NOW - 20 * DAY }, NOW), false);
  assert.equal(needsBackupNudge([s(31)], { backupSnoozedAt: NOW - 5 * DAY }, NOW), false);
});

test('CSV: one row per session, oldest first, in the chosen unit', () => {
  const csv = sessionsToCsv(journal.sessions, {
    distanceUnit: 'mi',
    protocolName: (id) => (id === 'norwegian-4x4' ? 'Norwegian 4×4' : 'Japanese Interval Walking'),
  });
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(
    lines[0],
    'date,start_time,protocol,completed,duration_min,rounds_completed,rounds_total,avg_hr,peak_hr,peak_hr_10s,in_zone_pct,recovery_avg_bpm,vo2_estimate,distance_mi,hard_pace_min_per_mi,climb_m',
  );
  const a = new Date(NOW - 3 * DAY);
  const date = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`;
  // 400 s/km = 643.7 s/mi → 10:44; 3218.688 m = 2 mi
  assert.equal(lines[1], `${date},12:00,Japanese Interval Walking,yes,40,4,4,,,,,,,2,10:44,12`);
  assert.match(lines[2], /,Norwegian 4×4,yes,40,4,4,141,172,169,78,30,44.3,,,$/);
});

test('CSV fields are quoted and formulas defused', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a, b'), '"a, b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvField(-3), '-3');
  assert.equal(csvField(null), '');
  assert.equal(csvField(undefined), '');
});

test('file names use the local date', () => {
  assert.equal(backupFileName(new Date(2026, 0, 5, 23, 59).getTime(), 'json'), 'tempo-backup-2026-01-05.json');
  assert.equal(backupFileName(new Date(2026, 10, 1).getTime(), 'csv'), 'tempo-sessions-2026-11-01.csv');
});
