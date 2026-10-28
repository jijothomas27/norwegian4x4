import type { Tone } from '../theme/tokens';

export type ProtocolId = 'norwegian-4x4' | 'japanese-iwt';

export type PhaseKind = 'warmup' | 'work' | 'rest' | 'cooldown';

/** One timed block of a workout (e.g. "Round 2 · High intensity · 4:00"). */
export interface Phase {
  /** Stable key, unique within a workout. */
  key: string;
  kind: PhaseKind;
  tone: Tone;
  /** Short uppercase label shown on the timer, e.g. "HIGH INTENSITY". */
  label: string;
  /** Human title, e.g. "High intensity". */
  title: string;
  /** Effort guidance, e.g. "85–95% of max heart rate". */
  guidance: string;
  durationSec: number;
  /** 1-based round number for work/rest phases. */
  round?: number;
  totalRounds: number;
  /** Sentence spoken when the phase begins (if voice cues are on). */
  announcement: string;
}

export interface WorkoutConfig {
  warmupMin: number;
  rounds: number;
}

export interface PhaseSpec {
  label: string;
  title: string;
  guidance: string;
  tone: Tone;
}

export interface ProtocolDef {
  id: ProtocolId;
  name: string;
  /** Compact name for tight spaces (timer header). */
  shortName: string;
  /** Short tag shown on cards, e.g. "VO₂ MAX". */
  eyebrow: string;
  tagline: string;
  overview: string;
  principles: readonly string[];
  /** Card gradient, top-left → bottom-right. */
  cardGradient: readonly [string, string, string];
  accent: string;
  defaults: WorkoutConfig;
  warmupOptions: readonly number[];
  roundOptions: readonly number[];
  workSec: number;
  restSec: number;
  cooldownSec: number;
  warmup: PhaseSpec;
  work: PhaseSpec;
  rest: PhaseSpec;
  cooldown: PhaseSpec;
}
