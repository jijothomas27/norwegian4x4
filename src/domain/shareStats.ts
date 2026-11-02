import type { ProtocolId } from './types';

/**
 * Which numbers go on the share card. A card has room for four, so pick the
 * ones that say the most about this kind of workout: time in zone and peak
 * heart rate for the 4×4, distance and brisk pace for interval walking.
 * Pure — unit-tested in tests/shareStats.test.ts.
 */

export type ShareStatKind = 'inZone' | 'peakHr' | 'avgHr' | 'vo2' | 'distance' | 'workPace' | 'recovery';

export interface ShareStat {
  kind: ShareStatKind;
  value: number;
}

export interface ShareInput {
  protocolId: ProtocolId;
  hr?: { avg: number; max: number; inZonePct: number | null; sustainedMax?: number; recoveryAvg?: number };
  gps?: { distanceM: number; workPaceSecPerKm?: number };
  vo2Estimate?: number;
}

const PRIORITY: Record<ProtocolId, readonly ShareStatKind[]> = {
  'norwegian-4x4': ['inZone', 'peakHr', 'vo2', 'distance', 'avgHr', 'recovery', 'workPace'],
  'japanese-iwt': ['distance', 'workPace', 'inZone', 'avgHr', 'vo2', 'peakHr', 'recovery'],
};

function valueOf(kind: ShareStatKind, s: ShareInput): number | undefined {
  switch (kind) {
    case 'inZone':
      return s.hr?.inZonePct ?? undefined;
    case 'peakHr': {
      const peak = s.hr ? s.hr.sustainedMax || s.hr.max : 0;
      return peak > 0 ? peak : undefined;
    }
    case 'avgHr':
      return s.hr && s.hr.avg > 0 ? s.hr.avg : undefined;
    case 'vo2':
      return s.vo2Estimate;
    case 'distance':
      // Under 100 m means GPS barely ran (treadmill, indoors) — not worth boasting about.
      return s.gps && s.gps.distanceM >= 100 ? s.gps.distanceM : undefined;
    case 'workPace':
      return s.gps?.workPaceSecPerKm;
    case 'recovery':
      return s.hr?.recoveryAvg !== undefined && s.hr.recoveryAvg > 0 ? s.hr.recoveryAvg : undefined;
  }
}

export function pickShareStats(input: ShareInput, limit = 4): ShareStat[] {
  const out: ShareStat[] = [];
  for (const kind of PRIORITY[input.protocolId]) {
    const value = valueOf(kind, input);
    if (value !== undefined && Number.isFinite(value)) out.push({ kind, value });
    if (out.length === limit) break;
  }
  return out;
}
