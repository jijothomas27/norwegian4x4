import type { Phase, ProtocolDef, ProtocolId, WorkoutConfig } from './types';

// Note: this module is deliberately free of React Native imports so the
// workout logic can be unit-tested in plain Node (see tests/).

export const NORWEGIAN_4X4: ProtocolDef = {
  id: 'norwegian-4x4',
  name: 'Norwegian 4×4',
  shortName: 'Norwegian 4×4',
  eyebrow: 'VO₂ max',
  tagline: 'Four hard intervals to raise your aerobic ceiling.',
  overview:
    'Developed by exercise physiologists in Trondheim, the 4×4 alternates four-minute efforts near your aerobic limit with three minutes of easy movement. It is one of the most studied ways to improve VO₂ max — the strongest single fitness marker of healthy longevity.',
  principles: [
    'Work at 85–95% of max heart rate — you can only speak a few words.',
    'Recover actively at 60–70%: keep moving, never stop completely.',
    'Once or twice a week is enough. Consistency beats intensity.',
  ],
  cardGradient: ['#5A1426', '#2A0E18', '#17121A'],
  accent: '#FF5A6E',
  defaults: { warmupMin: 5, rounds: 4 },
  warmupOptions: [5, 6, 7, 8, 9, 10],
  roundOptions: [4],
  workSec: 4 * 60,
  restSec: 3 * 60,
  cooldownSec: 5 * 60,
  warmup: {
    label: 'Warm-up',
    title: 'Warm-up',
    guidance: 'Easy pace · build gradually to a light sweat',
    tone: 'warmup',
    target: { low: 0.5, high: 0.7, settleSec: 120 },
  },
  work: {
    label: 'High intensity',
    title: 'High intensity',
    guidance: '85–95% of max heart rate · only a few words possible',
    tone: 'intense',
    target: { low: 0.85, high: 0.95, settleSec: 90 },
  },
  rest: {
    label: 'Active recovery',
    title: 'Active recovery',
    guidance: '60–70% of max heart rate · keep moving, breathe deep',
    tone: 'recover',
    target: { low: 0.6, high: 0.7, settleSec: 75 },
  },
  cooldown: {
    label: 'Cool-down',
    title: 'Cool-down',
    guidance: 'Gentle pace · let your heart rate settle',
    tone: 'cooldown',
    target: { low: 0.5, high: 0.65, settleSec: 90 },
  },
};

export const JAPANESE_IWT: ProtocolDef = {
  id: 'japanese-iwt',
  name: 'Japanese Interval Walking',
  shortName: 'Interval Walking',
  eyebrow: 'Longevity',
  tagline: 'Alternate brisk and easy walking, three minutes at a time.',
  overview:
    'Interval Walking Training was developed at Shinshu University in Matsumoto, Japan. Alternating three minutes of fast walking with three minutes of relaxed walking has been shown to improve aerobic fitness, leg strength and blood pressure — with nothing more than a good pair of shoes.',
  principles: [
    'Fast walk at roughly 70% effort — breathing deep, talking in short phrases.',
    'Slow walk at an easy, leisurely pace to recover fully.',
    'Aim for four or more sessions a week.',
  ],
  cardGradient: ['#0E3B3A', '#102324', '#14161A'],
  accent: '#2FD4C4',
  defaults: { warmupMin: 3, rounds: 5 },
  warmupOptions: [3],
  roundOptions: [5, 6],
  workSec: 3 * 60,
  restSec: 3 * 60,
  cooldownSec: 3 * 60,
  warmup: {
    label: 'Warm-up',
    title: 'Warm-up',
    guidance: 'Comfortable walk · loosen up, stand tall',
    tone: 'warmup',
    target: { low: 0.5, high: 0.65, settleSec: 90 },
  },
  work: {
    label: 'Fast walk',
    title: 'Fast walk',
    guidance: '~70% effort · long strides, swing your arms',
    tone: 'brisk',
    target: { low: 0.75, high: 0.85, settleSec: 60 },
  },
  rest: {
    label: 'Slow walk',
    title: 'Slow walk',
    guidance: '~40% effort · relaxed and leisurely',
    tone: 'easy',
    target: { low: 0.55, high: 0.68, settleSec: 60 },
  },
  cooldown: {
    label: 'Cool-down',
    title: 'Cool-down',
    guidance: 'Easy stroll · let your breathing return to normal',
    tone: 'cooldown',
    target: { low: 0.5, high: 0.65, settleSec: 60 },
  },
};

