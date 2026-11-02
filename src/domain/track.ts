import type { Phase, PhaseKind } from './types';

/**
 * GPS maths: cleaning a raw track, distance / pace / climb per workout stage,
 * a compact route for the journal, and unit formatting. Pure and free of
 * runtime imports so it runs under plain Node in tests/track.test.ts.
 */

export interface TrackPoint {
  /** epoch ms */
  t: number;
  lat: number;
  lon: number;
  /** metres above sea level */
  alt?: number | null;
  /** horizontal accuracy, metres */
  acc?: number | null;
}

export type DistanceUnit = 'km' | 'mi';

export const METERS_PER_MILE = 1609.344;

/** Fixes worse than this are ignored (GPS still settling, under trees, between buildings). */
const MAX_ACCURACY_M = 25;
/** Faster than this between fixes is a GPS jump, not you. */
const MAX_SPEED_MPS = 10;
/** A longer gap between fixes isn't credited (signal lost). */
const MAX_GAP_MS = 15_000;
/** Ignore altitude wobble smaller than this when adding up climb. */
const CLIMB_HYSTERESIS_M = 3;
/** Below this distance a pace isn't meaningful. */
const MIN_PACE_DISTANCE_M = 40;

export function distanceM(a: Pick<TrackPoint, 'lat' | 'lon'>, b: Pick<TrackPoint, 'lat' | 'lon'>): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Drop inaccurate fixes and impossible jumps; sort by time. */
export function cleanTrack(points: readonly TrackPoint[]): TrackPoint[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: TrackPoint[] = [];
  for (const p of sorted) {
    if (p.acc != null && p.acc > MAX_ACCURACY_M) continue;
    const last = out[out.length - 1];
    if (last) {
      const dt = (p.t - last.t) / 1000;
      if (dt <= 0) continue;
      if (dt < MAX_GAP_MS / 1000 && distanceM(last, p) / dt > MAX_SPEED_MPS) continue;
    }
    out.push(p);
  }
  return out;
}

export interface StageSplit {
  index: number;
  kind: PhaseKind;
  round?: number;
  distanceM: number;
  /** Seconds of tracked movement in this stage. */
  movingSec: number;
  /** null when too little distance to tell. */
  paceSecPerKm: number | null;
  climbM: number;
  /**
   * Pace after the first `steadySkipSec` of the stage — once heart rate has
   * caught up with the effort. Used for the walking-efficiency trend.
   */
  steadyPaceSecPerKm: number | null;
  steadySec: number;
}

export interface TrackSummary {
  distanceM: number;
  climbM: number;
  stages: StageSplit[];
  /** Average pace across all hard intervals. */
  workPaceSecPerKm: number | null;
}

/**
 * Splits a cleaned track by workout stage. `toTimeline` maps a fix's
 * wall-clock time to ms into the workout, or null when the workout wasn't
 * running (paused, before start) — those stretches are left out.
 */
export function summarizeTrack(
  points: readonly TrackPoint[],
  phases: readonly Phase[],
  toTimeline: (t: number) => number | null,
  steadySkipSec = 60,
): TrackSummary {
  const offsets: number[] = [0];
  for (const p of phases) offsets.push(offsets[offsets.length - 1] + p.durationSec * 1000);
  const stageOf = (ms: number) => {
    for (let i = 0; i < phases.length; i++) if (ms < offsets[i + 1]) return i;
    return -1;
  };

  const acc = phases.map(() => ({ distanceM: 0, movingMs: 0, climbM: 0, altRef: null as number | null, steadyM: 0, steadyMs: 0 }));
  const cleaned = cleanTrack(points);

  for (let i = 1; i < cleaned.length; i++) {
    const a = cleaned[i - 1];
    const b = cleaned[i];
    const dt = b.t - a.t;
    if (dt > MAX_GAP_MS) continue;
    const ta = toTimeline(a.t);
    const tb = toTimeline(b.t);
    if (ta === null || tb === null) continue;
    const stage = stageOf((ta + tb) / 2);
    if (stage < 0) continue;
    const s = acc[stage];
    const d = distanceM(a, b);
    s.distanceM += d;
    s.movingMs += dt;
    if ((ta + tb) / 2 - offsets[stage] >= steadySkipSec * 1000) {
      s.steadyM += d;
      s.steadyMs += dt;
    }
    if (b.alt != null) {
      if (s.altRef === null) s.altRef = a.alt ?? b.alt;
      const rise = b.alt - s.altRef;
      if (rise >= CLIMB_HYSTERESIS_M) {
        s.climbM += rise;
        s.altRef = b.alt;
      } else if (rise <= -CLIMB_HYSTERESIS_M) {
        s.altRef = b.alt;
      }
    }
  }

  const stages: StageSplit[] = phases.map((p, i) => ({
    index: i,
    kind: p.kind,
    round: p.round,
    distanceM: acc[i].distanceM,
    movingSec: acc[i].movingMs / 1000,
    paceSecPerKm: paceOf(acc[i].distanceM, acc[i].movingMs / 1000),
    climbM: acc[i].climbM,
    steadyPaceSecPerKm: paceOf(acc[i].steadyM, acc[i].steadyMs / 1000),
    steadySec: acc[i].steadyMs / 1000,
  }));
  const work = stages.filter((s) => s.kind === 'work');
  return {
    distanceM: stages.reduce((sum, s) => sum + s.distanceM, 0),
    climbM: stages.reduce((sum, s) => sum + s.climbM, 0),
    stages,
    workPaceSecPerKm: paceOf(
      work.reduce((sum, s) => sum + s.distanceM, 0),
      work.reduce((sum, s) => sum + s.movingSec, 0),
    ),
  };
}

