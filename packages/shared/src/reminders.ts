/**
 * Reminder duration rules.
 *
 * These mirror the CHECK constraints on public.reminders and the guard inside
 * public.set_reminder(). The database is the authority; this exists so the UI
 * can disable the Save button and explain why, instead of round-tripping to
 * collect an error message.
 */

export const MIN_TOTAL_HOURS = 1;
export const MAX_TOTAL_HOURS = 168; // 7 days

export const MAX_DAYS = 7;
export const MAX_HOURS = 23;

export type ReminderDuration = { days: number; hours: number };

export type ValidationResult =
  | { ok: true; totalHours: number }
  | { ok: false; reason: string };

export function totalHours({ days, hours }: ReminderDuration): number {
  return days * 24 + hours;
}

export function validateDuration({ days, hours }: ReminderDuration): ValidationResult {
  if (!Number.isInteger(days) || !Number.isInteger(hours)) {
    return { ok: false, reason: 'Days and hours must be whole numbers.' };
  }
  if (days < 0 || hours < 0) {
    return { ok: false, reason: 'Days and hours cannot be negative.' };
  }
  if (days > MAX_DAYS) {
    return { ok: false, reason: 'A reminder can be at most 7 days out.' };
  }
  if (hours > MAX_HOURS) {
    return { ok: false, reason: 'Use the days field for anything over 23 hours.' };
  }

  const total = totalHours({ days, hours });

  // The brief states x and y cannot both be zero, and the minimum total is one
  // hour. The second rule implies the first, so one check covers both.
  if (total < MIN_TOTAL_HOURS) {
    return { ok: false, reason: 'A reminder must be at least 1 hour out.' };
  }
  if (total > MAX_TOTAL_HOURS) {
    return { ok: false, reason: 'A reminder can be at most 7 days out.' };
  }

  return { ok: true, totalHours: total };
}

/** When a duration set right now would fire. */
export function fireAt(duration: ReminderDuration, from: Date = new Date()): Date {
  return new Date(from.getTime() + totalHours(duration) * 60 * 60 * 1000);
}

/** "2 days 3 hours", "1 hour", "7 days". */
export function describeDuration({ days, hours }: ReminderDuration): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  return parts.join(' ') || '0 hours';
}
