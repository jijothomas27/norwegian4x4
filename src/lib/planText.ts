import { getProtocol } from '../domain/protocols';
import type { ProtocolId } from '../domain/types';
import type { ReminderSettings, Suggestion } from '../domain/weekPlan';

/** Compact names for the weekly plan, where both protocols sit side by side. */
export const PLAN_LABEL: Record<ProtocolId, string> = { 'norwegian-4x4': '4×4', 'japanese-iwt': 'Walks' };

/** One calm sentence for the home screen. null = nothing to say (no goals set). */
export function suggestionLine(s: Suggestion): string | null {
  switch (s.kind) {
    case 'train': {
      const name = getProtocol(s.protocolId).shortName;
      return s.done === 0 ? `Today: ${name}. First of ${s.goal} this week.` : `Today: ${name}. ${s.done} of ${s.goal} done this week.`;
    }
    case 'done-today':
      return 'You’ve trained today. Rest well.';
    case 'rest-after-hard':
      return 'Rest day — give yesterday’s 4×4 time to sink in.';
    case 'goals-met':
      return 'This week’s goals are met. Anything more is a bonus.';
    case 'no-goals':
      return null;
  }
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday-first order for display. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_INITIALS: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };
export const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/** "every day", "weekdays", "weekends", "Mon, Wed, Fri" */
export function daysLabel(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'every day';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'weekends';
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => SHORT_DAYS[d])
    .join(', ');
}

export const clockTime = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** "Reminders weekdays at 18:00" / "Reminders off" */
export function remindersLine(r: ReminderSettings): string {
  if (!r.enabled || r.days.length === 0) return 'Reminders off';
  return `Reminders ${daysLabel(r.days)} at ${clockTime(r.hour, r.minute)}`;
}
