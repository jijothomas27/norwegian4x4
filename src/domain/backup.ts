import type { PersistedState, SessionEntry, Settings } from '../state/model';
import type { DistanceUnit, RoutePoint } from './track';

/**
 * Backup, restore and CSV export of the journal. Pure logic, unit-tested in
 * tests/backup.test.ts.
 *
 * Domain files can't value-import each other (tests run under Node's type
 * stripping), so the journal and heart-rate parsers are passed in by the
 * caller instead of imported.
 */

export const BACKUP_FORMAT = 'tempo-backup';
export const BACKUP_VERSION = 1;

/** The file as written to disk. */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** epoch ms */
  exportedAt: number;
  app?: { version?: string };
  journal: PersistedState;
  /** GPS route per session id. */
  routes: Record<string, RoutePoint[]>;
  /** Heart-rate series per session id, in its stored (encoded) JSON form. */
  hr: Record<string, unknown>;
}

export function buildBackup(input: {
  journal: PersistedState;
  routes: Record<string, RoutePoint[]>;
  hr: Record<string, unknown>;
  exportedAt: number;
  appVersion?: string;
}): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: input.exportedAt,
    app: input.appVersion ? { version: input.appVersion } : undefined,
    journal: input.journal,
    routes: input.routes,
    hr: input.hr,
  };
}

/** "tempo-backup-2026-11-01.json" (local date). */
export function backupFileName(at: number, kind: 'json' | 'csv'): string {
  const d = new Date(at);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return kind === 'json' ? `tempo-backup-${date}.json` : `tempo-sessions-${date}.csv`;
}

// ---------------------------------------------------------------------------
// Reading a backup

export interface BackupParsers<H> {
  /** Defensive journal parse (state/model.ts `parsePersisted`). Takes raw JSON text. */
  journal: (raw: string) => PersistedState;
  /** Decodes one stored heart-rate series, or null if it's unusable. */
  hr: (raw: unknown) => H | null;
}

export interface ParsedBackup<H> {
  exportedAt: number | null;
  journal: PersistedState;
  routes: Record<string, RoutePoint[]>;
  hr: Record<string, H>;
  /** Entries in the file that couldn't be read and will be left out. */
  skipped: number;
}

export type ParseResult<H> = { ok: true; backup: ParsedBackup<H> } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function parseRoute(raw: unknown): RoutePoint[] | null {
  if (!Array.isArray(raw)) return null;
  const points = raw.filter((p): p is RoutePoint => Array.isArray(p) && p.length === 3 && p.every(finite));
  return points.length >= 2 ? points : null;
}

/**
 * Validates a backup file. Never throws: a bad file gives a friendly error
 * and nothing else. Routes and heart-rate series are only kept for sessions
 * that are in the backup's journal.
 */
export function parseBackup<H>(text: string, parsers: BackupParsers<H>): ParseResult<H> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file isn’t a Tempo backup. Choose a file named like tempo-backup-2026-11-01.json.' };
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This file isn’t a Tempo backup. Choose a file named like tempo-backup-2026-11-01.json.' };
  }
  if (!finite(data.version) || data.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Tempo. Update the app, then try again.' };
  }
  if (!isObj(data.journal)) return { ok: false, error: 'This backup is damaged: it has no journal.' };

  const rawSessions = Array.isArray(data.journal.sessions) ? data.journal.sessions.length : 0;
  const rawMetrics = Array.isArray(data.journal.metrics) ? data.journal.metrics.length : 0;
  const journal = parsers.journal(JSON.stringify(data.journal));
  // Duplicate ids inside one file would confuse merging; keep the first.
  journal.sessions = uniqueById(journal.sessions);
  journal.metrics = uniqueById(journal.metrics);
  let skipped = rawSessions - journal.sessions.length + (rawMetrics - journal.metrics.length);

  if (journal.sessions.length === 0 && journal.metrics.length === 0) {
    return { ok: false, error: 'This backup has no sessions or readings in it.' };
  }

  const ids = new Set(journal.sessions.map((s) => s.id));
  const routes: Record<string, RoutePoint[]> = {};
  if (isObj(data.routes)) {
    for (const [id, raw] of Object.entries(data.routes)) {
      if (!ids.has(id)) continue;
      const route = parseRoute(raw);
      if (route) routes[id] = route;
      else skipped += 1;
    }
  }
  const hr: Record<string, H> = {};
  if (isObj(data.hr)) {
    for (const [id, raw] of Object.entries(data.hr)) {
      if (!ids.has(id)) continue;
      const series = parsers.hr(raw);
      if (series) hr[id] = series;
      else skipped += 1;
    }
  }

  // Flags must match what's actually restored, or screens would look for data that isn't there.
  journal.sessions = journal.sessions.map((s) => {
    const next = { ...s };
    if (next.hasHrSeries && !hr[s.id]) delete next.hasHrSeries;
    if (next.gps?.hasRoute && !routes[s.id]) next.gps = { ...next.gps, hasRoute: false };
    return next;
  });

  return {
    ok: true,
    backup: { exportedAt: finite(data.exportedAt) ? data.exportedAt : null, journal, routes, hr, skipped },
  };
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (typeof item.id === 'string' && !seen.has(item.id) ? (seen.add(item.id), true) : false));
}

