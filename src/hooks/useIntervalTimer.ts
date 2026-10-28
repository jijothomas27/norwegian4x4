import { useCallback, useEffect, useEffectEvent, useMemo, useReducer } from 'react';
import { AppState } from 'react-native';

import { clockElapsedMs, clockReducer, initialClock, type ClockState } from '../domain/clock';
import { locate, phaseOffsetsMs, totalDurationMs, workRoundsCompleted, type TimelinePosition } from '../domain/timeline';
import type { Phase } from '../domain/types';

export type { TimerStatus } from '../domain/clock';

export interface TimerResult {
  startedAt: number;
  endedAt: number;
  /** Time actually spent in the workout (skipped time excluded). */
  activeMs: number;
  roundsCompleted: number;
}

export interface TimerHandlers {
  onPhaseStart?: (phase: Phase, index: number) => void;
  /** Fires once per whole second while running, with seconds left in the phase. */
  onSecond?: (secondsLeft: number, position: TimelinePosition) => void;
  onComplete?: (result: TimerResult) => void;
}

const TICK_MS = 200;

function resultOf(clock: ClockState, phases: readonly Phase[]): TimerResult {
  const elapsed = clockElapsedMs(clock);
  return {
    startedAt: clock.startedAt,
    endedAt: clock.now,
    activeMs: Math.max(0, elapsed - clock.skippedMs),
    roundsCompleted: workRoundsCompleted(phases, elapsed, clock.skips),
  };
}

/**
 * Wall-clock based interval timer.
 *
 * Rather than decrementing a counter (which drifts, and freezes while the
 * app is backgrounded), the clock records *when* it started running and
 * derives elapsed time from `Date.now()`. All transitions live in a pure
 * reducer (src/domain/clock.ts) that is unit-tested in isolation.
 */
export function useIntervalTimer(phases: readonly Phase[], handlers: TimerHandlers = {}) {
  const totalMs = useMemo(() => totalDurationMs(phases), [phases]);
  const offsets = useMemo(() => phaseOffsetsMs(phases), [phases]);
  const [clock, dispatch] = useReducer(clockReducer, undefined, () => initialClock(Date.now(), totalMs));

  // Tick while running.
  useEffect(() => {
    if (clock.status !== 'running') return;
    const id = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [clock.status]);

  // Catch up instantly when returning from the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch({ type: 'tick', now: Date.now() });
    });
    return () => sub.remove();
  }, []);

  const elapsedMs = clockElapsedMs(clock);
  const position = locate(phases, elapsedMs);
  const secondsLeft = Math.ceil(position.phaseRemainingMs / 1000);
  const active = clock.status === 'running' || clock.status === 'paused';

  // Phase change → notify (once per phase; catches up after backgrounding).
  const emitPhaseStart = useEffectEvent((index: number) => handlers.onPhaseStart?.(phases[index], index));
  useEffect(() => {
    if (active && !position.done) emitPhaseStart(position.index);
  }, [active, position.index, position.done]);

  // Whole-second notifications (3-2-1 countdowns, milestones).
  const emitSecond = useEffectEvent((s: number) => handlers.onSecond?.(s, position));
  useEffect(() => {
    if (clock.status === 'running' && !position.done) emitSecond(secondsLeft);
  }, [clock.status, position.index, secondsLeft, position.done]);

  // Completion.
  const emitComplete = useEffectEvent(() => handlers.onComplete?.(resultOf(clock, phases)));
  useEffect(() => {
    if (clock.status === 'complete') emitComplete();
  }, [clock.status]);

  const start = useCallback(() => dispatch({ type: 'start', now: Date.now(), totalMs }), [totalMs]);
  const pause = useCallback(() => dispatch({ type: 'pause', now: Date.now() }), []);
  const resume = useCallback(() => dispatch({ type: 'resume', now: Date.now() }), []);
  const skip = useCallback(() => dispatch({ type: 'skip', now: Date.now(), offsets }), [offsets]);
  /** Development helper: run the clock N× faster to preview a full session. */
  const setSpeed = useCallback((factor: number) => dispatch({ type: 'speed', now: Date.now(), factor }), []);

  /** Snapshot for saving a partially-completed workout (call from handlers). */
  const snapshot = useCallback(
    (): TimerResult => resultOf(clockReducer(clock, { type: 'tick', now: Date.now() }), phases),
    [clock, phases],
  );

  return {
    status: clock.status,
    position,
    elapsedMs,
    activeMs: Math.max(0, elapsedMs - clock.skippedMs),
    totalMs,
    secondsLeft,
    speed: clock.speed,
    start,
    pause,
    resume,
    skip,
    snapshot,
    setSpeed,
  };
}
