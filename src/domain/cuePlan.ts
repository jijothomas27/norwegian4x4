import type { Phase } from './types';

// Kept free of runtime imports (like the rest of src/domain) so tests run on plain Node.

/**
 * Turns "where we are in the workout" into a list of wall-clock cues that the
 * Android background service plays on its own (see modules/tempo-workout).
 * Pure, so it is unit-tested in tests/cuePlan.test.ts.
 *
 * Mirrors the in-app cues: stage announcements, a 3-2-1 before each stage
 * ends, "Halfway" and "One minute left" during work intervals, and a final
 * "Workout complete".
 */

export type Buzz = 'hard' | 'easy' | 'tick' | 'soft' | 'success';

export interface CueStatus {
  title: string;
  body?: string;
  /** Wall-clock end of the current stage — the notification counts down to it. */
  endsAt?: number | null;
}

export interface PlannedCue {
  /** Wall-clock time (epoch ms). */
  at: number;
  text: string | null;
  vibrate: Buzz | null;
  /** Drop the cue if it would play later than this; 0 = always play. */
  skipIfLateMs: number;
  final: boolean;
  /** Switch the ongoing notification to this stage when the cue fires. */
  status?: CueStatus;
}

export interface CuePlanInput {
  phases: readonly Phase[];
  /** Timeline position (ms into the workout) at `now`. */
  elapsedMs: number;
  /** Wall clock (epoch ms) that `elapsedMs` refers to. */
  now: number;
  /** Timeline ms per wall-clock ms (1, or more in the dev preview). */
  speed: number;
  running: boolean;
  voice: boolean;
  haptics: boolean;
  /**
   * Announce the current stage if we sit exactly at its start (workout start,
   * or just skipped into it). False when it has already been announced.
   */
  announceCurrent: boolean;
}

export interface CuePlan {
  cues: PlannedCue[];
  status: CueStatus;
  /** Index of the stage announced right away, if any. */
  announcedIndex: number | null;
}

export const COMPLETE_TEXT = 'Workout complete. Beautifully done.';
export const COUNTDOWN_TEXT = 'Three. Two. One.';
export const HALFWAY_TEXT = 'Halfway. Hold steady.';
export const ONE_MINUTE_TEXT = 'One minute left.';

export function stageTitle(phase: Phase): string {
  return phase.round ? `Round ${phase.round} of ${phase.totalRounds} · ${phase.title}` : phase.title;
}

export function planCues(input: CuePlanInput): CuePlan {
  const { phases, elapsedMs, now, voice, haptics } = input;
  const speed = input.speed > 0 ? input.speed : 1;
  const offsets: number[] = [0];
  for (const p of phases) offsets.push(offsets[offsets.length - 1] + p.durationSec * 1000);
  const total = offsets[offsets.length - 1];
  const wall = (t: number) => Math.round(now + (t - elapsedMs) / speed);
  const done = phases.length === 0 || elapsedMs >= total;
  const index = done ? Math.max(0, phases.length - 1) : offsets.findIndex((_, i) => i < phases.length && elapsedMs < offsets[i + 1]);
  const pos = { done, index, phase: phases[index] };

  if (!input.running || pos.done) {
    return {
      cues: [],
      status: pos.done
        ? { title: 'Workout complete', body: 'Tap to see your summary' }
        : { title: `Paused · ${stageTitle(pos.phase)}`, body: 'Tap to return to Tempo' },
      announcedIndex: null,
    };
  }

  const cues: PlannedCue[] = [];
  const say = (text: string) => (voice ? text : null);
  const buzz = (kind: Buzz) => (haptics ? kind : null);
  const push = (c: PlannedCue) => {
    if (c.text || c.vibrate || c.status || c.final) cues.push(c);
  };
  let announcedIndex: number | null = null;

  phases.forEach((phase, i) => {
    const start = offsets[i];
    const end = offsets[i + 1];
    if (end <= elapsedMs) return; // already over

    const isCurrentStart = start === elapsedMs && input.announceCurrent;
    if (start > elapsedMs || isCurrentStart) {
      if (start === elapsedMs) announcedIndex = i;
      push({
        at: wall(start),
        text: say(phase.announcement),
        vibrate: buzz(phase.kind === 'work' ? 'hard' : 'easy'),
        skipIfLateMs: 0,
        final: false,
        status: { title: stageTitle(phase), body: phase.guidance, endsAt: wall(end) },
      });
    }

    const dur = phase.durationSec;
    if (phase.kind === 'work') {
      const half = Math.round(dur / 2);
      if (half !== dur) {
        const t = end - half * 1000;
        if (t > elapsedMs) push({ at: wall(t), text: say(HALFWAY_TEXT), vibrate: buzz('soft'), skipIfLateMs: 5000, final: false });
      }
      if (dur > 60 && half !== 60) {
        const t = end - 60_000;
        if (t > elapsedMs) push({ at: wall(t), text: say(ONE_MINUTE_TEXT), vibrate: buzz('soft'), skipIfLateMs: 5000, final: false });
      }
    }

    if (dur > 10) {
      for (const s of [3, 2, 1]) {
        const t = end - s * 1000;
        if (t <= elapsedMs) continue;
        push({
          at: wall(t),
          text: s === 3 ? say(COUNTDOWN_TEXT) : null,
          vibrate: buzz('tick'),
          skipIfLateMs: 1500,
          final: false,
        });
      }
    }
  });

  push({
    at: wall(total),
    text: say(COMPLETE_TEXT),
    vibrate: buzz('success'),
    skipIfLateMs: 0,
    final: true,
    status: { title: 'Workout complete', body: 'Tap to see your summary' },
  });

  const current = pos.phase;
  return {
    cues: cues.sort((a, b) => a.at - b.at),
    status: { title: stageTitle(current), body: current.guidance, endsAt: wall(offsets[pos.index + 1]) },
    announcedIndex,
  };
}
