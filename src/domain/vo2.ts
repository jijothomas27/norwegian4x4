/**
 * VO₂ max estimate from the heart-rate ratio method
 * (Uth, Sørensen, Overgaard & Pedersen, Eur J Appl Physiol 2004):
 *
 *   VO₂max ≈ k × HRmax / HRrest        k = 15.3 ml·kg⁻¹·min⁻¹
 *
 * Reported error ≈ 4.5 % with a measured HRmax, ≈ 7.8 % with an age-predicted
 * one. The default factor was derived from well-trained men and tends to
 * overestimate slightly in untrained people, so when the user logs a
 * reference VO₂ max (e.g. from their Garmin), we derive a personal factor
 * from it and use that instead.
 *
 * Pure functions, unit-tested in tests/vo2.test.ts.
 */

export const UTH_FACTOR = 15.3;
/** Personal factors outside this range mean bad inputs, not physiology. */
const FACTOR_RANGE = [11, 19.5] as const;

export const isPlausibleRestingHr = (bpm: number) => bpm >= 30 && bpm <= 100;
export const isPlausibleMaxHr = (bpm: number) => bpm >= 120 && bpm <= 230;

export function estimateVo2Max(maxHr: number, restingHr: number, factor: number = UTH_FACTOR): number | null {
  if (!isPlausibleMaxHr(maxHr) || !isPlausibleRestingHr(restingHr) || maxHr <= restingHr * 1.4) return null;
  return Math.round(factor * (maxHr / restingHr) * 10) / 10;
}

/** Personal factor that makes the formula reproduce a trusted VO₂ max reading. */
export function calibrateFactor(referenceVo2: number, maxHr: number, restingHr: number): number | null {
  if (referenceVo2 < 15 || referenceVo2 > 90) return null;
  if (!isPlausibleMaxHr(maxHr) || !isPlausibleRestingHr(restingHr)) return null;
  const k = referenceVo2 / (maxHr / restingHr);
  return k >= FACTOR_RANGE[0] && k <= FACTOR_RANGE[1] ? Math.round(k * 100) / 100 : null;
}

/**
 * A workout's sustained peak is a lower bound on true max HR, so the learned
 * max only ever moves up. Implausible peaks (sensor glitches) are ignored.
 */
export function learnMaxHr(current: number | undefined, sustainedPeak: number | undefined): number | undefined {
  if (sustainedPeak === undefined || !isPlausibleMaxHr(sustainedPeak)) return current;
  if (current === undefined) return sustainedPeak;
  return Math.max(current, sustainedPeak);
}

/** Typical error band to show next to an estimate (ml·kg⁻¹·min⁻¹). */
export function estimateUncertainty(opts: { maxFromAge: boolean; calibrated: boolean }): number {
  if (opts.calibrated) return 2.5;
  return opts.maxFromAge ? 5 : 3;
}

/** Average of the last `windowMs` of readings, for the resting-HR check. */
export function restingFromSamples(samples: readonly { at: number; bpm: number }[], windowMs = 60_000): number | null {
  if (samples.length === 0) return null;
  const end = samples[samples.length - 1].at;
  const tail = samples.filter((s) => s.at >= end - windowMs);
  if (tail.length < 10) return null;
  return Math.round(tail.reduce((sum, s) => sum + s.bpm, 0) / tail.length);
}
