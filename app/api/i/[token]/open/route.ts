/**
 * POST /api/i/:token/open — record that a guest opened the invitation link
 * (task 7.4, Requirement 9.1).
 *
 * Auth: **public** (no author session). The link itself — an unguessable token
 * in the URL — is the capability; the page a guest opens from a messenger calls
 * this when the scenario starts. Because it is public it is a candidate for
 * rate-limiting (task 11.2); the detailed limiter lives there.
 *
 * Behaviour (delegates to {@link InvitationService.recordOpen}):
 *  - resolves the invitation by token and appends an `OpenEvent`;
 *  - reports whether this was the *first* open — the first open is what later
 *    triggers the author's "приглашение открыли" notification (outbox, task
 *    9.x). The notification wiring is intentionally out of scope here.
 *
 * **Author's own views are ignored.** When the request carries the session
 * cookie of the invitation's own author (e.g. the author checks the link right
 * after paying), nothing is recorded and no notification is enqueued: the
 * "ссылку открыли" signal must mean *the recipient* opened it. The session is
 * read straight from the request's `Cookie` header (no `next/headers`), so the
 * endpoint stays public and usable from any context.
 *
 * Graceful failures (Requirement 4.4, Property 7): an unknown / not-yet-active /
 * expired link maps to a 404 with a machine-readable `reason` instead of a 500,
 * so the public client can show the "ссылка недоступна" screen. The request
 * body is ignored; only the `User-Agent` header is recorded (for the author's
 * cabinet).
 */
import { getAuthorIdFromCookie } from '@/lib/auth/guards';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { invitationRepo } from '@/lib/repositories';
import { enforcePublicRateLimit } from '@/lib/rate-limit/publicEndpoints';
import {
  InvitationUnavailableError,
  invitationService,
} from '@/lib/services/invitation';
import { outboxWorker } from '@/lib/notifications/outboxWorker';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  // Public, unauthenticated endpoint — throttle abuse per token + client IP
  // (task 11.2). A 429 is handled gracefully by the runtime client (Req 4.4).
  const { response: limited } = await enforcePublicRateLimit(
    'open',
    token,
    _request.headers,
  );
  if (limited) return limited;

  const userAgent = _request.headers.get('user-agent');

  // Свой просмотр автора не считается открытием: ни события, ни уведомления.
  if (await isOwnAuthorView(_request, token)) {
    return Response.json(
      { ok: true, firstOpen: false, skipped: 'author' },
      { status: 200 },
    );
  }

  try {
    const { firstOpen } = await invitationService.recordOpen(token, userAgent);

    // Funnel: count the first open of a link (conversion analytics, gap #5).
    if (firstOpen) track('invitation_opened', { token });

    // Best-effort immediate delivery of the just-enqueued notification (only
    // the first open enqueues one). Never fail the public request on a delivery
    // error — the row stays PENDING and the cron retries it.
    try {
      await outboxWorker.processPending();
    } catch (deliveryError) {
      logger.warn('outbox-delivery-after-open-failed', {
        error:
          deliveryError instanceof Error
            ? deliveryError.message
            : String(deliveryError),
      });
    }

    return Response.json({ ok: true, firstOpen }, { status: 200 });
  } catch (error) {
    if (error instanceof InvitationUnavailableError) {
      return Response.json(
        { error: 'Invitation unavailable', reason: error.reason },
        { status: 404 },
      );
    }
    throw error;
  }
}

/** Read the session cookie value out of a raw `Cookie` header. */
function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/**
 * True when the request comes from the invitation's own author (signed-in in
 * the same browser). Any failure resolves to `false` — a doubtful case is
 * treated as a normal guest open, never a dropped signal.
 */
async function isOwnAuthorView(request: Request, token: string): Promise<boolean> {
  try {
    const cookie = readSessionCookie(request);
    if (!cookie) return false;
    const authorId = await getAuthorIdFromCookie(cookie);
    if (!authorId) return false;
    const invitation = await invitationRepo.findByToken(token);
    return invitation?.authorId === authorId;
  } catch (error) {
    logger.warn('open-author-check-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
