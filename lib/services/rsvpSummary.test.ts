/**
 * Tests for {@link summariseRsvp} (task 10.3, Requirement 8.6).
 *
 * The aggregation is a pure function over the stored response rows, so these
 * tests exercise it directly with in-memory rows (no Prisma/HTTP). They cover:
 *  - the headline totals (придёт / не придёт / всего человек), including the
 *    party-size (+N) summation for attending guests;
 *  - malformed/legacy rows surfacing as "unknown" without crashing;
 *  - a fast-check property asserting the counting invariants hold for any list.
 *
 * **Validates: Requirements 8.6**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { summariseRsvp, type RsvpResponseRow } from './rsvpSummary';

describe('summariseRsvp (example-based)', () => {
  it('counts coming / not coming and sums party sizes', () => {
    const rows: RsvpResponseRow[] = [
      { guestName: 'Аиша', outcome: { type: 'rsvp', rsvp: 'yes', guests: 2 } },
      { guestName: 'Бек', outcome: { type: 'rsvp', rsvp: 'no' } },
      { guestName: 'Дана', outcome: { type: 'rsvp', rsvp: 'yes' } }, // no party size → 1
    ];

    const summary = summariseRsvp(rows);

    expect(summary.coming).toBe(2);
    expect(summary.notComing).toBe(1);
    expect(summary.totalPeople).toBe(3); // 2 + 1
    expect(summary.totalResponses).toBe(3);
    expect(summary.guests).toHaveLength(3);
  });

  it('defaults an attending guest with no/invalid party size to one person', () => {
    const rows: RsvpResponseRow[] = [
      { guestName: 'A', outcome: { type: 'rsvp', rsvp: 'yes', guests: 0 } },
      { guestName: 'B', outcome: { type: 'rsvp', rsvp: 'yes', guests: -3 } },
      { guestName: 'C', outcome: { type: 'rsvp', rsvp: 'yes', guests: 2.5 } },
    ];

    const summary = summariseRsvp(rows);

    expect(summary.coming).toBe(3);
    expect(summary.totalPeople).toBe(3); // each falls back to 1
  });

  it('falls back to the outcome guestName and marks malformed rows as unknown', () => {
    const rows: RsvpResponseRow[] = [
      { guestName: null, outcome: { type: 'rsvp', rsvp: 'yes', guestName: 'Гость' } },
      { guestName: '  ', outcome: { type: 'rsvp', rsvp: 'maybe' } },
      { guestName: 'X', outcome: 'not-an-object' },
    ];

    const summary = summariseRsvp(rows);

    expect(summary.guests[0]).toMatchObject({ guestName: 'Гость', decision: 'yes' });
    expect(summary.guests[1]).toMatchObject({ guestName: null, decision: 'unknown' });
    expect(summary.guests[2]).toMatchObject({ guestName: 'X', decision: 'unknown' });
    // Only the first row counts toward the headline figures.
    expect(summary.coming).toBe(1);
    expect(summary.notComing).toBe(0);
    expect(summary.totalPeople).toBe(1);
  });

  it('returns zeroed totals for an empty list', () => {
    expect(summariseRsvp([])).toEqual({
      coming: 0,
      notComing: 0,
      totalPeople: 0,
      totalResponses: 0,
      guests: [],
    });
  });
});

describe('summariseRsvp (property-based)', () => {
  it('keeps the counting invariants for any list of responses', () => {
    const rsvpArb = fc.record({
      rsvp: fc.constantFrom('yes', 'no', 'maybe', undefined),
      guests: fc.option(fc.integer({ min: -5, max: 20 }), { nil: undefined }),
    });
    const rowArb: fc.Arbitrary<RsvpResponseRow> = fc.record({
      guestName: fc.option(fc.string(), { nil: null }),
      outcome: rsvpArb.map((o) => ({ type: 'rsvp', ...o })),
    });

    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const summary = summariseRsvp(rows);

        // Per-guest list mirrors the input length.
        expect(summary.guests).toHaveLength(rows.length);
        expect(summary.totalResponses).toBe(rows.length);

        // coming/notComing never exceed the total, and are disjoint.
        expect(summary.coming + summary.notComing).toBeLessThanOrEqual(rows.length);

        // Each attending guest contributes at least one person.
        expect(summary.totalPeople).toBeGreaterThanOrEqual(summary.coming);

        // totalPeople equals the sum of attending guests' people.
        const sum = summary.guests
          .filter((g) => g.decision === 'yes')
          .reduce((acc, g) => acc + g.people, 0);
        expect(summary.totalPeople).toBe(sum);

        // Non-attending guests contribute zero people.
        for (const guest of summary.guests) {
          if (guest.decision !== 'yes') expect(guest.people).toBe(0);
          else expect(guest.people).toBeGreaterThanOrEqual(1);
        }
      }),
    );
  });
});
