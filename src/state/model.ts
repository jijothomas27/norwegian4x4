import type { DistanceUnit } from '../domain/track';
import type { PhaseKind, ProtocolId } from '../domain/types';
import type { ReminderSettings } from '../domain/weekPlan';

export type WeightUnit = 'kg' | 'lbs';

export interface SessionEntry {
  id: string;
  type: 'session';
  protocolId: ProtocolId;
  /** epoch ms */
  startedAt: number;
  endedAt: number;
  /** Time actually spent moving (skipped time excluded), seconds. */
  durationSec: number;
  roundsCompleted: number;
  totalRounds: number;
  /** false when the workout was ended early and saved as partial. */
  completed: boolean;
  /** Present when a heart-rate sensor was connected during the session. */
  hr?: {
    avg: number;
    max: number;
    /** % of hard-interval time inside the target band. */
    inZonePct: number | null;
    /** Highest heart rate held for 10 s. */
    sustainedMax?: number;
    /** bpm drop 60 s after each hard interval, in round order. */
    recovery?: number[];
    recoveryAvg?: number;
  };
  /** Heart rate over the whole workout is stored separately (state/hrSeries.ts). */
  hasHrSeries?: boolean;
  /** Present when GPS was recording. The route itself is stored separately (state/routes.ts). */
  gps?: {
    distanceM: number;
    climbM: number;
    workPaceSecPerKm?: number;
    stages: { kind: PhaseKind; round?: number; distanceM: number; paceSecPerKm?: number; climbM: number }[];
    hasRoute: boolean;
  };
  /** Heart-rate-ratio VO₂ max estimate computed when the session ended. */
  vo2Estimate?: number;
  /** Max heart rate in effect after this session; `previous` is set when the session raised it. */
  maxHr?: { bpm: number; source: 'measured' | 'workouts' | 'age'; previous?: number };
}

export interface MetricEntry {
  id: string;
  type: 'metric';
  /** epoch ms */
  at: number;
  vo2max?: number;
  weightKg?: number;
  heartRate?: number;
  notes?: string;
  /** When logged straight after a workout. */
  sessionId?: string;
}

export type JournalEntry = SessionEntry | MetricEntry;

export interface HrDevice {
  id: string;
  name: string;
}

export interface Settings {
  weightUnit: WeightUnit;
  /** Pace and distance; defaults from the phone's region. */
  distanceUnit?: DistanceUnit;
  /** Text-to-speech voice for cues; undefined = pick the best one automatically. */
  voiceId?: string;
  voiceCues: boolean;
  haptics: boolean;
  /** Spoken "push harder / ease off" prompts when out of the target zone. */
  voiceCoaching: boolean;
  /** Used to estimate max heart rate when no measured value is set. */
  age?: number;
  /** Measured max heart rate, overrides the age estimate. */
  maxHr?: number;
  /** Last heart-rate sensor used — reconnected automatically. */
  hrDevice?: HrDevice;
  /** Resting heart rate (entered, or measured with the resting check). */
  restingHr?: number;
  restingHrAt?: number;
  /** Highest sustained heart rate seen in workouts. */
  learnedMaxHr?: number;
  learnedMaxHrAt?: number;
  /** Personal VO₂ factor calibrated from a logged reference reading. */
  vo2Factor?: number;
  /** Workout screen: show heart rate big inside the ring (and the clock in the panel). */
  hrFocus?: boolean;
  /** When the journal was last exported as a backup file (epoch ms). */
  lastBackupAt?: number;
  /** "Not now" on the backup reminder (epoch ms). */
  backupSnoozedAt?: number;
  /** Sessions per week to aim for; missing protocols use the defaults (domain/weekPlan.ts). */
  weeklyGoals?: Partial<Record<ProtocolId, number>>;
  /** Workout reminders (local notifications). Kept per phone: not copied when merging a backup. */
  reminders?: ReminderSettings;
}

