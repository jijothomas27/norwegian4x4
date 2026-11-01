import type { HrTarget, Phase } from './types';

/**
 * Heart-rate targets. Pure logic, unit-tested in tests/zones.test.ts.
 *
 * Norwegian 4×4 zones come straight from the protocol (85–95 % / 60–70 % of
 * max HR). Interval Walking is defined by % of aerobic capacity, not heart
 * rate; the bands used for it (fast ≈ 75–85 %, slow ≈ 55–68 % of max HR) are
 * the usual heart-rate equivalents of ~70 % / ~40 % of VO₂peak and are
 * deliberately presented as approximate.
 */

export interface HrProfile {
  /** Years. Used for the Tanaka estimate when no measured max is known. */
  age?: number;
  /** Measured max heart rate (e.g. from a lab test or a hard field test). */
  maxHr?: number;
  /** Highest sustained heart rate seen in Tempo workouts (a lower bound on true max). */
  learnedMaxHr?: number;
}

export interface MaxHr {
  bpm: number;
  source: 'measured' | 'workouts' | 'age';
}

/** Tanaka et al. (2001): HRmax ≈ 208 − 0.7 × age. Better than 220 − age for adults. */
export function estimateMaxHrFromAge(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/**
 * Priority: a measured max the user entered › the higher of the age estimate
 * and the peak actually reached in workouts (a real reading above the
 * estimate proves the estimate is too low).
 */
export function effectiveMaxHr(profile: HrProfile): MaxHr | null {
  if (profile.maxHr && profile.maxHr >= 120 && profile.maxHr <= 230) return { bpm: Math.round(profile.maxHr), source: 'measured' };
  const fromAge = profile.age && profile.age >= 12 && profile.age <= 100 ? estimateMaxHrFromAge(profile.age) : null;
  const learned = profile.learnedMaxHr && profile.learnedMaxHr >= 120 && profile.learnedMaxHr <= 230 ? profile.learnedMaxHr : null;
  if (learned && (!fromAge || learned > fromAge)) return { bpm: learned, source: 'workouts' };
  if (fromAge) return { bpm: fromAge, source: 'age' };
  return null;
}

export interface BpmRange {
  low: number;
  high: number;
}

export function bpmRange(target: HrTarget, maxHr: number): BpmRange {
  return { low: Math.round(target.low * maxHr), high: Math.round(target.high * maxHr) };
}

export type ZoneStatus = 'in' | 'below' | 'above' | 'settling';

/**
 * Where a reading sits relative to the target. During the first
 * `settleSec` of a stage, readings outside the band are "settling" — heart
 * rate takes a minute or two to catch up with a change in effort, so
 * correcting someone then would be wrong.
 */
export function classify(bpm: number, range: BpmRange, phaseElapsedSec: number, settleSec: number): ZoneStatus {
  if (bpm >= range.low && bpm <= range.high) return 'in';
  if (phaseElapsedSec < settleSec) return 'settling';
  return bpm < range.low ? 'below' : 'above';
}

/** Short on-screen coaching line. */
export function zoneMessage(status: ZoneStatus, phase: Phase): string {
  const hard = phase.kind === 'work';
  switch (status) {
    case 'in':
      return hard ? 'On target — hold this effort' : 'Right where you should be';
    case 'settling':
      return hard ? 'Heart rate rising — settle into the pace' : 'Heart rate settling — keep moving';
    case 'below':
      return hard ? 'Push a little harder' : phase.kind === 'rest' ? 'A touch quicker' : 'Pick up the pace slightly';
    case 'above':
      return hard ? 'Ease off slightly' : 'Slow down — let it come down';
  }
}

/** Sentence spoken by voice coaching when someone has been out of zone for a while. */
export function zoneCoachingLine(status: 'below' | 'above', phase: Phase, range: BpmRange): string {
  if (phase.kind === 'work') {
    return status === 'below'
      ? `Push a little harder. Aim for ${range.low} to ${range.high}.`
      : `Ease off slightly. Stay under ${range.high}.`;
  }
  return status === 'above'
    ? `Slow down a little. Let your heart rate drop below ${range.high}.`
    : `A touch quicker. Aim for ${range.low} to ${range.high}.`;
}
