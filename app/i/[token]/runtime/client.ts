/**
 * Client-side API calls for the invitation runtime (task 7.4).
 *
 * Thin, framework-independent wrappers the {@link InvitationRuntime} uses to
 * talk to the public endpoints:
 *  - {@link postOpen} → `POST /api/i/:token/open` when the scenario starts
 *    (Requirement 9.1 — records the open; first open notifies the author later);
 *  - {@link postRespond} → `POST /api/i/:token/respond` with the guest's final
 *    {@link GuestResponse} (Requirement 5.5 server validation, 8.5 idempotent
 *    upsert).
 *
 * Kept out of the React component so the call shape is unit-testable and easy to
 * mock. Both calls are best-effort from the UI's perspective: a failed `open`
 * must not block the scenario, and `postRespond` reports success so the runtime
 * can decide whether to advance to the final screen.
 *
 * The public endpoints are rate-limited (task 11.2): when throttled they reply
 * `429`. These wrappers treat a `429` like any other non-OK response — never
 * throwing — so a throttle degrades gracefully (the guest is not shown a
 * technical error, Requirement 4.4) and surface a `rateLimited` flag so the
 * runtime can choose to retry/back off rather than mistake it for a rejection.
 */
import type { GuestResponse } from '@/templates/types';

/** HTTP status returned by the public endpoints when the limit is exceeded. */
const TOO_MANY_REQUESTS = 429;

/** Build the public API path for a token + action. */
function apiPath(token: string, action: 'open' | 'respond'): string {
  return `/api/i/${encodeURIComponent(token)}/${action}`;
}

/**
 * Record that the guest opened the invitation. Best-effort: network/HTTP
 * failures (including a `429` throttle) are swallowed (returns `false`) so a
 * failed open never blocks the scenario from starting.
 */
export async function postOpen(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(apiPath(token, 'open'), { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Result of submitting the guest's answer. */
export interface RespondResult {
  /** True when the server accepted and stored the answer. */
  ok: boolean;
  /** Per-field validation errors when the server rejected the answer (400). */
  errors?: unknown;
  /**
   * True when the request was throttled (`429`, task 11.2). Distinct from a
   * validation rejection: the answer was not seen, so the runtime may retry
   * after a short delay rather than treating it as a permanent failure.
   */
  rateLimited?: boolean;
}

/**
 * Submit the guest's final answer to the server, which validates it against the
 * template schema and upserts it idempotently. Returns `{ ok: true }` on
 * success; on a validation rejection returns `{ ok: false, errors }`; on a
 * `429` throttle returns `{ ok: false, rateLimited: true }`; on a network error
 * returns `{ ok: false }`. Never throws, so a throttle/outage degrades
 * gracefully for the guest (Requirement 4.4).
 */
export async function postRespond(
  token: string,
  response: GuestResponse,
  fetchImpl: typeof fetch = fetch,
): Promise<RespondResult> {
  try {
    const res = await fetchImpl(apiPath(token, 'respond'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(response),
    });
    if (res.ok) return { ok: true };
    if (res.status === TOO_MANY_REQUESTS) return { ok: false, rateLimited: true };
    let errors: unknown;
    try {
      const body = (await res.json()) as { errors?: unknown };
      errors = body?.errors;
    } catch {
      /* ignore non-JSON error bodies */
    }
    return { ok: false, errors };
  } catch {
    return { ok: false };
  }
}
