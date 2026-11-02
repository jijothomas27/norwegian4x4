import type { HrSeries } from './hrSeries';
import type { PhaseKind } from './types';

/**
 * Walking efficiency: how fast you walk for a given heart rate. Pure logic,
 * unit-tested in tests/efficiency.test.ts.
 *
 * For each fast-walk interval we take speed and average heart rate over its
 * steady part (after the first minute, once heart rate has caught up). The
 * index is speed per unit of heart-rate reserve:
 *
 *   index = speed ÷ ((HR − HRrest) / (HRmax − HRrest))
 *
 * Why this shape: on flat ground the oxygen cost of walking above rest rises
 * in proportion to speed (ACSM walking equation), and %HR reserve tracks
 * %VO₂ reserve. So speed ÷ %HRR is roughly constant for a given fitness and
 * goes up as fitness improves — and it doesn't need a wide spread of heart
 * rates within one session, which a 3-minute-on/3-minute-off walk doesn't
 * give. For display it's turned into "pace at 75% of max heart rate".
 *
 * The same resting and max heart rate are applied to every session, so a
 * change in either shifts the whole trend together rather than bending it.
 */

/** Skip this much of each interval while heart rate catches up. */
export const STEADY_SKIP_SEC = 60;
/** At least this many seconds of heart-rate readings in the steady part. */
export const MIN_STEADY_SEC = 100;
/** GPS must have tracked at least this share of the interval. */
export const MIN_GPS_COVERAGE = 0.8;
/** Climb above 2% of distance makes the interval not comparable. */
export const MAX_GRADE = 0.02;
/** Plausible walking speeds, m/s (≈ 2.9–10 km/h). Faster is running; slower is a stop. */
export const SPEED_RANGE: readonly [number, number] = [0.8, 2.8];
/** Heart-rate-reserve fractions outside this range are noise or a sensor glitch. */
const HRR_RANGE: readonly [number, number] = [0.25, 1.05];
/** A session needs this many good intervals to give a value. */
export const MIN_INTERVALS = 2;
export const DISPLAY_FRACTION = 0.75;

/** One fast-walk interval that passed the checks. */
export interface EfficiencySample {
  round: number;
  /** m/s over the steady part (or the whole interval for sessions recorded before steady pace was kept). */
  speedMps: number;
  /** Average bpm over the steady part. */
  hr: number;
}

/** The fields of a recorded GPS stage this module needs. */
export interface GpsStage {
  kind: PhaseKind;
  round?: number;
  distanceM: number;
  paceSecPerKm?: number;
  climbM: number;
  movingSec?: number;
  steadyPaceSecPerKm?: number;
}

