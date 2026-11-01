import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

import { addHrSample, EMPTY_HR_STATS, summarizeHr, type HrStats, type HrSummary } from '../domain/hrStats';
import type { TimelinePosition } from '../domain/timeline';
import { bpmRange, classify, zoneCoachingLine, type ZoneStatus } from '../domain/zones';
import { DEMO_DEVICE, HR_STALE_MS, useHeartRate } from '../hr/HeartRateProvider';
import { cues, type CueOptions } from '../lib/cues';
import { useStore } from '../state/store';
import type { TimerStatus } from './useIntervalTimer';
import { useNow } from './useNow';
import { maxHrFor } from '../state/fitness';

/** Out of zone this long (after the settle period) before a spoken prompt. */
const COACH_AFTER_MS = 15_000;
/** Minimum gap between spoken prompts. */
const COACH_GAP_MS = 45_000;

export type HrConnection = 'connected' | 'connecting' | 'lost' | 'none';

/**
 * Everything the timer needs from the heart-rate sensor: the live reading,
 * the target band for the current stage, zone status, voice coaching, and
 * running statistics for the session record.
 */
export function useWorkoutHeartRate(
  position: TimelinePosition,
  timerStatus: TimerStatus,
  cueOpts: CueOptions,
  /** Exact position for a given time — readings keep arriving while the app is in the background. */
  positionAt?: (at: number) => TimelinePosition,
) {
  const hr = useHeartRate();
  const { state } = useStore();
  const now = useNow(1000);

  const { phase } = position;
  const maxHr = maxHrFor(state.settings);
  const range = maxHr ? bpmRange(phase.target, maxHr.bpm) : null;

  const fresh = hr.bpm !== null && hr.at !== null && now - hr.at < HR_STALE_MS + 1000;
  const bpm = fresh ? hr.bpm : null;
  const status: ZoneStatus | null =
    bpm !== null && range ? classify(bpm, range, position.phaseElapsedMs / 1000, phase.target.settleSec) : null;

  let connection: HrConnection = 'none';
  if (hr.device) {
    if (hr.status === 'connected') connection = fresh ? 'connected' : 'lost';
    else if (hr.status === 'connecting') connection = 'connecting';
    else connection = 'lost';
  }

  // ── Stats + coaching, evaluated once per incoming reading ─────────────────
  const stats = useRef<HrStats>(EMPTY_HR_STATS);
  const outSince = useRef<number | null>(null);
  const lastCoachAt = useRef(0);
  const coachedPhase = useRef<string | null>(null);

  const onReading = useEffectEvent(() => {
    if (timerStatus !== 'running' || hr.bpm === null || hr.at === null) return;
    const at = hr.at;
    const pos = positionAt ? positionAt(at) : position;
    if (pos.done) return;
    const phase = pos.phase;
    const range = maxHr ? bpmRange(phase.target, maxHr.bpm) : null;
    const live = classify(hr.bpm, range ?? { low: 0, high: 999 }, pos.phaseElapsedMs / 1000, phase.target.settleSec);
    stats.current = addHrSample(stats.current, { at, bpm: hr.bpm, phaseKind: phase.kind, inZone: live === 'in' });

    if (!range) return;
    if (coachedPhase.current !== phase.key) {
      coachedPhase.current = phase.key;
      outSince.current = null;
    }
    // In easy stages only "too high" matters; in work intervals both directions do.
    const actionable = live === 'above' || (live === 'below' && phase.kind === 'work');
    if (!actionable) {
      outSince.current = null;
      return;
    }
    outSince.current ??= at;
    const secondsLeft = pos.phaseRemainingMs / 1000;
    if (
      at - outSince.current >= COACH_AFTER_MS &&
      at - lastCoachAt.current >= COACH_GAP_MS &&
      secondsLeft > 12 &&
      state.settings.voiceCoaching
    ) {
      lastCoachAt.current = at;
      cues.coach(zoneCoachingLine(live, phase, range), cueOpts);
    }
  });

  useEffect(() => {
    if (hr.at !== null) onReading();
  }, [hr.at]);

  // ── Demo sensor follows the plan so the whole experience can be previewed ─
  const steerDemo = useEffectEvent(() => {
    if (hr.device?.id !== DEMO_DEVICE.id) return;
    const max = maxHr?.bpm ?? 180;
    const r = bpmRange(phase.target, max);
    // Aim just inside the band; hard intervals overshoot slightly in the last round for realism.
    const lastRound = phase.kind === 'work' && phase.round === phase.totalRounds;
    hr.setDemoTarget(lastRound ? r.high + 4 : Math.round((r.low + r.high) / 2));
  });
  useEffect(() => {
    steerDemo();
  }, [phase.key]);

  const getSummary = useCallback((): HrSummary | null => summarizeHr(stats.current), []);

  return {
    bpm,
    range,
    maxHr: maxHr?.bpm ?? null,
    status,
    connection,
    deviceName: hr.device?.name ?? null,
    /** Demo readings must never train the learned max HR. */
    isDemo: hr.device?.id === DEMO_DEVICE.id,
    getSummary,
  };
}