function paceOf(distance: number, seconds: number): number | null {
  return distance >= MIN_PACE_DISTANCE_M && seconds > 0 ? seconds / (distance / 1000) : null;
}

// ── Compact route for the journal ───────────────────────────────────────────

/** [lat × 1e5, lon × 1e5, stage index] — about 1 m resolution. */
export type RoutePoint = readonly [number, number, number];

/** Keeps a point every ~8 m (and at every stage change) — a 40-minute walk is a few hundred points. */
export function encodeRoute(
  points: readonly TrackPoint[],
  phases: readonly Phase[],
  toTimeline: (t: number) => number | null,
  minSpacingM = 8,
): RoutePoint[] {
  const offsets: number[] = [0];
  for (const p of phases) offsets.push(offsets[offsets.length - 1] + p.durationSec * 1000);
  const out: RoutePoint[] = [];
  let last: TrackPoint | null = null;
  let lastStage = -1;
  for (const p of cleanTrack(points)) {
    const ms = toTimeline(p.t);
    if (ms === null) continue;
    const stage = offsets.findIndex((o, i) => i < phases.length && ms < offsets[i + 1]);
    if (stage < 0) continue;
    if (last && stage === lastStage && distanceM(last, p) < minSpacingM) continue;
    out.push([Math.round(p.lat * 1e5), Math.round(p.lon * 1e5), stage]);
    last = p;
    lastStage = stage;
  }
  return out;
}

/** Projects a route onto a width × height box (north up, aspect kept), with padding. */
export function projectRoute(route: readonly RoutePoint[], width: number, height: number, pad = 12): { x: number; y: number; stage: number }[] {
  if (route.length === 0) return [];
  const lat0 = route.reduce((s, p) => s + p[0], 0) / route.length / 1e5;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = route.map((p) => (p[1] / 1e5) * kx);
  const ys = route.map((p) => p[0] / 1e5);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return route.map((p, i) => ({ x: offX + (xs[i] - minX) * scale, y: height - (offY + (ys[i] - minY) * scale), stage: p[2] }));
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** "9:12 /mi" or "5:43 /km" */
export function formatPace(secPerKm: number | null | undefined, unit: DistanceUnit): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '—';
  const sec = Math.round(unit === 'mi' ? secPerKm * (METERS_PER_MILE / 1000) : secPerKm);
  if (sec >= 60 * 60) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} /${unit}`;
}

/** "9 minutes 10 per mile" — for voice prompts. */
export function spokenPace(secPerKm: number, unit: DistanceUnit): string {
  const sec = Math.round(unit === 'mi' ? secPerKm * (METERS_PER_MILE / 1000) : secPerKm);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const per = unit === 'mi' ? 'per mile' : 'per kilometre';
  return s === 0 ? `${m} minutes ${per}` : `${m} minutes ${s} ${per}`;
}

/** "2.41 km", "1.50 mi", "350 m" */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (unit === 'mi') return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

/** Default unit from the phone's region (miles in the US, UK, Liberia, Myanmar). */
export function defaultDistanceUnit(locale: string | undefined): DistanceUnit {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return region && ['US', 'GB', 'LR', 'MM'].includes(region) ? 'mi' : 'km';
}

// ── Brisk-walking pace target ───────────────────────────────────────────────

export interface PaceHistoryItem {
  workPaceSecPerKm?: number;
  /** % of hard time in heart-rate zone, when known. */
  inZonePct?: number | null;
}

/**
 * A personal brisk pace for interval walking: the median hard-interval pace
 * of your recent walks — preferring walks where your heart rate was mostly in
 * zone, since those show the pace that actually gets you there.
 */
export function briskPaceTarget(recent: readonly PaceHistoryItem[]): number | null {
  const withPace = recent.filter((r) => r.workPaceSecPerKm != null).slice(0, 8);
  const inZone = withPace.filter((r) => r.inZonePct != null && r.inZonePct >= 60);
  const pool = inZone.length >= 2 ? inZone : withPace;
  if (pool.length === 0) return null;
  const paces = pool.map((r) => r.workPaceSecPerKm as number).sort((a, b) => a - b);
  const mid = Math.floor(paces.length / 2);
  return paces.length % 2 ? paces[mid] : (paces[mid - 1] + paces[mid]) / 2;
}
