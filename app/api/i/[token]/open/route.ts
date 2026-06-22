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
 * Graceful failures (Requirement 4.4, Property 7): an unknown / not-yet-active /
 * expired link maps to a 404 with a machine-readable `reason` instead of a 500,
 * so the public client can show the "ссылка недоступна" screen. The request
 * body is ignored; only the `User-Agent` header is recorded (for the author's
 * cabinet).
 */
import { enforcePublicRateLimit } from '@/lib/rate-limit/publicEndpoints';
import {
  InvitationUnavailableError,
  invitationService,
} from '@/lib/services/invitation';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  // Public, unauthenticated endpoint — throttle abuse per token + client IP
  // (task 11.2). A 429 is handled gracefully by the runtime client (Req 4.4).
  const { response: limited } = enforcePublicRateLimit(
    'open',
    token,
    _request.headers,
  );
  if (limited) return limited;

  const userAgent = _request.headers.get('user-agent');

  try {
    const { firstOpen } = await invitationService.recordOpen(token, userAgent);
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
