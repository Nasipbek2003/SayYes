/**
 * POST /api/invitations/:id/dev-activate
 *
 * Активирует черновик без оплаты — только для локальной разработки
 * (`NODE_ENV !== production` и `PAYMENT_PROVIDER=mock`). В остальных случаях
 * отвечает 404: публикация идёт через оплату (Finik) или активную подписку.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { env } from '@/lib/env';
import { invitationRepo } from '@/lib/repositories';
import { invitationService, InvitationServiceError } from '@/lib/services/invitation';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Бесплатная активация допустима только локально: с подключённым эквайрингом
  // (Finik) публикация возможна лишь после успешной оплаты или по подписке.
  if (env.nodeEnv === 'production' || env.payment.provider !== 'mock') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { id } = await context.params;

  try {
    const draft = await invitationRepo.findById(id);
    if (!draft) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (draft.authorId !== authorId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Force-move to PENDING_PAYMENT so activate() accepts it.
    if (draft.status === 'DRAFT') {
      await invitationRepo.update(id, { status: 'PENDING_PAYMENT', tier: 'PREMIUM' });
    }

    const result = await invitationService.activate(id);
    return Response.json({ ok: true, token: result.token, url: result.url });
  } catch (error) {
    if (error instanceof InvitationServiceError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}
