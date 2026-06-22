/**
 * Pure RSVP aggregation helper (task 10.3, Requirements 8.6 / 10.3).
 *
 * Template 3 ("event-rsvp") collects one answer per guest. The author's cabinet
 * shows a dashboard with the guest list and the headline totals: how many are
 * coming, how many are not, and the total number of *people* expected (each
 * attending guest counts as themselves plus any extra `+1`s they declared).
 *
 * This module is deliberately free of any database/Prisma/HTTP dependency so it
 * can be unit-tested in isolation: it takes the raw response rows (the
 * `guestName` column plus the stored `outcome` JSON) and returns a plain
 * summary. The service layer (and route handler) compose it with data access.
 *
 * ## Counting rules
 *  - A guest is **coming** when their RSVP decision is `"yes"`.
 *  - A guest is **not coming** when their decision is `"no"`.
 *  - Any other/missing decision is ignored for the headline counts but the
 *    guest still appears in the list with an `"unknown"` status (defensive:
 *    a malformed/legacy row should never crash the dashboard).
 *  - **Total people** sums, over the attending guests only, the declared party
 *    size. A party size is the number of people that guest brings *including
 *    themselves*; when the author did not collect a party size (or it is
 *    missing/invalid) an attending guest counts as exactly one person.
 */

/** A single guest row to aggregate: the name column + the stored outcome JSON. */
export interface RsvpResponseRow {
  /** Guest display name (the `Response.guestName` column). */
  guestName?: string | null;
  /** The stored `Response.outcome` JSON (a {@link GuestResponse}-shaped value). */
  outcome: unknown;
}

/** RSVP decision normalised for the dashboard. */
export type RsvpDecision = 'yes' | 'no' | 'unknown';

/** A normalised guest entry shown in the RSVP dashboard list. */
export interface RsvpGuest {
  /** Guest display name (falls back to the outcome's `guestName`, else null). */
  guestName: string | null;
  /** Normalised decision. */
  decision: RsvpDecision;
  /**
   * Number of people this guest accounts for when attending (themselves + any
   * declared `+N`). Always `>= 1` for an attending guest; `0` when not coming.
   */
  people: number;
}

/** Headline totals + per-guest list for the RSVP dashboard (Requirement 8.6). */
export interface RsvpSummary {
  /** Number of guests who answered "Приду". */
  coming: number;
  /** Number of guests who answered "Не смогу". */
  notComing: number;
  /** Total number of people expected (sum of attending guests' party sizes). */
  totalPeople: number;
  /** Number of guest responses considered (length of {@link guests}). */
  totalResponses: number;
  /** Per-guest list in the order supplied. */
  guests: RsvpGuest[];
}

/** Read the `outcome` JSON as a plain record, or an empty object. */
function asRecord(outcome: unknown): Record<string, unknown> {
  return outcome && typeof outcome === 'object' && !Array.isArray(outcome)
    ? (outcome as Record<string, unknown>)
    : {};
}

/** Normalise a stored RSVP decision to `"yes" | "no" | "unknown"`. */
function readDecision(outcome: Record<string, unknown>): RsvpDecision {
  const rsvp = outcome['rsvp'];
  if (rsvp === 'yes') return 'yes';
  if (rsvp === 'no') return 'no';
  return 'unknown';
}

/**
 * Read a guest's declared party size as a positive integer, defaulting to 1.
 *
 * The stored `guests` value is the *extra* convention used across the app: the
 * RSVP form's "число гостей" is the total party size including the guest. We
 * treat any integer `>= 1` as the headcount; anything missing/invalid (or
 * `< 1`) falls back to a single person so an attending guest is never counted
 * as zero people.
 */
function readPeople(outcome: Record<string, unknown>): number {
  const guests = outcome['guests'];
  if (typeof guests === 'number' && Number.isInteger(guests) && guests >= 1) {
    return guests;
  }
  return 1;
}

/** Resolve a guest's display name from the row, then the outcome, else null. */
function readName(
  row: RsvpResponseRow,
  outcome: Record<string, unknown>,
): string | null {
  if (typeof row.guestName === 'string' && row.guestName.trim() !== '') {
    return row.guestName.trim();
  }
  const fromOutcome = outcome['guestName'];
  if (typeof fromOutcome === 'string' && fromOutcome.trim() !== '') {
    return fromOutcome.trim();
  }
  return null;
}

/**
 * Aggregate RSVP responses into the dashboard summary (Requirement 8.6).
 *
 * Pure and total: never throws on malformed rows (they surface as `"unknown"`
 * and are excluded from the headline counts). The headline invariant is
 * `coming + notComing <= totalResponses` and `totalPeople >= coming`.
 */
export function summariseRsvp(rows: readonly RsvpResponseRow[]): RsvpSummary {
  const guests: RsvpGuest[] = [];
  let coming = 0;
  let notComing = 0;
  let totalPeople = 0;

  for (const row of rows) {
    const outcome = asRecord(row.outcome);
    const decision = readDecision(outcome);
    const people = decision === 'yes' ? readPeople(outcome) : 0;

    if (decision === 'yes') {
      coming += 1;
      totalPeople += people;
    } else if (decision === 'no') {
      notComing += 1;
    }

    guests.push({
      guestName: readName(row, outcome),
      decision,
      people,
    });
  }

  return {
    coming,
    notComing,
    totalPeople,
    totalResponses: rows.length,
    guests,
  };
}
