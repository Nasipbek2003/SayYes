/**
 * POST /api/i/:token/respond — record a guest's final answer (task 7.4,
 * Requirements 5.5 / 5.7 / 8.5).
 *
 * Auth: **public** (the token in the URL is the capability). A candidate for
 * rate-limiting (task 11.2).
 *
 * Body: a {@link GuestResponse} JSON object, e.g.
 *   { "type": "accepted", "place": "Парк", "time": "19:00" }   // story-fork
 *   { "type": "rsvp", "guestName": "Аиша", "rsvp": "yes", "guests": 2 }
 *
 * Delegates to {@link InvitationService.recordResponse}, which:
 *  - **validates the answer on the server** against the template schema and the
 *    author's data (Property 5, Requirement 5.5) — the server never trusts the
 *    client. An answer that does not match the schema (unknown place, wrong
 *    type, missing RSVP fields) is rejected with 400 and the per-field errors,
 *    and nothing is persisted;
 *  - **upserts idempotently** by `(invitationId, guestKey)` (Property 3,
 *    Requirement 8.5): answering again updates the existing row instead of
 *    duplicating it. This is what lets a repeat open render the "уже отвечено"
 *    final screen (Requirement 5.7) — the stored answer is the source of truth.
 *
 * The author notification with the answer details (outbox, task 9.x) is out of
 * scope here; recording the answer and its idempotency/validation is task 7.4.
 *
 * Status codes:
 *  - 200 `{ ok, updated }` — answer stored (`updated` true on a repeat);
 *  - 400 — invalid JSON body, or a schema-invalid answer (`{ errors }`);
 *  - 404 — link unavailable (`{ reason }`), shown gracefully (Requirement 4.4).
 */
import { enforcePublicRateLimit } from '@/lib/rate-limit/publicEndpoints';
import {
  InvitationUnavailableError,
  ResponseValidationError,
  invitationService,
} from '@/lib/services/invitation';
import { outboxWorker } from '@/lib/notifications/outboxWorker';
import { logger } from '@/lib/logger';
import type { GuestResponse } from '@/templates/types';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  // Public, unauthenticated endpoint — throttle response spam per token +
  // client IP (task 11.2). A 429 is handled gracefully by the runtime client
  // (Req 4.4), which keeps the guest on the scenario instead of erroring.
  const { response: limited } = enforcePublicRateLimit(
    'respond',
    token,
    request.headers,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json(
      { error: '`response` must be an object.' },
      { status: 400 },
    );
  }

  try {
    const { updated } = await invitationService.recordResponse(
      token,
      body as GuestResponse,
    );

    // Best-effort: deliver the just-enqueued author notification immediately so
    // it doesn't wait for the next cron run. Delivery failures must never fail
    // the guest's response — the row stays PENDING and the cron retries it.
    try {
      await outboxWorker.processPending();
    } catch (deliveryError) {
      logger.warn('outbox-delivery-after-respond-failed', {
        error:
          deliveryError instanceof Error
            ? deliveryError.message
            : String(deliveryError),
      });
    }

    return Response.json({ ok: true, updated }, { status: 200 });
  } catch (error) {
    if (error instanceof ResponseValidationError) {
      return Response.json(
        { error: 'Invalid response', errors: error.errors },
        { status: 400 },
      );
    }
    if (error instanceof InvitationUnavailableError) {
      return Response.json(
        { error: 'Invitation unavailable', reason: error.reason },
        { status: 404 },
      );
    }
    throw error;
  }
}
