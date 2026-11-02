import { useEffect, useRef } from 'react';

import {
  cleanSamples,
  efficiencySamples,
  sessionEfficiency,
  type EfficiencyPoint,
  type HrRef,
} from '../domain/efficiency';
import { maxHrFor } from './fitness';
import { loadHrSeries } from './hrSeries';
import type { SessionEntry, Settings } from './model';
import { useStore } from './store';

/** Resting and max heart rate for the efficiency index; null until both are known. */
export function efficiencyRef(settings: Settings): HrRef | null {
  const max = maxHrFor(settings);
  return max && settings.restingHr ? { restHr: settings.restingHr, maxHr: max.bpm } : null;
}

/** One value per walk that has enough good intervals, oldest → newest. */
export function efficiencyPoints(sessions: readonly SessionEntry[], ref: HrRef): EfficiencyPoint[] {
  const out: EfficiencyPoint[] = [];
  for (const s of sessions) {
    if (!s.efficiency) continue;
    const index = sessionEfficiency(cleanSamples(s.efficiency), ref);
    if (index !== null) out.push({ at: s.startedAt, index });
  }
  return out.sort((a, b) => a.at - b.at);
}

const needsBackfill = (s: SessionEntry) => s.protocolId === 'japanese-iwt' && s.hasHrSeries === true && s.gps !== undefined && s.efficiency === undefined;

/**
 * Walks recorded before the efficiency trend existed (or restored from an
 * older backup) get their samples worked out once from the stored HR graph.
 * They use the whole-interval pace, since the steady-part pace wasn't kept then.
 */
export function useEfficiencyBackfill(): void {
  const { state, updateSession } = useStore();
  const { hydrated, sessions } = state;
  const done = useRef(new Set<string>());

  useEffect(() => {
    if (!hydrated) return;
    const todo = sessions.filter((s) => needsBackfill(s) && !done.current.has(s.id));
    if (todo.length === 0) return;
    let cancelled = false;
    void (async () => {
      const results: { id: string; efficiency: NonNullable<SessionEntry['efficiency']> }[] = [];
      for (const s of todo) {
        const series = await loadHrSeries(s.id);
        results.push({ id: s.id, efficiency: series && s.gps ? efficiencySamples(s.gps.stages, series) : [] });
      }
      if (cancelled) return;
      for (const r of results) {
        done.current.add(r.id);
        updateSession(r.id, { efficiency: r.efficiency });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, sessions, updateSession]);
}
