import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { backgroundSession } from '../../modules/tempo-workout';
import type { TimelinePosition } from '../domain/timeline';
import {
  briskPaceTarget,
  defaultDistanceUnit,
  encodeRoute,
  spokenPace,
  summarizeTrack,
  type DistanceUnit,
  type RoutePoint,
  type TrackPoint,
  type TrackSummary,
} from '../domain/track';
import type { Phase, ProtocolDef } from '../domain/types';
import { cues, type CueOptions } from '../lib/cues';
import type { SessionEntry } from '../state/model';
import { useStore } from '../state/store';
import type { TimerStatus } from './useIntervalTimer';
import { useNow } from './useNow';

/** No fix for this long = "GPS signal lost". */
const STALE_MS = 12_000;
/** Pace nudges: only after this long into a brisk interval… */
const NUDGE_AFTER_MS = 75_000;
/** …at most this often… */
const NUDGE_GAP_MS = 75_000;
/** …and when this much slower than your target. */
const NUDGE_SLOWER_BY = 1.07;

export type GpsState = 'off' | 'searching' | 'ok' | 'lost';

export interface GpsResult {
  gps: NonNullable<SessionEntry['gps']>;
  route: RoutePoint[];
}

interface TimerLike {
  status: TimerStatus;
  toTimeline: (at: number) => number | null;
  positionAt: (at: number) => TimelinePosition | null;
}

/**
 * GPS during a workout: listens to fixes recorded by the background service,
 * shows live distance and pace for the current stage, and — on interval
 * walks with no heart-rate sensor — nudges you towards your brisk pace.
 */
export function useWorkoutGps(
  def: ProtocolDef,
  phases: readonly Phase[],
  timer: TimerLike,
  position: TimelinePosition,
  cueOpts: CueOptions,
  /** True while a heart-rate sensor is giving readings — it's the better coach. */
  heartRateLive: boolean,
) {
  const { state } = useStore();
  const unit: DistanceUnit = state.settings.distanceUnit ?? defaultDistanceUnit(Intl.DateTimeFormat().resolvedOptions().locale);
  const points = useRef<TrackPoint[]>([]);
  const [summary, setSummary] = useState<TrackSummary | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const lastNudgeAt = useRef(0);
  const now = useNow(1000);

  const target = useMemo(() => {
    if (def.id !== 'japanese-iwt') return null;
    const recent = state.sessions
      .filter((s) => s.protocolId === def.id && s.gps?.workPaceSecPerKm)
      .map((s) => ({ workPaceSecPerKm: s.gps?.workPaceSecPerKm, inZonePct: s.hr?.inZonePct ?? null }));
    return briskPaceTarget(recent);
  }, [def.id, state.sessions]);

  const onFix = useEffectEvent((p: TrackPoint) => {
    points.current.push(p);
    setLastFixAt(Date.now());
    if (timer.status !== 'running') return;
    const s = summarizeTrack(points.current, phases, timer.toTimeline);
    setSummary(s);

    // Pace nudge (interval walking only, when heart rate isn't coaching).
    const pos = timer.positionAt(p.t);
    if (!pos || pos.done || target === null || heartRateLive || !state.settings.voiceCoaching) return;
    if (pos.phase.kind !== 'work' || pos.phaseElapsedMs < NUDGE_AFTER_MS || pos.phaseRemainingMs < 30_000) return;
    const pace = s.stages[pos.index]?.paceSecPerKm;
    if (pace == null || pace <= target * NUDGE_SLOWER_BY || p.t - lastNudgeAt.current < NUDGE_GAP_MS) return;
    lastNudgeAt.current = p.t;
    cues.coach(`A little quicker. Aim for ${spokenPace(target, unit)}.`, cueOpts);
  });

  useEffect(() => {
    const sub = backgroundSession?.addListener('onLocation', (p) => onFix(p));
    return () => sub?.remove();
  }, []);

  /**
   * Final numbers for the journal. Fetches the complete track from the
   * service (fixes that arrived while the app was asleep included).
   */
  const finish = useCallback(async (): Promise<GpsResult | null> => {
    let all = points.current;
    if (backgroundSession) {
      try {
        const native = await backgroundSession.getTrack(0);
        if (native.length >= all.length) all = native;
      } catch {
        // Use what the app saw live.
      }
    }
    if (all.length < 2) return null;
    const s = summarizeTrack(all, phases, timer.toTimeline);
    if (s.distanceM < 20) return null;
    const route = encodeRoute(all, phases, timer.toTimeline);
    return {
      gps: {
        distanceM: Math.round(s.distanceM),
        climbM: Math.round(s.climbM),
        workPaceSecPerKm: s.workPaceSecPerKm ?? undefined,
        stages: s.stages
          .filter((st) => st.movingSec > 0)
          .map((st) => ({
            kind: st.kind,
            round: st.round,
            distanceM: Math.round(st.distanceM),
            paceSecPerKm: st.paceSecPerKm ?? undefined,
            climbM: Math.round(st.climbM),
          })),
        hasRoute: route.length >= 2,
      },
      route,
    };
  }, [phases, timer.toTimeline]);

  let gpsState: GpsState = 'off';
  if (backgroundSession) {
    if (lastFixAt === null) gpsState = timer.status === 'running' ? 'searching' : 'off';
    else gpsState = now - lastFixAt > STALE_MS ? 'lost' : 'ok';
  }

  return {
    state: gpsState,
    unit,
    distanceM: summary?.distanceM ?? 0,
    stagePaceSecPerKm: summary?.stages[position.index]?.paceSecPerKm ?? null,
    stageDistanceM: summary?.stages[position.index]?.distanceM ?? 0,
    /** Brisk-pace target for interval walking (from your recent walks). */
    targetPaceSecPerKm: target,
    finish,
  };
}
