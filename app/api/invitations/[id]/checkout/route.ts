/**
 * POST /api/invitations/:id/checkout — начать оплату приглашения.
 *
 * Auth: author (401 when no session). Ownership enforced (403 for someone
 * else's invitation, Requirement 10.4); unknown id → 404; checking out a
 * non-DRAFT invitation → 409.
 *
 * Body: `{ plan: 'single' | 'monthly' }` — разовая оплата (100 сом) или
 * подписка на месяц (300 сом).
 *
 * Ответ 200:
 *  - `{ checkoutUrl }` — нужно перейти на страницу оплаты провайдера;
 *  - `{ activated: true, url, token }` — у автора активна подписка, приглашение
 *    опубликовано сразу, без платежа.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { track } from '@/lib/analytics';
import { parsePlan } from '@/lib/pricing';
import { PaymentServiceError, paymentService } from '@/lib/services/payment';

export const runtime = 'nodejs';

interface CheckoutBody {
  plan?: unknown;
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

  const plan = parsePlan(body?.plan);
  if (plan === null) {
    return Response.json(
      { error: "`plan` must be 'single' or 'monthly'." },
      { status: 400 },
    );
  }

  try {
    const result = await paymentService.startCheckout(id, authorId, plan);

    if (result.kind === 'activated') {
      // Подписка уже оплачена — публикуем без нового платежа.
      track('checkout_skipped_subscription', { invitationId: id, plan });
      return Response.json(
        { activated: true, url: result.url, token: result.token },
        { status: 200 },
      );
    }

    // Funnel: author reached checkout (conversion analytics, gap #5).
    track('checkout_started', { invitationId: id, plan });
    return Response.json(
      { checkoutUrl: result.checkoutUrl, sessionId: result.sessionId },
      { status: 200 },
    );
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
