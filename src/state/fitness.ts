import { estimateUncertainty, estimateVo2Max, UTH_FACTOR } from '../domain/vo2';
import { effectiveMaxHr, type HrProfile, type MaxHr } from '../domain/zones';
import type { Settings } from './model';

/** The heart-rate profile implied by the user's settings. */
export function hrProfile(s: Settings): HrProfile {
  return { age: s.age, maxHr: s.maxHr, learnedMaxHr: s.learnedMaxHr };
}

export function maxHrFor(s: Settings): MaxHr | null {
  return effectiveMaxHr(hrProfile(s));
}

export interface Vo2Estimate {
  value: number;
  /** ± ml·kg⁻¹·min⁻¹ */
  uncertainty: number;
  maxHr: MaxHr;
  restingHr: number;
  calibrated: boolean;
}

/** Current heart-rate-ratio VO₂ max estimate, or null if inputs are missing. */
export function vo2EstimateFor(s: Settings): Vo2Estimate | null {
  const maxHr = maxHrFor(s);
  if (!maxHr || !s.restingHr) return null;
  const calibrated = s.vo2Factor !== undefined;
  const value = estimateVo2Max(maxHr.bpm, s.restingHr, s.vo2Factor ?? UTH_FACTOR);
  if (value === null) return null;
  return {
    value,
    uncertainty: estimateUncertainty({ maxFromAge: maxHr.source === 'age', calibrated }),
    maxHr,
    restingHr: s.restingHr,
    calibrated,
  };
}
