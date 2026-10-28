import type { Phase } from './types';

/**
 * Pure timeline maths. The timer stores only "elapsed milliseconds" and
 * derives everything else from it, which keeps pause / skip / app
 * backgrounding exact and makes the logic trivial to test.
 */

export interface TimelinePosition {
  index: number;
  phase: Phase;
  /** ms since this phase began */
  phaseElapsedMs: number;
  /** ms until this phase ends */
  phaseRemainingMs: number;
  /** 0…1 progress through this phase */
  phaseProgress: number;
  /** 0…1 progress through the whole workout */
  totalProgress: number;
  done: boolean;
}

export function totalDurationMs(phases: readonly Phase[]): number {
  return phases.reduce((sum, p) => sum + p.durationSec * 1000, 0);
}

/** Start offset (ms) of every phase, plus the total as a final sentinel. */
export function phaseOffsetsMs(phases: readonly Phase[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const p of phases) {
    offsets.push(acc);
    acc += p.durationSec * 1000;
  }
  offsets.push(acc);
  return offsets;
}

export function locate(phases: readonly Phase[], elapsedMs: number): TimelinePosition {
  if (phases.length === 0) throw new Error('A workout needs at least one phase');
  const total = totalDurationMs(phases);
  const clamped = Math.max(0, Math.min(elapsedMs, total));

  let start = 0;
  for (let i = 0; i < phases.length; i++) {
    const dur = phases[i].durationSec * 1000;
    const end = start + dur;
    if (clamped < end) {
      const phaseElapsedMs = clamped - start;
      return {
        index: i,
        phase: phases[i],
        phaseElapsedMs,
        phaseRemainingMs: end - clamped,
        phaseProgress: dur === 0 ? 1 : phaseElapsedMs / dur,
        totalProgress: total === 0 ? 1 : clamped / total,
        done: false,
      };
    }
    start = end;
  }

  const last = phases.length - 1;
  return {
    index: last,
    phase: phases[last],
    phaseElapsedMs: phases[last].durationSec * 1000,
    phaseRemainingMs: 0,
    phaseProgress: 1,
    totalProgress: 1,
    done: true,
  };
}

/**
 * Number of work intervals completed by `elapsedMs`. A round only counts if
 * at least half of it was actually done (i.e. not skipped).
 */
export function workRoundsCompleted(
  phases: readonly Phase[],
  elapsedMs: number,
  skips: readonly (readonly [number, number])[] = [],
): number {
  const offsets = phaseOffsetsMs(phases);
  let count = 0;
  phases.forEach((p, i) => {
    if (p.kind !== 'work') return;
    const start = offsets[i];
    const end = offsets[i + 1];
    if (elapsedMs < end) return;
    const skipped = skips.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, end) - Math.max(from, start)), 0);
    if (skipped <= (end - start) / 2) count++;
  });
  return count;
}

/** "4:00", "12:05", "1:02:30" */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** "38 min", "1 h 5 min" */
export function formatMinutes(totalSec: number): string {
  const min = Math.round(totalSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
