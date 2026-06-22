/**
 * POST /api/invitations/:id/checkout — start a payment checkout (task 5.1).
 *
 * Auth: author (401 when no session). Ownership enforced (403 for someone
 * else's invitation, Requirement 10.4); unknown id → 404; checking out a
 * non-DRAFT invitation → 409.
 *
 * Body: { tier: 'basic' | 'premium' }
 *
 * Delegates to {@link PaymentService.startCheckout}, which records the chosen
 * tier, creates a PENDING {@link Payment} with the provider session id, moves
 * the invitation to `PENDING_PAYMENT` and returns the hosted checkout URL the
 * author is redirected to (Requirement 3.1/3.2). On success returns 200 with
 * `{ checkoutUrl }`.
 *
 * Webhook verification / activation is out of scope here (task 5.2).
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import {
  PaymentServiceError,
  paymentService,
  parseTier,
} from '@/lib/services/payment';

export const runtime = 'nodejs';

interface CheckoutBody {
  tier?: unknown;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { id } = await context.params;

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tier = parseTier(body?.tier);
  if (tier === null) {
    return Response.json(
      { error: "`tier` must be 'basic' or 'premium'." },
      { status: 400 },
    );
  }

  try {
    const checkoutUrl = await paymentService.startCheckout(id, authorId, tier);
    return Response.json({ checkoutUrl }, { status: 200 });
  } catch (error) {
    return paymentErrorToResponse(error);
  }
}

/** Map a {@link PaymentServiceError} (or auth error) to a JSON Response. */
function paymentErrorToResponse(error: unknown): Response {
  if (error instanceof PaymentServiceError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return authErrorToResponse(error);
}
