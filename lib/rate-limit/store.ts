/**
 * Rate-limiter store selection (fixes the serverless caveat in `rateLimiter`).
 *
 * The public `open` / `respond` limiter needs a store that is **shared across
 * instances** on a serverless platform (Vercel), otherwise each cold lambda
 * starts with an empty counter and the effective limit multiplies by the number
 * of instances. This module provides:
 *
 *  - {@link UpstashRedisStore} — an {@link AsyncRateLimiterStore} backed by
 *    Upstash Redis over its REST API (works on the Edge/serverless, no TCP
 *    socket, no SDK). Counters live in Redis with a TTL equal to the window, so
 *    the limit is enforced globally and keys expire on their own.
 *  - {@link MemoryAsyncStore} — an async adapter over the process-local
 *    `Map`-based store, used as a graceful fallback when Upstash is not
 *    configured (local dev, single long-lived process).
 *  - {@link createRateLimiterStore} — picks Redis when
 *    `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, else memory.
 *
 * Callers depend only on {@link AsyncRateLimiterStore}, so switching backends
 * requires no changes to the limiter or the routes.
 */
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

import {
  InMemoryRateLimiterStore,
  type AsyncRateLimiterStore,
  type WindowState,
} from './rateLimiter';

/** Async adapter over the process-local in-memory store. */
export class MemoryAsyncStore implements AsyncRateLimiterStore {
  private readonly inner = new InMemoryRateLimiterStore();

  async get(key: string): Promise<WindowState | undefined> {
    return this.inner.get(key);
  }

  async set(key: string, state: WindowState): Promise<void> {
    this.inner.set(key, state);
  }
}

/**
 * Upstash Redis REST store. Serialises {@link WindowState} as JSON and sets it
 * with a millisecond TTL (`PX`) so counters expire with their window. Commands
 * are sent as a JSON array in the POST body (handles arbitrary value chars).
 *
 * Failures are swallowed (logged) and treated as "no prior state" so a Redis
 * outage fails **open** — availability of the public invitation flow is more
 * important than perfect throttling. This is a deliberate trade-off for MVP.
 */
export class UpstashRedisStore implements AsyncRateLimiterStore {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
  ) {}

  private async command<T>(args: (string | number)[]): Promise<T | null> {
    try {
      const res = await fetch(this.restUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.restToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        logger.warn('rate-limit-redis-command-failed', { status: res.status });
        return null;
      }
      const body = (await res.json()) as { result?: T };
      return body.result ?? null;
    } catch (error) {
      logger.warn('rate-limit-redis-unreachable', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async get(key: string): Promise<WindowState | undefined> {
    const raw = await this.command<string>(['GET', key]);
    if (typeof raw !== 'string') return undefined;
    try {
      const parsed = JSON.parse(raw) as WindowState;
      if (
        typeof parsed?.count === 'number' &&
        typeof parsed?.resetAt === 'number'
      ) {
        return parsed;
      }
    } catch {
      /* corrupt value — treat as no state */
    }
    return undefined;
  }

  async set(key: string, state: WindowState, ttlMs: number): Promise<void> {
    await this.command(['SET', key, JSON.stringify(state), 'PX', ttlMs]);
  }
}

/**
 * Resolve the {@link AsyncRateLimiterStore} for public rate limiting: Upstash
 * Redis when configured (correct for multi-instance serverless), else the
 * in-memory fallback. Logged once at selection so the active backend is visible.
 */
export function createRateLimiterStore(): AsyncRateLimiterStore {
  const { restUrl, restToken } = env.upstash;
  if (restUrl && restToken) {
    return new UpstashRedisStore(restUrl, restToken);
  }
  return new MemoryAsyncStore();
}