export interface HrRef {
  restHr: number;
  maxHr: number;
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/** Speed and heart rate for each fast-walk interval that's good enough to compare. */
export function efficiencySamples(gpsStages: readonly GpsStage[], series: Pick<HrSeries, 'bucketSec' | 'points' | 'stages'>): EfficiencySample[] {
  const out: EfficiencySample[] = [];
  for (const stage of series.stages) {
    if (stage.kind !== 'work' || stage.round === undefined) continue;
    const gps = gpsStages.find((g) => g.kind === 'work' && g.round === stage.round);
    if (!gps) continue;
    const pace = gps.steadyPaceSecPerKm ?? gps.paceSecPerKm;
    if (!pace || pace <= 0) continue;
    const lengthSec = stage.endSec - stage.startSec;
    if (gps.movingSec !== undefined && gps.movingSec < MIN_GPS_COVERAGE * lengthSec) continue;
    if (gps.distanceM <= 0 || gps.climbM / gps.distanceM > MAX_GRADE) continue;
    const speed = 1000 / pace;
    if (speed < SPEED_RANGE[0] || speed > SPEED_RANGE[1]) continue;

    const from = stage.startSec + STEADY_SKIP_SEC;
    const bpm = series.points.filter(([t]) => t >= from && t < stage.endSec).map(([, b]) => b);
    if (bpm.length * series.bucketSec < MIN_STEADY_SEC) continue;
    const hr = bpm.reduce((a, b) => a + b, 0) / bpm.length;
    out.push({ round: stage.round, speedMps: round(speed, 3), hr: round(hr, 1) });
  }
  return out;
}

const median = (values: readonly number[]): number => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** Speed per unit of heart-rate reserve; null when the heart rate isn't usable. */
export function efficiencyIndex(sample: Pick<EfficiencySample, 'speedMps' | 'hr'>, ref: HrRef): number | null {
  const span = ref.maxHr - ref.restHr;
  if (span < 40) return null;
  const f = (sample.hr - ref.restHr) / span;
  if (f < HRR_RANGE[0] || f > HRR_RANGE[1]) return null;
  return sample.speedMps / f;
}

/** A session's value: the median of its intervals. Null with fewer than two good intervals. */
export function sessionEfficiency(samples: readonly EfficiencySample[], ref: HrRef): number | null {
  const values = samples.map((s) => efficiencyIndex(s, ref)).filter((v): v is number => v !== null);
  return values.length >= MIN_INTERVALS ? median(values) : null;
}

/** Pace (s/km) the index implies at `fraction` of max heart rate. */
export function paceAtFraction(index: number, ref: HrRef, fraction = DISPLAY_FRACTION): number | null {
  const f = (fraction * ref.maxHr - ref.restHr) / (ref.maxHr - ref.restHr);
  if (!(f > 0) || !(index > 0)) return null;
  return 1000 / (index * f);
}

// ── Trend ────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
/** The headline uses sessions from the last two weeks (the most recent four). */
const RECENT_DAYS = 14;
const RECENT_MAX = 4;
/** Compare against about six weeks earlier… */
const BASELINE_AGO_DAYS = 42;
const BASELINE_HALF_WINDOW_DAYS = 7;
/** …or, with 4–6 weeks of history, against the first week. */
export const MIN_HISTORY_DAYS = 28;

export interface EfficiencyPoint {
  /** epoch ms */
  at: number;
  index: number;
}

export interface EfficiencyTrend {
  /** Median of recent sessions. */
  current: number;
  currentAt: number;
  /** null until there are four weeks of history. */
  baseline: { index: number; at: number } | null;
  /** Days between the first and latest session. */
  spanDays: number;
  sessions: number;
}

/** Headline value and the comparison point. `points` oldest → newest. */
export function efficiencyTrend(points: readonly EfficiencyPoint[]): EfficiencyTrend | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const latest = sorted[sorted.length - 1].at;
  const first = sorted[0].at;

  const recent = sorted.filter((p) => p.at > latest - RECENT_DAYS * DAY).slice(-RECENT_MAX);
  const current = median(recent.map((p) => p.index));

  let base: EfficiencyPoint[] = [];
  const target = latest - BASELINE_AGO_DAYS * DAY;
  if (first <= target) {
    base = sorted.filter((p) => Math.abs(p.at - target) <= BASELINE_HALF_WINDOW_DAYS * DAY);
    if (base.length === 0) {
      // Nothing in that window: the three sessions closest to it, as long as they're well before the recent ones.
      base = [...sorted]
        .filter((p) => p.at <= latest - 3 * RECENT_DAYS * DAY / 2)
        .sort((a, b) => Math.abs(a.at - target) - Math.abs(b.at - target))
        .slice(0, 3);
    }
  } else if (latest - first >= MIN_HISTORY_DAYS * DAY) {
    base = sorted.filter((p) => p.at < first + 7 * DAY);
  }

  return {
    current,
    currentAt: latest,
    baseline: base.length > 0 ? { index: median(base.map((p) => p.index)), at: median(base.map((p) => p.at)) } : null,
    spanDays: Math.round((latest - first) / DAY),
    sessions: sorted.length,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Defensive read of stored samples (storage and backups are untrusted). */
export function cleanSamples(raw: unknown): EfficiencySample[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is EfficiencySample =>
      typeof s === 'object' && s !== null && isNum((s as EfficiencySample).round) && isNum((s as EfficiencySample).speedMps) && isNum((s as EfficiencySample).hr),
  );
}
