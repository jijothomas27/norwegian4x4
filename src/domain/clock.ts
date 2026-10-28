/**
 * Pure state machine behind the workout timer. No React, no timers —
 * every action carries the current time, so it is fully deterministic and
 * unit-testable (see tests/clock.test.ts).
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete';

export interface ClockState {
  status: TimerStatus;
  totalMs: number;
  /** Elapsed ms accumulated before the current running stretch. */
  baseMs: number;
  /** Wall-clock time the current running stretch began (null when not running). */
  runStartedAt: number | null;
  /** Total ms jumped over via "skip" — excluded from the recorded duration. */
  skippedMs: number;
  /** Timeline ranges [from, to) that were skipped, used to score rounds fairly. */
  skips: readonly (readonly [number, number])[];
  startedAt: number;
  /** Latest wall-clock reading, refreshed by ticks. */
  now: number;
  /** Dev fast-forward multiplier. */
  speed: number;
}

export type ClockAction =
  | { type: 'start'; now: number; totalMs: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'skip'; now: number; offsets: readonly number[] }
  | { type: 'speed'; now: number; factor: number };

export function initialClock(now: number, totalMs: number): ClockState {
  return { status: 'idle', totalMs, baseMs: 0, runStartedAt: null, skippedMs: 0, skips: [], startedAt: now, now, speed: 1 };
}

export function clockElapsedMs(c: ClockState, at: number = c.now): number {
  const running = c.runStartedAt !== null ? Math.max(0, at - c.runStartedAt) * c.speed : 0;
  return Math.min(c.totalMs, c.baseMs + running);
}

/** Fold the current running stretch into baseMs (keeps running if it was). */
function settle(c: ClockState, now: number): ClockState {
  return { ...c, baseMs: clockElapsedMs(c, now), runStartedAt: c.runStartedAt !== null ? now : null, now };
}

function finishIfDone(c: ClockState): ClockState {
  if ((c.status === 'running' || c.status === 'paused') && clockElapsedMs(c) >= c.totalMs) {
    return { ...c, status: 'complete', baseMs: c.totalMs, runStartedAt: null };
  }
  return c;
}

export function clockReducer(c: ClockState, a: ClockAction): ClockState {
  switch (a.type) {
    case 'start':
      return { ...initialClock(a.now, a.totalMs), status: 'running', runStartedAt: a.now, speed: c.speed };

    case 'pause':
      if (c.status !== 'running') return c;
      return finishIfDone({ ...settle(c, a.now), status: 'paused', runStartedAt: null });

    case 'resume':
      if (c.status !== 'paused') return c;
      return { ...c, status: 'running', runStartedAt: a.now, now: a.now };

    case 'tick':
      if (c.status === 'idle' || c.status === 'complete') return c.now === a.now ? c : { ...c, now: a.now };
      return finishIfDone({ ...c, now: a.now });

    case 'skip': {
      if (c.status !== 'running' && c.status !== 'paused') return c;
      const s = settle(c, a.now);
      const current = s.baseMs;
      const nextStart = a.offsets.find((o) => o > current) ?? c.totalMs;
      return finishIfDone({
        ...s,
        baseMs: nextStart,
        skippedMs: s.skippedMs + (nextStart - current),
        skips: [...s.skips, [current, nextStart] as const],
      });
    }

    case 'speed':
      return { ...settle(c, a.now), speed: a.factor };
  }
}
