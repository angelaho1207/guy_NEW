/**
 * The 1:1 request windows.
 *
 * Both clocks start at the moment the recipient approves:
 *   - 3 days to agree on a time, or the request expires and either person can
 *     send a new one.
 *   - 2 weeks as the outer limit on when the meeting itself may fall.
 *
 * Mirrors public.respond_one_on_one() and public.schedule_one_on_one().
 */

export const SCHEDULING_WINDOW_DAYS = 3;
export const OUTER_LIMIT_DAYS = 14;
export const CONFIRMATION_TIMEOUT_MS = 30_000;

export type OneOnOneStatus =
  | 'pending'
  | 'approved'
  | 'scheduled'
  | 'declined'
  | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;

export type Windows = { expiresAt: Date; outerLimitAt: Date };

export function windowsFromApproval(approvedAt: Date): Windows {
  return {
    expiresAt: new Date(approvedAt.getTime() + SCHEDULING_WINDOW_DAYS * DAY_MS),
    outerLimitAt: new Date(approvedAt.getTime() + OUTER_LIMIT_DAYS * DAY_MS),
  };
}

export type ProposalCheck = { ok: true } | { ok: false; reason: string };

/** Whether a proposed meeting time is acceptable, and if not, why. */
export function canPropose(
  when: Date,
  windows: Windows,
  now: Date = new Date(),
): ProposalCheck {
  if (now >= windows.expiresAt) {
    return { ok: false, reason: 'The 3 day scheduling window has closed.' };
  }
  if (when <= now) {
    return { ok: false, reason: 'Pick a time in the future.' };
  }
  if (when > windows.outerLimitAt) {
    return { ok: false, reason: 'The 1:1 must fall within 2 weeks of approval.' };
  }
  return { ok: true };
}

/** Milliseconds left to agree on a time; zero once the window has closed. */
export function schedulingTimeLeftMs(windows: Windows, now: Date = new Date()): number {
  return Math.max(0, windows.expiresAt.getTime() - now.getTime());
}

/** Whether the scheduling chat should accept new messages. */
export function chatIsOpen(
  status: OneOnOneStatus,
  windows: Windows | null,
  now: Date = new Date(),
): boolean {
  if (status !== 'approved' && status !== 'scheduled') return false;
  if (!windows) return false;
  return now < windows.expiresAt;
}
