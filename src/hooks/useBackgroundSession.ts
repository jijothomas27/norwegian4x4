import { useEffect, useEffectEvent, useRef } from 'react';

import { backgroundSession } from '../../modules/tempo-workout';
import { planCues } from '../domain/cuePlan';
import type { Phase } from '../domain/types';
import type { TimelinePosition } from '../domain/timeline';
import { setScheduledCuesInBackground, type CueOptions } from '../lib/cues';
import type { TimerStatus } from './useIntervalTimer';

/** Android refused the background session — go back to in-app cues. */
const fallBack = () => setScheduledCuesInBackground(false);

interface TimerLike {
  status: TimerStatus;
  speed: number;
  anchor: string;
  elapsedAt: (at: number) => number;
  positionAt: (at: number) => TimelinePosition;
}

/**
 * Hands the workout's cue schedule to the Android background service, so
 * stage announcements keep coming when you switch to another app or lock the
 * screen. Rebuilt on start, pause, resume, skip and when cue settings change.
 * A no-op where the native module isn't available (in-app cues are used).
 */
export function useBackgroundSession(phases: readonly Phase[], timer: TimerLike, opts: CueOptions) {
  const announced = useRef(-1);
  const completed = useRef(false);

  useEffect(() => {
    if (!backgroundSession) return;
    setScheduledCuesInBackground(true);
    return () => {
      setScheduledCuesInBackground(false);
      // After a finished workout the service lingers a few seconds to say
      // "Workout complete", then stops itself.
      if (!completed.current) backgroundSession?.stop().catch(() => {});
    };
  }, []);

  const sync = useEffectEvent(() => {
    if (!backgroundSession) return;
    if (timer.status === 'complete') {
      completed.current = true;
      return;
    }
    if (timer.status === 'idle') return;
    const now = Date.now();
    const plan = planCues({
      phases,
      elapsedMs: timer.elapsedAt(now),
      now,
      speed: timer.speed,
      running: timer.status === 'running',
      voice: opts.voice,
      haptics: opts.haptics,
      // Never announce the same stage twice (e.g. resuming exactly at a boundary).
      announceCurrent: timer.positionAt(now).index !== announced.current,
    });
    if (plan.announcedIndex !== null) announced.current = plan.announcedIndex;
    backgroundSession
      .sync(plan.cues, plan.status)
      .then((ok) => {
        if (!ok) fallBack();
      })
      .catch(fallBack);
  });

  useEffect(() => {
    sync();
  }, [timer.anchor, opts.voice, opts.haptics]);
}
