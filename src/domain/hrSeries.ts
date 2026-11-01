import type { Phase, PhaseKind } from './types';

/**
 * Heart rate over a whole workout, for the summary graph. Pure logic,
 * unit-tested in tests/hrSeries.test.ts.
 *
 * Time is *workout-timeline* time (where in the plan you were), not wall
 * clock: pauses don't stretch the graph, a skipped stretch shows as a gap,
 * and the stage bands always line up with the plan.
 */

/** One reading as recorded during the workout. */
export interface RawHrSample {
  /** Workout-timeline ms. */
  tMs: number;
  bpm: number;
}

/** [seconds into the workout timeline, bpm] */
export type SeriesPoint = readonly [number, number];

/** A stage of the plan, with its target band in bpm as it was on the day. */
export interface SeriesStage {
  kind: PhaseKind;
  tone: Phase['tone'];
  round?: number;
  startSec: number;
  endSec: number;
  /** Target band in bpm; absent when no max heart rate was known. */
  low?: number;
  high?: number;
}

export interface HrSeries {
  bucketSec: number;
  /** Max heart rate in effect during the workout (reference line). */
  maxHr: number | null;
  stages: SeriesStage[];
  points: SeriesPoint[];
}

/** One point per 3 s: ~800 points for a 40-minute session. */
export const BUCKET_SEC = 3;
/** Points further apart than this are drawn as a break in the line. */
export const GAP_SEC = 12;
/** Fewer points than this isn't worth a graph. */
export const MIN_POINTS = 10;

const plausible = (bpm: number) => Number.isFinite(bpm) && bpm >= 30 && bpm <= 240;

/**
 * Average readings into fixed time buckets. Each point is stamped with the
 * start of its bucket. Implausible readings are dropped.
 */
export function bucketSamples(samples: readonly RawHrSample[], bucketSec = BUCKET_SEC): SeriesPoint[] {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const s of samples) {
    if (!plausible(s.bpm) || !Number.isFinite(s.tMs) || s.tMs < 0) continue;
    const idx = Math.floor(s.tMs / 1000 / bucketSec);
    const b = sums.get(idx) ?? { sum: 0, n: 0 };
    b.sum += s.bpm;
    b.n += 1;
    sums.set(idx, b);
  }
  return [...sums.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, b]) => [idx * bucketSec, Math.round(b.sum / b.n)] as const);
}

/** The plan as stored with the series: timeline offsets plus bpm bands. */
export function stagesFromPhases(phases: readonly Phase[], maxHr: number | null): SeriesStage[] {
  let start = 0;
  return phases.map((p) => {
    const stage: SeriesStage = { kind: p.kind, tone: p.tone, startSec: start, endSec: start + p.durationSec };
    if (p.round !== undefined) stage.round = p.round;
    if (maxHr) {
      stage.low = Math.round(p.target.low * maxHr);
      stage.high = Math.round(p.target.high * maxHr);
    }
    start += p.durationSec;
    return stage;
  });
}

export function buildSeries(
  samples: readonly RawHrSample[],
  phases: readonly Phase[],
  maxHr: number | null,
  bucketSec = BUCKET_SEC,
): HrSeries | null {
  const points = bucketSamples(samples, bucketSec);
  if (points.length < MIN_POINTS) return null;
  return { bucketSec, maxHr, stages: stagesFromPhases(phases, maxHr), points };
}

