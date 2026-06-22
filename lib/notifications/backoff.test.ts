/**
 * Tests for the pure retry / backoff decision logic (task 9.2).
 *
 * Covers {@link backoffDelayMs} (exponential growth, clamped to maxDelayMs) and
 * {@link hasExhaustedRetries} (the retry-budget boundary that decides retry vs.
 * permanent FAILED). Includes a property-based check that the delay is always
 * within the allowed bounds and non-decreasing.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  DEFAULT_RETRY_POLICY,
  backoffDelayMs,
  hasExhaustedRetries,
  type RetryPolicy,
} from './backoff';

describe('backoffDelayMs', () => {
  it('grows exponentially from the base delay', () => {
    const policy: RetryPolicy = { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 1e9 };
    expect(backoffDelayMs(1, policy)).toBe(1000); // 1000 * 2^0
    expect(backoffDelayMs(2, policy)).toBe(2000); // 1000 * 2^1
    expect(backoffDelayMs(3, policy)).toBe(4000); // 1000 * 2^2
    expect(backoffDelayMs(4, policy)).toBe(8000); // 1000 * 2^3
  });

  it('clamps the delay to maxDelayMs', () => {
    const policy: RetryPolicy = { maxAttempts: 100, baseDelayMs: 1000, maxDelayMs: 5000 };
    expect(backoffDelayMs(10, policy)).toBe(5000);
  });

  it('returns 0 for non-positive attempt counts', () => {
    expect(backoffDelayMs(0)).toBe(0);
    expect(backoffDelayMs(-3)).toBe(0);
  });
});

describe('hasExhaustedRetries', () => {
  it('allows retries while under the attempt limit', () => {
    // Default maxAttempts = 5: after 0..3 failures, the next attempt is allowed.
    expect(hasExhaustedRetries(0)).toBe(false);
    expect(hasExhaustedRetries(3)).toBe(false);
  });

  it('is exhausted once the next attempt would reach the limit', () => {
    // After 4 failed attempts, the 5th would meet maxAttempts → exhausted.
    expect(hasExhaustedRetries(4)).toBe(true);
    expect(hasExhaustedRetries(5)).toBe(true);
  });
});

describe('backoffDelayMs — bounds (property)', () => {
  it('always stays within [0, maxDelayMs] and is non-decreasing', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (attempts) => {
        const d1 = backoffDelayMs(attempts, DEFAULT_RETRY_POLICY);
        const d2 = backoffDelayMs(attempts + 1, DEFAULT_RETRY_POLICY);
        expect(d1).toBeGreaterThanOrEqual(0);
        expect(d1).toBeLessThanOrEqual(DEFAULT_RETRY_POLICY.maxDelayMs);
        expect(d2).toBeGreaterThanOrEqual(d1);
      }),
    );
  });
});
