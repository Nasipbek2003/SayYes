/**
 * Pure retry / backoff logic for the outbox worker (task 9.2).
 *
 * These functions hold the *decision* logic — how long to wait between
 * attempts, and whether a row should be retried or marked permanently FAILED —
 * separated from the I/O (DB + Telegram) so they can be unit-tested in
 * isolation (design §8: "ретраи с экспоненциальным backoff; при превышении
 * попыток — пометка failed").
 */

/** Tunable retry policy for outbox delivery. */
export interface RetryPolicy {
  /** Maximum number of delivery attempts before a row is marked FAILED. */
  maxAttempts: number;
  /** Base delay (ms) for the first retry. */
  baseDelayMs: number;
  /** Cap on the computed delay (ms) so backoff doesn't grow unbounded. */
  maxDelayMs: number;
}

/** Default policy: up to 5 attempts, exponential from 1s, capped at 5 min. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 5 * 60_000,
};

/**
 * Exponential backoff delay (ms) before the retry that follows `attempts`
 * failed attempts. `attempts` is the number of attempts already made (1 after
 * the first failure). The delay doubles each attempt — `base * 2^(attempts-1)`
 * — clamped to `[0, maxDelayMs]`.
 */
export function backoffDelayMs(
  attempts: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  if (attempts <= 0) return 0;
  const raw = policy.baseDelayMs * 2 ** (attempts - 1);
  return Math.min(raw, policy.maxDelayMs);
}

/**
 * Decide whether a row with `attempts` already-failed attempts has exhausted
 * its retry budget. Returns `true` once the next attempt would meet or exceed
 * `maxAttempts` — i.e. the row should be marked FAILED instead of retried.
 */
export function hasExhaustedRetries(
  attempts: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  return attempts + 1 >= policy.maxAttempts;
}
