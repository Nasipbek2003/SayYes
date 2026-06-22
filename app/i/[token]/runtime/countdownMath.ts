/**
 * Pure logic for the event Countdown (task 7.3, Template 3 / Requirement 8.1).
 *
 * Template 3 ("той / праздник") shows a live countdown to the event date on the
 * details screen. The countdown ticks on the client, but the maths of "how much
 * time is left" is framework-independent and lives here so it can be unit-tested
 * without a DOM or timers (same split as {@link controller}). The React
 * component ({@link Countdown}) is a thin wrapper that re-evaluates
 * {@link computeRemaining} on an interval.
 *
 * Named `countdownMath` (not `countdown`) so it never clashes with
 * `Countdown.tsx` on case-insensitive filesystems.
 */

/** Breakdown of the remaining time until the event. */
export interface Remaining {
  /** Whole days remaining. */
  days: number;
  /** Hours within the last day (0–23). */
  hours: number;
  /** Minutes within the last hour (0–59). */
  minutes: number;
  /** Seconds within the last minute (0–59). */
  seconds: number;
  /** Total milliseconds remaining (never negative). */
  totalMs: number;
  /** True once the target time has arrived or passed. */
  isPast: boolean;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Parse a target date into a millisecond timestamp. Accepts a `Date`, an epoch
 * number, or an ISO-ish string. Returns `null` for an unparseable value so the
 * UI can fall back gracefully instead of rendering `NaN`.
 */
export function parseTarget(target: Date | string | number): number | null {
  if (target instanceof Date) {
    const ms = target.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof target === 'number') {
    return Number.isFinite(target) ? target : null;
  }
  const ms = new Date(target).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Compute the time remaining from `now` until `target` (Requirement 8.1).
 *
 * The breakdown is clamped at zero: once the event time has passed, every field
 * is `0` and `isPast` is `true`. `now` is injectable so tests are deterministic.
 */
export function computeRemaining(
  target: Date | string | number,
  now: number = Date.now(),
): Remaining {
  const targetMs = parseTarget(target);
  if (targetMs === null) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isPast: true };
  }

  const totalMs = Math.max(0, targetMs - now);
  if (totalMs === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isPast: true };
  }

  return {
    days: Math.floor(totalMs / MS_PER_DAY),
    hours: Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((totalMs % MS_PER_MINUTE) / MS_PER_SECOND),
    totalMs,
    isPast: false,
  };
}

/** Pad a time part to two digits for display (e.g. `7` → `"07"`). */
export function pad2(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(2, '0');
}

/**
 * Format a {@link Remaining} as a compact `D:HH:MM:SS` label. Days are omitted
 * when zero so a same-day countdown reads `HH:MM:SS`.
 */
export function formatRemaining(remaining: Remaining): string {
  const hms = `${pad2(remaining.hours)}:${pad2(remaining.minutes)}:${pad2(remaining.seconds)}`;
  return remaining.days > 0 ? `${remaining.days}:${hms}` : hms;
}