export interface BackupSummary {
  sessions: number;
  metrics: number;
  routes: number;
  hrGraphs: number;
  /** startedAt of the oldest / newest session. */
  oldest: number | null;
  newest: number | null;
}

export function summarizeBackup(b: Pick<ParsedBackup<unknown>, 'journal' | 'routes' | 'hr'>): BackupSummary {
  const times = b.journal.sessions.map((s) => s.startedAt);
  return {
    sessions: b.journal.sessions.length,
    metrics: b.journal.metrics.length,
    routes: Object.keys(b.routes).length,
    hrGraphs: Object.keys(b.hr).length,
    oldest: times.length ? Math.min(...times) : null,
    newest: times.length ? Math.max(...times) : null,
  };
}

// ---------------------------------------------------------------------------
// Restoring

export type RestoreMode = 'merge' | 'replace';

export interface RestorePlan {
  journal: PersistedState;
  /** Sessions from the backup whose route / heart-rate data should be written. */
  writeIds: string[];
  /** Sessions no longer in the journal; their route / heart-rate data should be deleted. */
  removeIds: string[];
  added: { sessions: number; metrics: number };
  /** Already on the phone (same id), so left as they were. */
  alreadyHere: { sessions: number; metrics: number };
}

const newestFirst = <T>(at: (x: T) => number) => (a: T, b: T) => at(b) - at(a);

/**
 * Merge: add whatever the phone doesn't have yet; anything with the same id
 * stays as it is on the phone. Replace: the phone ends up exactly like the
 * backup.
 */
export function planRestore(
  current: PersistedState,
  incoming: PersistedState,
  mode: RestoreMode,
  /** When the backup was made. If the phone ends up holding only what's in it, that counts as backed up. */
  exportedAt: number | null = null,
): RestorePlan {
  const backedUpAt = (...times: (number | null | undefined)[]) => {
    const t = Math.max(0, ...times.filter((x): x is number => typeof x === 'number'));
    return t > 0 ? t : undefined;
  };

  if (mode === 'replace') {
    const keep = new Set(incoming.sessions.map((s) => s.id));
    return {
      journal: {
        version: 1,
        sessions: [...incoming.sessions].sort(newestFirst((s) => s.startedAt)),
        metrics: [...incoming.metrics].sort(newestFirst((m) => m.at)),
        settings: {
          ...incoming.settings,
          lastBackupAt: backedUpAt(current.settings.lastBackupAt, incoming.settings.lastBackupAt, exportedAt),
          reminders: current.settings.reminders,
        },
      },
      writeIds: incoming.sessions.map((s) => s.id),
      removeIds: current.sessions.filter((s) => !keep.has(s.id)).map((s) => s.id),
      added: { sessions: incoming.sessions.length, metrics: incoming.metrics.length },
      alreadyHere: { sessions: 0, metrics: 0 },
    };
  }

  const haveSessions = new Set(current.sessions.map((s) => s.id));
  const haveMetrics = new Set(current.metrics.map((m) => m.id));
  const newSessions = incoming.sessions.filter((s) => !haveSessions.has(s.id));
  const newMetrics = incoming.metrics.filter((m) => !haveMetrics.has(m.id));
  const phoneIsEmpty = current.sessions.length === 0 && current.metrics.length === 0;

  return {
    journal: {
      version: 1,
      sessions: [...current.sessions, ...newSessions].sort(newestFirst((s) => s.startedAt)),
      metrics: [...current.metrics, ...newMetrics].sort(newestFirst((m) => m.at)),
      // A fresh install has nothing worth keeping, so take the backup's settings as they are.
      settings: phoneIsEmpty
        ? {
            ...incoming.settings,
            lastBackupAt: backedUpAt(current.settings.lastBackupAt, incoming.settings.lastBackupAt, exportedAt),
            // Reminders need this phone's notification permission, so they're never taken from a backup.
            reminders: current.settings.reminders,
          }
        : mergeSettings(current.settings, incoming.settings),
    },
    writeIds: newSessions.map((s) => s.id),
    removeIds: [],
    added: { sessions: newSessions.length, metrics: newMetrics.length },
    alreadyHere: { sessions: incoming.sessions.length - newSessions.length, metrics: incoming.metrics.length - newMetrics.length },
  };
}

