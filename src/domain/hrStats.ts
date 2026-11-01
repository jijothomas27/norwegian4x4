import type { PhaseKind } from './types';

/**
 * Running heart-rate statistics for one workout. Each sample is weighted by
 * the time since the previous one, so irregular sample rates (or a brief
 * dropout) don't skew the average.
 */
export interface HrStats {
  /** Time-weighted sum of bpm × ms. */
  weightedSum: number;
  weightedMs: number;
  max: number;
  /** ms of work-interval time with a valid reading. */
  workMs: number;
  /** ms of that time spent inside the target band. */
  workInZoneMs: number;
  lastAt: number | null;
  samples: number;
  /** Readings from the last SUSTAIN_MS, for the sustained peak. */
  recent: readonly { at: number; bpm: number }[];
  /** Highest heart rate held for SUSTAIN_MS — robust to single-sample spikes. */
  sustainedMax: number;
}

export const EMPTY_HR_STATS: HrStats = {
  weightedSum: 0,
  weightedMs: 0,
  max: 0,
  workMs: 0,
  workInZoneMs: 0,
  lastAt: null,
  samples: 0,
  recent: [],
  sustainedMax: 0,
};

/** Window for the sustained peak. */
export const SUSTAIN_MS = 10_000;

/** Gaps longer than this (sensor dropout) are not credited to the previous reading. */
const MAX_GAP_MS = 5000;

export interface HrSample {
  at: number;
  bpm: number;
  phaseKind: PhaseKind;
  inZone: boolean;
}

export function addHrSample(stats: HrStats, s: HrSample): HrStats {
  const dt = stats.lastAt === null ? 1000 : Math.max(0, Math.min(MAX_GAP_MS, s.at - stats.lastAt));
  const isWork = s.phaseKind === 'work';
  const recent = [...stats.recent.filter((r) => r.at > s.at - SUSTAIN_MS), { at: s.at, bpm: s.bpm }];
  // Only count a window that is (nearly) full, and use its average.
  const covered = recent.length >= 5 && s.at - recent[0].at >= SUSTAIN_MS * 0.7;
  const windowAvg = covered ? recent.reduce((sum, r) => sum + r.bpm, 0) / recent.length : 0;
  return {
    weightedSum: stats.weightedSum + s.bpm * dt,
    weightedMs: stats.weightedMs + dt,
    max: Math.max(stats.max, s.bpm),
    workMs: stats.workMs + (isWork ? dt : 0),
    workInZoneMs: stats.workInZoneMs + (isWork && s.inZone ? dt : 0),
    lastAt: s.at,
    samples: stats.samples + 1,
    recent,
    sustainedMax: Math.max(stats.sustainedMax, Math.round(windowAvg)),
  };
}

export interface HrSummary {
  avg: number;
  max: number;
  /** % of hard-interval time inside the target band (null if no work-time data). */
  inZonePct: number | null;
  /** Highest heart rate held for 10 s (0 when not enough data). */
  sustainedMax: number;
}

export function summarizeHr(stats: HrStats): HrSummary | null {
  if (stats.samples < 5 || stats.weightedMs === 0) return null;
  return {
    avg: Math.round(stats.weightedSum / stats.weightedMs),
    max: stats.max,
    inZonePct: stats.workMs >= 30_000 ? Math.round((stats.workInZoneMs / stats.workMs) * 100) : null,
    sustainedMax: stats.sustainedMax,
  };
}
