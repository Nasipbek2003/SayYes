/**
 * Rate-limiting wiring for the public invitation endpoints (task 11.2).
 *
 * Ties the generic {@link RateLimiter} to the two public, unauthenticated Route
 * Handlers — `POST /api/i/:token/open` and `POST /api/i/:token/respond` — by
 * deriving a per-(token + client IP) key and producing the graceful `429`
 * response the runtime client tolerates. Keeping this here (not in the handlers)
 * keeps the key/IP logic in one tested place and lets both routes share a single
 * limiter instance per action.
 *
 * Limits are deliberately generous: a real guest opens a link a handful of times
 * and answers once, so legitimate use never trips the limit, while scripted
 * abuse against a single token from one source is throttled. The per-process
 * in-memory store caveat from {@link RateLimiter} applies — swap in a shared
 * store for multi-instance deploys.
 */
import {
  RateLimiter,
  type RateLimitConfig,
  type RateLimitResult,
} from './rateLimiter';

/** Action being limited; each gets its own counter namespace + policy. */
export type PublicAction = 'open' | 'respond';

/** Per-action fixed-window policies. */
export const PUBLIC_RATE_LIMITS: Record<PublicAction, RateLimitConfig> = {
  // Opens are cheap and a guest may legitimately reload a few times.
  open: { limit: 30, windowMs: 60_000 },
  // Answers are rarer; throttle harder to blunt response spam.
  respond: { limit: 15, windowMs: 60_000 },
};

/**
 * Derive the client IP from proxy headers, falling back to a constant when none
 * is present (e.g. local/dev). `x-forwarded-for` may be a comma-separated list
 * (`client, proxy1, proxy2`); the left-most entry is the originating client.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  return 'unknown';
}

/** Build the limiter key: action-namespaced, scoped to token + client IP. */
export function rateLimitKey(
  action: PublicAction,
  token: string,
  ip: string,
): string {
  return `${action}:${token}:${ip}`;
}

// One shared limiter per action, holding the process-local counters.
const limiters: Record<PublicAction, RateLimiter> = {
  open: new RateLimiter(PUBLIC_RATE_LIMITS.open),
  respond: new RateLimiter(PUBLIC_RATE_LIMITS.respond),
};

/**
 * Apply rate limiting for a public request. Returns the verdict and a ready-made
 * `429` {@link Response} when the limit is exceeded (otherwise `response` is
 * `null` and the caller proceeds). The `Retry-After` header (whole seconds, per
 * RFC 7231) tells well-behaved clients when to retry; the JSON body lets the
 * runtime client recognise the throttle and degrade gracefully instead of
 * surfacing a technical error to the guest (Requirement 4.4).
 */
export function enforcePublicRateLimit(
  action: PublicAction,
  token: string,
  headers: Headers,
): { result: RateLimitResult; response: Response | null } {
  const ip = clientIpFromHeaders(headers);
  const result = limiters[action].check(rateLimitKey(action, token, ip));

  if (result.allowed) {
    return { result, response: null };
  }

  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
  const response = Response.json(
    { error: 'Too many requests', reason: 'rate_limited' },
    {
      status: 429,
      headers: { 'retry-after': String(retryAfterSec) },
    },
  );
  return { result, response };
}