export interface PersistedState {
  version: 1;
  sessions: SessionEntry[];
  metrics: MetricEntry[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  weightUnit: 'kg',
  voiceCues: true,
  haptics: true,
  voiceCoaching: true,
};

export const EMPTY_STATE: PersistedState = {
  version: 1,
  sessions: [],
  metrics: [],
  settings: DEFAULT_SETTINGS,
};

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Defensive parse of whatever is in storage. Malformed entries are dropped
 * rather than crashing the app on launch.
 */
export function parsePersisted(raw: string | null): PersistedState {
  if (!raw) return EMPTY_STATE;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_STATE;
  }
  if (!isObj(data)) return EMPTY_STATE;

  const sessions: SessionEntry[] = Array.isArray(data.sessions)
    ? data.sessions.filter(
        (s): s is SessionEntry =>
          isObj(s) &&
          s.type === 'session' &&
          (s.protocolId === 'norwegian-4x4' || s.protocolId === 'japanese-iwt') &&
          num(s.startedAt) !== undefined &&
          num(s.durationSec) !== undefined,
      )
    : [];

  const metrics: MetricEntry[] = Array.isArray(data.metrics)
    ? data.metrics.filter((m): m is MetricEntry => isObj(m) && m.type === 'metric' && num(m.at) !== undefined)
    : [];

  const s = isObj(data.settings) ? data.settings : {};
  const device = isObj(s.hrDevice) && typeof s.hrDevice.id === 'string' ? s.hrDevice : undefined;
  const settings: Settings = {
    weightUnit: s.weightUnit === 'lbs' ? 'lbs' : 'kg',
    distanceUnit: s.distanceUnit === 'mi' || s.distanceUnit === 'km' ? s.distanceUnit : undefined,
    voiceId: typeof s.voiceId === 'string' ? s.voiceId : undefined,
    voiceCues: typeof s.voiceCues === 'boolean' ? s.voiceCues : DEFAULT_SETTINGS.voiceCues,
    haptics: typeof s.haptics === 'boolean' ? s.haptics : DEFAULT_SETTINGS.haptics,
    voiceCoaching: typeof s.voiceCoaching === 'boolean' ? s.voiceCoaching : DEFAULT_SETTINGS.voiceCoaching,
    age: num(s.age),
    maxHr: num(s.maxHr),
    hrDevice: device ? { id: device.id as string, name: typeof device.name === 'string' ? device.name : 'Heart-rate sensor' } : undefined,
    restingHr: num(s.restingHr),
    restingHrAt: num(s.restingHrAt),
    learnedMaxHr: num(s.learnedMaxHr),
    learnedMaxHrAt: num(s.learnedMaxHrAt),
    vo2Factor: num(s.vo2Factor),
    hrFocus: typeof s.hrFocus === 'boolean' ? s.hrFocus : undefined,
    lastBackupAt: num(s.lastBackupAt),
    backupSnoozedAt: num(s.backupSnoozedAt),
    weeklyGoals: parseGoals(s.weeklyGoals),
    reminders: parseReminders(s.reminders),
  };

  return { version: 1, sessions, metrics, settings };
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function parseGoals(raw: unknown): Settings['weeklyGoals'] {
  if (!isObj(raw)) return undefined;
  const out: Partial<Record<ProtocolId, number>> = {};
  for (const id of ['norwegian-4x4', 'japanese-iwt'] as const) if (isInt(raw[id], 0, 7)) out[id] = raw[id];
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseReminders(raw: unknown): ReminderSettings | undefined {
  if (!isObj(raw)) return undefined;
  if (typeof raw.enabled !== 'boolean' || !isInt(raw.hour, 0, 23) || !isInt(raw.minute, 0, 59) || !Array.isArray(raw.days)) return undefined;
  const days = [...new Set(raw.days.filter((d): d is number => isInt(d, 0, 6)))];
  return { enabled: raw.enabled, days, hour: raw.hour, minute: raw.minute };
}
