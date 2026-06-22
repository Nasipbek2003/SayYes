/**
 * Tests for the event countdown logic (task 7.3, Template 3 / Requirement 8.1).
 *
 * The countdown maths is a pure module (the React component just ticks an
 * interval over it), so these tests drive {@link computeRemaining} /
 * {@link formatRemaining} directly with an injected `now`, matching the
 * project's node test env and pure-core split.
 *
 * **Validates: Requirements 8.1**
 */
import { describe, expect, it } from 'vitest';

import { computeRemaining, formatRemaining, pad2, parseTarget } from './countdownMath';

const NOW = Date.UTC(2025, 0, 1, 0, 0, 0); // 2025-01-01T00:00:00Z

describe('computeRemaining (Requirement 8.1)', () => {
  it('breaks the remaining time into days/hours/minutes/seconds', () => {
    const target = NOW + ((2 * 24 + 3) * 60 * 60 + 4 * 60 + 5) * 1000; // 2d 3h 4m 5s
    const r = computeRemaining(target, NOW);
    expect(r).toMatchObject({ days: 2, hours: 3, minutes: 4, seconds: 5, isPast: false });
    expect(r.totalMs).toBeGreaterThan(0);
  });

  it('clamps to zero and flags isPast once the target has passed', () => {
    const r = computeRemaining(NOW - 1000, NOW);
    expect(r).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isPast: true });
  });

  it('treats the exact target instant as past', () => {
    const r = computeRemaining(NOW, NOW);
    expect(r.isPast).toBe(true);
    expect(r.totalMs).toBe(0);
  });

  it('accepts Date, epoch number and ISO string targets', () => {
    const target = NOW + 60 * 1000; // +1 minute
    const fromNumber = computeRemaining(target, NOW);
    const fromDate = computeRemaining(new Date(target), NOW);
    const fromIso = computeRemaining(new Date(target).toISOString(), NOW);
    expect(fromNumber.seconds).toBe(0);
    expect(fromNumber.minutes).toBe(1);
    expect(fromDate).toEqual(fromNumber);
    expect(fromIso).toEqual(fromNumber);
  });

  it('falls back to isPast for an unparseable target', () => {
    expect(parseTarget('not-a-date')).toBeNull();
    const r = computeRemaining('not-a-date', NOW);
    expect(r.isPast).toBe(true);
  });
});

describe('formatRemaining / pad2', () => {
  it('pads time parts to two digits', () => {
    expect(pad2(7)).toBe('07');
    expect(pad2(0)).toBe('00');
    expect(pad2(42)).toBe('42');
  });

  it('omits days when zero and includes them otherwise', () => {
    const sameDay = computeRemaining(NOW + (3 * 60 * 60 + 5 * 60 + 9) * 1000, NOW);
    expect(formatRemaining(sameDay)).toBe('03:05:09');

    const multiDay = computeRemaining(NOW + (2 * 24 * 60 * 60 + 60) * 1000, NOW);
    expect(formatRemaining(multiDay)).toBe('2:00:01:00');
  });
});