export const PROTOCOLS: Record<ProtocolId, ProtocolDef> = {
  'norwegian-4x4': NORWEGIAN_4X4,
  'japanese-iwt': JAPANESE_IWT,
};

export const PROTOCOL_LIST: readonly ProtocolDef[] = [NORWEGIAN_4X4, JAPANESE_IWT];

export function isProtocolId(value: unknown): value is ProtocolId {
  return value === 'norwegian-4x4' || value === 'japanese-iwt';
}

export function getProtocol(id: ProtocolId): ProtocolDef {
  return PROTOCOLS[id];
}

/** Clamp a requested config to the values the protocol allows. */
export function normalizeConfig(def: ProtocolDef, config: Partial<WorkoutConfig>): WorkoutConfig {
  const pick = (value: number | undefined, options: readonly number[], fallback: number) =>
    value !== undefined && options.includes(value) ? value : fallback;
  return {
    warmupMin: pick(config.warmupMin, def.warmupOptions, def.defaults.warmupMin),
    rounds: pick(config.rounds, def.roundOptions, def.defaults.rounds),
  };
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const spokenMinutes = (sec: number) => {
  const min = Math.round(sec / 60);
  const word = NUMBER_WORDS[min] ?? String(min);
  return `${word} minute${min === 1 ? '' : 's'}`;
};

/** Expand a protocol + config into the ordered list of timed phases. */
export function buildPhases(def: ProtocolDef, rawConfig: Partial<WorkoutConfig> = {}): Phase[] {
  const config = normalizeConfig(def, rawConfig);
  const totalRounds = config.rounds;
  const phases: Phase[] = [];

  const warmupSec = config.warmupMin * 60;
  phases.push({
    key: 'warmup',
    kind: 'warmup',
    tone: def.warmup.tone,
    label: def.warmup.label,
    title: def.warmup.title,
    guidance: def.warmup.guidance,
    durationSec: warmupSec,
    totalRounds,
    announcement: `Warm up. ${spokenMinutes(warmupSec)}. Ease into it.`,
    target: def.warmup.target,
  });

  for (let round = 1; round <= totalRounds; round++) {
    phases.push({
      key: `work-${round}`,
      kind: 'work',
      tone: def.work.tone,
      label: def.work.label,
      title: def.work.title,
      guidance: def.work.guidance,
      durationSec: def.workSec,
      round,
      totalRounds,
      announcement: `Round ${round} of ${totalRounds}. ${def.work.title}. ${spokenMinutes(def.workSec)}.`,
      target: def.work.target,
    });
    phases.push({
      key: `rest-${round}`,
      kind: 'rest',
      tone: def.rest.tone,
      label: def.rest.label,
      title: def.rest.title,
      guidance: def.rest.guidance,
      durationSec: def.restSec,
      round,
      totalRounds,
      announcement: `${def.rest.title}. ${spokenMinutes(def.restSec)}. Breathe.`,
      target: def.rest.target,
    });
  }

  phases.push({
    key: 'cooldown',
    kind: 'cooldown',
    tone: def.cooldown.tone,
    label: def.cooldown.label,
    title: def.cooldown.title,
    guidance: def.cooldown.guidance,
    durationSec: def.cooldownSec,
    totalRounds,
    announcement: `Cool down. ${spokenMinutes(def.cooldownSec)}. Well done.`,
    target: def.cooldown.target,
  });

  return phases;
}
