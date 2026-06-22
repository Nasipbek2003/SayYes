/**
 * Tests for the fixed-window rate limiter (task 11.2).
 *
 * Covers the pure {@link evaluateWindow} decision (allow up to `limit`, deny
 * beyond it, reset after the window), the stateful {@link RateLimiter} with an
 * injected clock, and the {@link InMemoryRateLimiterStore} lazy expiry. Includes
 * a property-based check that across any sequence of calls within one window at
 * most `limit` are ever allowed.
 *
 * **Validates: Requirements 4.4**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  InMemoryRateLimiterStore,
  RateLimiter,
  evaluateWindow,
  type RateLimitConfig,
} from './rateLimiter';

const CONFIG: RateLimitConfig = { limit: 3, windowMs: 1000 };

describe('evaluateWindow', () => {
  it('opens a fresh window on first sight of a key', () => {
    const { state, result } = evaluateWindow(undefined, 100, CONFIG);
    expect(state).toEqual({ count: 1, resetAt: 1100 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.retryAfterMs).toBe(0);
  });

  it('allows exactly `limit` requests within a window then denies', () => {
    let state = evaluateWindow(undefined, 0, CONFIG).state; // count 1
    let result = evaluateWindow(state, 10, CONFIG); // count 2
    state = result.state;
    expect(result.result.allowed).toBe(true);
    result = evaluateWindow(state, 20, CONFIG); // count 3 (== limit)
    state = result.state;
    expect(result.result.allowed).toBe(true);
    expect(result.result.remaining).toBe(0);
    result = evaluateWindow(state, 30, CONFIG); // count 4 (> limit)
    expect(result.result.allowed).toBe(false);
    expect(result.result.retryAfterMs).toBe(1000 - 30);
  });

  it('resets the counter once the window has elapsed', () => {
    const first = evaluateWindow(undefined, 0, CONFIG).state; // resetAt 1000
    // A request at/after resetAt opens a brand-new window.
    const { state, result } = evaluateWindow(first, 1000, CONFIG);
    expect(state).toEqual({ count: 1, resetAt: 2000 });
    expect(result.allowed).toBe(true);
  });
});

describe('RateLimiter', () => {
  it('allows N requests in a window and blocks the rest (same key)', () => {
    const now = 0;
    const limiter = new RateLimiter(CONFIG, new InMemoryRateLimiterStore(), () => now);

    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    const blocked = limiter.check('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const now = 0;
    const limiter = new RateLimiter(CONFIG, new InMemoryRateLimiterStore(), () => now);
    limiter.check('a');
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    // A different key has its own fresh budget.
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('lets requests through again after the window elapses', () => {
    let now = 0;
    const limiter = new RateLimiter(CONFIG, new InMemoryRateLimiterStore(), () => now);
    limiter.check('k');
    limiter.check('k');
    limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);

    now = 1000; // window elapsed
    expect(limiter.check('k').allowed).toBe(true);
  });
});

describe('InMemoryRateLimiterStore', () => {
  it('returns stored state verbatim (expiry is decided by evaluateWindow)', () => {
    const store = new InMemoryRateLimiterStore();
    const expired = { count: 5, resetAt: Date.now() - 1 };
    store.set('k', expired);
    // The store does not second-guess the limiter's clock on read.
    expect(store.get('k')).toEqual(expired);
  });

  it('sweeps expired entries on set once past the size threshold', () => {
    const store = new InMemoryRateLimiterStore(2);
    store.set('old', { count: 1, resetAt: Date.now() - 1 }); // already expired
    store.set('live', { count: 1, resetAt: Date.now() + 60_000 });
    // Now size == threshold; the next set triggers a sweep of expired entries.
    store.set('new', { count: 1, resetAt: Date.now() + 60_000 });
    expect(store.get('old')).toBeUndefined();
    expect(store.get('live')).toBeDefined();
    expect(store.get('new')).toBeDefined();
  });
});

describe('RateLimiter — within-window bound (property)', () => {
  it('never allows more than `limit` requests inside a single window', () => {
    fc.assert(
      fc.property(
        fc.record({ limit: fc.integer({ min: 1, max: 20 }), windowMs: fc.integer({ min: 10, max: 10_000 }) }),
        // Offsets strictly inside one window (0 <= t < windowMs).
        fc.array(fc.nat(), { minLength: 0, maxLength: 100 }),
        (config, rawOffsets) => {
          const offsets = rawOffsets.map((o) => o % config.windowMs);
          // Apply in time order so each lands in the same first window.
          offsets.sort((a, b) => a - b);
          let now = 0;
          const limiter = new RateLimiter(config, new InMemoryRateLimiterStore(), () => now);
          let allowedCount = 0;
          for (const t of offsets) {
            now = t;
            if (limiter.check('key').allowed) allowedCount++;
          }
          expect(allowedCount).toBeLessThanOrEqual(config.limit);
        },
      ),
    );
  });
});
