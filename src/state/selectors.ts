import { formatDayHeading, startOfDay } from '../lib/format';
import type { JournalEntry, MetricEntry, SessionEntry } from './model';

export interface WeekSummary {
  sessions: number;
  minutes: number;
}

/** Sessions in the last 7 days (rolling), including today. */
export function weekSummary(sessions: readonly SessionEntry[], now = Date.now()): WeekSummary {
  const from = startOfDay(now) - 6 * 86_400_000;
  const recent = sessions.filter((s) => s.startedAt >= from);
  return {
    sessions: recent.length,
    minutes: Math.round(recent.reduce((sum, s) => sum + s.durationSec, 0) / 60),
  };
}

export interface SeriesPoint {
  at: number;
  value: number;
}

/** Chronological (oldest → newest) series of a numeric metric. */
export function metricSeries(
  metrics: readonly MetricEntry[],
  field: 'vo2max' | 'weightKg' | 'heartRate',
): SeriesPoint[] {
  return metrics
    .filter((m) => typeof m[field] === 'number')
    .map((m) => ({ at: m.at, value: m[field] as number }))
    .sort((a, b) => a.at - b.at);
}

export interface JournalSection {
  key: string;
  title: string;
  data: JournalEntry[];
}

const entryTime = (e: JournalEntry) => (e.type === 'session' ? e.startedAt : e.at);

/** Merge sessions and metric logs into day-grouped sections, newest first. */
export function journalSections(
  sessions: readonly SessionEntry[],
  metrics: readonly MetricEntry[],
  now = Date.now(),
): JournalSection[] {
  const all: JournalEntry[] = [...sessions, ...metrics].sort((a, b) => entryTime(b) - entryTime(a));
  const sections: JournalSection[] = [];
  for (const entry of all) {
    const day = startOfDay(entryTime(entry));
    const key = String(day);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(entry);
    else sections.push({ key, title: formatDayHeading(day, now), data: [entry] });
  }
  return sections;
}

export { entryTime };
