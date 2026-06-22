/**
 * Tests for the floating-hearts layout helper (task 7.3).
 *
 * The randomised layout is produced by the pure {@link buildHearts} helper (the
 * component only renders it), so these tests drive the helper directly with an
 * injected RNG, matching the project's node test env. They verify the count and
 * that every heart's randomised values land in their intended ranges.
 */
import { describe, expect, it } from 'vitest';

import { buildHearts } from './FloatingHearts';

/** Deterministic RNG cycling through given values. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('buildHearts', () => {
  it('builds the requested number of hearts with unique ids', () => {
    const hearts = buildHearts(10, seqRng([0.5]));
    expect(hearts).toHaveLength(10);
    expect(new Set(hearts.map((h) => h.id)).size).toBe(10);
  });

  it('returns no hearts for non-positive counts', () => {
    expect(buildHearts(0, seqRng([0.5]))).toHaveLength(0);
    expect(buildHearts(-3, seqRng([0.5]))).toHaveLength(0);
  });

  it('keeps every heart within its intended ranges', () => {
    const hearts = buildHearts(50);
    for (const h of hearts) {
      expect(h.leftPct).toBeGreaterThanOrEqual(0);
      expect(h.leftPct).toBeLessThanOrEqual(100);
      expect(h.sizeRem).toBeGreaterThanOrEqual(1);
      expect(h.sizeRem).toBeLessThanOrEqual(2.5);
      expect(h.durationSec).toBeGreaterThanOrEqual(6);
      expect(h.durationSec).toBeLessThanOrEqual(12);
      // Hearts start mid-flight, so delays are negative.
      expect(h.delaySec).toBeLessThanOrEqual(0);
      expect(h.delaySec).toBeGreaterThanOrEqual(-8);
    }
  });
});
