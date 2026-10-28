import type { ProtocolId } from '../domain/types';

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

export interface Settings {
  weightUnit: WeightUnit;
  voiceCues: boolean;
  haptics: boolean;
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
  const settings: Settings = {
    weightUnit: s.weightUnit === 'lbs' ? 'lbs' : 'kg',
    voiceCues: typeof s.voiceCues === 'boolean' ? s.voiceCues : DEFAULT_SETTINGS.voiceCues,
    haptics: typeof s.haptics === 'boolean' ? s.haptics : DEFAULT_SETTINGS.haptics,
  };

  return { version: 1, sessions, metrics, settings };
}