/**
 * The phone's settings win. Gaps are filled from the backup, the newer
 * resting heart rate is kept, and the higher learned max heart rate is kept.
 * The cue voice and reminders aren't copied: voices differ between phones,
 * and reminders need this phone's notification permission.
 */
export function mergeSettings(current: Settings, incoming: Settings): Settings {
  const out: Settings = { ...current };
  const fill = <K extends 'distanceUnit' | 'age' | 'maxHr' | 'hrDevice' | 'vo2Factor' | 'weeklyGoals'>(k: K) => {
    if (out[k] === undefined && incoming[k] !== undefined) out[k] = incoming[k];
  };
  fill('distanceUnit');
  fill('age');
  fill('maxHr');
  fill('hrDevice');
  fill('vo2Factor');
  fill('weeklyGoals');

  if (incoming.restingHr !== undefined && (current.restingHr === undefined || (incoming.restingHrAt ?? 0) > (current.restingHrAt ?? 0))) {
    out.restingHr = incoming.restingHr;
    out.restingHrAt = incoming.restingHrAt;
  }
  if (incoming.learnedMaxHr !== undefined && incoming.learnedMaxHr > (current.learnedMaxHr ?? 0)) {
    out.learnedMaxHr = incoming.learnedMaxHr;
    out.learnedMaxHrAt = incoming.learnedMaxHrAt;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reminder

export const BACKUP_NUDGE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * True when there are sessions that aren't in any backup and the last backup
 * (or the first unbacked-up session, or the last "not now") is over 30 days old.
 */
export function needsBackupNudge(
  sessions: readonly Pick<SessionEntry, 'startedAt'>[],
  settings: Pick<Settings, 'lastBackupAt' | 'backupSnoozedAt'>,
  now: number,
): boolean {
  const last = settings.lastBackupAt ?? 0;
  const unsaved = sessions.filter((s) => s.startedAt > last);
  if (unsaved.length === 0) return false;
  const since = Math.max(settings.lastBackupAt ?? Math.min(...unsaved.map((s) => s.startedAt)), settings.backupSnoozedAt ?? 0);
  return now - since > BACKUP_NUDGE_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------
// CSV

export const CSV_COLUMNS = [
  'date',
  'start_time',
  'protocol',
  'completed',
  'duration_min',
  'rounds_completed',
  'rounds_total',
  'avg_hr',
  'peak_hr',
  'peak_hr_10s',
  'in_zone_pct',
  'recovery_avg_bpm',
  'vo2_estimate',
  'distance',
  'hard_pace',
  'climb_m',
] as const;

/** Quotes a field when needed, and defuses spreadsheet formulas. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const METERS_PER_MILE = 1609.344;

function paceText(secPerKm: number | undefined, unit: DistanceUnit): string | null {
  if (!secPerKm || !Number.isFinite(secPerKm)) return null;
  const sec = Math.round(unit === 'mi' ? secPerKm * (METERS_PER_MILE / 1000) : secPerKm);
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

/**
 * One row per session, oldest first, for spreadsheets. Dates and times are
 * local. Distance and pace use the chosen unit (named in the header).
 * Starts with a byte-order mark so Excel reads the file as UTF-8.
 */
export function sessionsToCsv(
  sessions: readonly SessionEntry[],
  opts: { distanceUnit: DistanceUnit; protocolName: (id: SessionEntry['protocolId']) => string },
): string {
  const u = opts.distanceUnit;
  const header = CSV_COLUMNS.map((c) => (c === 'distance' ? `distance_${u}` : c === 'hard_pace' ? `hard_pace_min_per_${u}` : c));
  const rows = [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const d = new Date(s.startedAt);
      const distance = s.gps ? Math.round((s.gps.distanceM / (u === 'mi' ? METERS_PER_MILE : 1000)) * 100) / 100 : null;
      return [
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        opts.protocolName(s.protocolId),
        s.completed ? 'yes' : 'no',
        round1(s.durationSec / 60),
        s.roundsCompleted,
        s.totalRounds,
        s.hr?.avg,
        s.hr?.max,
        s.hr?.sustainedMax,
        s.hr?.inZonePct === null || s.hr?.inZonePct === undefined ? null : Math.round(s.hr.inZonePct),
        s.hr?.recoveryAvg === undefined ? null : Math.round(s.hr.recoveryAvg),
        s.vo2Estimate === undefined ? null : round1(s.vo2Estimate),
        distance,
        paceText(s.gps?.workPaceSecPerKm, u),
        s.gps ? Math.round(s.gps.climbM) : null,
      ]
        .map(csvField)
        .join(',');
    });
  return `﻿${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
