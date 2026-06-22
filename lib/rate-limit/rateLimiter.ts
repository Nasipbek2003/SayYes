/**
 * Fixed-window rate limiter for the public invitation endpoints (task 11.2).
 *
 * The public `open` / `respond` endpoints carry no author session — the
 * unguessable token in the URL is the only capability — so they are the natural
 * target for abuse (scripted hammering, scraping, response spam). This module
 * holds the **pure decision logic** (a per-key counter inside a time window and
 * the allow/deny verdict) separated from any I/O, exactly like the outbox
 * `backoff` helper, so it can be unit-tested deterministically by injecting the
 * clock.
 *
 * ## Window model
 * A simple **fixed window**: the first request for a key opens a window of
 * `windowMs` and starts a counter. Subsequent requests in the same window
 * increment it; once the counter exceeds `limit` they are denied. When the
 * window's `resetAt` passes, the next request opens a fresh window (the counter
 * resets). Fixed windows are cheap and predictable — enough for MVP abuse
 * protection — at the cost of allowing up to `2 * limit` requests across a
 * window boundary, which is acceptable here.
 *
 * ## Storage abstraction (serverless caveat)
 * State lives behind the {@link RateLimiterStore} interface. The bundled
 * {@link InMemoryRateLimiterStore} keeps counters in a process-local `Map`,
 * which is correct for a single long-lived Node process but **does not share
 * state across serverless instances / lambdas** — each cold instance starts
 * empty, so the effective limit scales with the number of instances. For
 * production multi-instance deploys, swap in a Redis-backed store implementing
 * the same interface (e.g. `INCR` + `PEXPIRE`); no caller code changes.
 */

/** Tunable fixed-window policy. */
export interface RateLimitConfig {
  /** Maximum number of allowed requests per key within `windowMs`. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Verdict for a single request. */
export interface RateLimitResult {
  /** True when the request is within the limit and should be served. */
  allowed: boolean;
  /** Requests still allowed in the current window (never negative). */
  remaining: number;
  /** Epoch-ms timestamp when the current window resets. */
  resetAt: number;
  /** Milliseconds the caller should wait before retrying (0 when allowed). */
  retryAfterMs: number;
}

/** Per-key counter state stored between requests. */
export interface WindowState {
  /** Requests counted in the current window. */
  count: number;
  /** Epoch-ms timestamp when this window ends and the counter resets. */
  resetAt: number;
}

/**
 * Pure fixed-window decision.
 *
 * Given the previous {@link WindowState} for a key (or `undefined` for a key
 * seen for the first time), the current time `now`, and the policy, returns the
 * next state to persist and the verdict. No clocks, no storage — fully
 * deterministic and unit-testable.
 *
 * A new window is opened when there is no prior state or the prior window has
 * expired (`now >= state.resetAt`). The request is allowed while the resulting
 * count is `<= limit`.
 */
export function evaluateWindow(
  state: WindowState | undefined,
  now: number,
  config: RateLimitConfig,
): { state: WindowState; result: RateLimitResult } {
  const windowActive = state !== undefined && now < state.resetAt;

  const next: WindowState = windowActive
    ? { count: state!.count + 1, resetAt: state!.resetAt }
    : { count: 1, resetAt: now + config.windowMs };

  const allowed = next.count <= config.limit;
  const remaining = Math.max(0, config.limit - next.count);
  const retryAfterMs = allowed ? 0 : Math.max(0, next.resetAt - now);

  return {
    state: next,
    result: { allowed, remaining, resetAt: next.resetAt, retryAfterMs },
  };
}

/**
 * Storage backend for window counters. The in-memory implementation is
 * provided below; a Redis-backed one can be dropped in for multi-instance
 * deploys without touching {@link RateLimiter} or its callers.
 */
export interface RateLimiterStore {
  get(key: string): WindowState | undefined;
  set(key: string, state: WindowState): void;
}

/**
 * Process-local {@link RateLimiterStore} backed by a `Map`.
 *
 * Whether a stored window has expired is decided by {@link evaluateWindow} using
 * the limiter's clock, so this store must **not** apply its own expiry on read —
 * doing so with a divergent clock (e.g. an injected test clock vs `Date.now`)
 * would silently reset counters. Memory is bounded instead by an opportunistic
 * sweep on `set`: when the map grows past a threshold, entries whose window has
 * already ended (by wall-clock time, which is correct for real usage) are
 * dropped so a flood of one-off keys cannot leak unbounded. See the serverless
 * caveat in the module docs: this store is per-process only.
 */
export class InMemoryRateLimiterStore implements RateLimiterStore {
  private readonly map = new Map<string, WindowState>();

  /** Map size at which a full sweep of expired entries is triggered. */
  private readonly sweepThreshold: number;

  constructor(sweepThreshold = 10_000) {
    this.sweepThreshold = sweepThreshold;
  }

  get(key: string): WindowState | undefined {
    return this.map.get(key);
  }

  set(key: string, state: WindowState): void {
    if (this.map.size >= this.sweepThreshold) {
      this.sweepExpired();
    }
    this.map.set(key, state);
  }

  /** Drop every entry whose window has already ended (wall-clock). */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, state] of this.map) {
      if (now >= state.resetAt) {
        this.map.delete(key);
      }
    }
  }
}

/**
 * Stateful rate limiter tying a {@link RateLimiterStore}, a {@link RateLimitConfig}
 * and a clock together. `check(key)` reads the current window state, applies the
 * pure {@link evaluateWindow} decision, persists the new state and returns the
 * verdict. The clock is injectable for deterministic tests.
 */
export class RateLimiter {
  constructor(
    private readonly config: RateLimitConfig,
    private readonly store: RateLimiterStore = new InMemoryRateLimiterStore(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Count one request against `key` and return whether it is allowed. */
  check(key: string): RateLimitResult {
    const { state, result } = evaluateWindow(
      this.store.get(key),
      this.now(),
      this.config,
    );
    this.store.set(key, state);
    return result;
  }
}