/** Consecutive runs of points with no gap longer than `gapSec` — one line each. */
export function splitAtGaps(points: readonly SeriesPoint[], gapSec = GAP_SEC): SeriesPoint[][] {
  const runs: SeriesPoint[][] = [];
  let run: SeriesPoint[] = [];
  for (const p of points) {
    if (run.length > 0 && p[0] - run[run.length - 1][0] > gapSec) {
      runs.push(run);
      run = [];
    }
    run.push(p);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function pointsIn(series: HrSeries, stage: SeriesStage): SeriesPoint[] {
  return series.points.filter(([t]) => t >= stage.startSec && t < stage.endSec);
}

export interface RoundZoneStat {
  round: number;
  /**
   * Seconds from the start of the hard interval until heart rate first
   * reached the bottom of the band. null = never reached (or no band known).
   */
  timeToZoneSec: number | null;
  /** % of the interval (with readings) spent inside the band; null without data or band. */
  inZonePct: number | null;
  /** Whether there were readings in this interval at all. */
  hasData: boolean;
}

/** Per hard interval: how quickly heart rate got there, and how well it held. */
export function zoneStatsByRound(series: HrSeries): RoundZoneStat[] {
  return series.stages
    .filter((s) => s.kind === 'work')
    .map((stage, i) => {
      const round = stage.round ?? i + 1;
      const pts = pointsIn(series, stage);
      if (pts.length === 0) return { round, timeToZoneSec: null, inZonePct: null, hasData: false };
      if (stage.low === undefined || stage.high === undefined) return { round, timeToZoneSec: null, inZonePct: null, hasData: true };
      const low = stage.low;
      const high = stage.high;
      const reached = pts.find(([, bpm]) => bpm >= low);
      const inZone = pts.filter(([, bpm]) => bpm >= low && bpm <= high).length;
      return {
        round,
        timeToZoneSec: reached ? Math.max(0, reached[0] - stage.startSec) : null,
        inZonePct: Math.round((inZone / pts.length) * 100),
        hasData: true,
      };
    });
}

// ── Storage encoding ─────────────────────────────────────────────────────────
//
// Compact JSON so a 40-minute session stays well under 15 KB:
// { v: 1, b: bucketSec, m: maxHr | 0, s: [[kind, tone, round|0, start, end, low|0, high|0], …], p: [t, bpm, t, bpm, …] }

const KINDS: readonly PhaseKind[] = ['warmup', 'work', 'rest', 'cooldown'];
const TONES: readonly Phase['tone'][] = ['warmup', 'intense', 'brisk', 'recover', 'easy', 'cooldown', 'complete'];

export function encodeSeries(series: HrSeries): string {
  return JSON.stringify({
    v: 1,
    b: series.bucketSec,
    m: series.maxHr ?? 0,
    s: series.stages.map((s) => [s.kind, s.tone, s.round ?? 0, s.startSec, s.endSec, s.low ?? 0, s.high ?? 0]),
    p: series.points.flat(),
  });
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Defensive decode: anything malformed gives null rather than a crash. */
export function decodeSeries(raw: string | null): HrSeries | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || !isNum(d.b) || d.b <= 0 || !Array.isArray(d.s) || !Array.isArray(d.p) || d.p.length % 2 !== 0) return null;

  const stages: SeriesStage[] = [];
  for (const row of d.s) {
    if (!Array.isArray(row) || row.length !== 7) return null;
    const [kind, tone, round, startSec, endSec, low, high] = row as unknown[];
    if (!KINDS.includes(kind as PhaseKind) || !TONES.includes(tone as Phase['tone'])) return null;
    if (![round, startSec, endSec, low, high].every(isNum)) return null;
    const stage: SeriesStage = { kind: kind as PhaseKind, tone: tone as Phase['tone'], startSec: startSec as number, endSec: endSec as number };
    if ((round as number) > 0) stage.round = round as number;
    if ((low as number) > 0 && (high as number) > 0) {
      stage.low = low as number;
      stage.high = high as number;
    }
    stages.push(stage);
  }

  const points: SeriesPoint[] = [];
  for (let i = 0; i < d.p.length; i += 2) {
    const t = d.p[i];
    const bpm = d.p[i + 1];
    if (!isNum(t) || !isNum(bpm)) return null;
    points.push([t, bpm]);
  }
  return { bucketSec: d.b, maxHr: isNum(d.m) && d.m > 0 ? d.m : null, stages, points };
}
