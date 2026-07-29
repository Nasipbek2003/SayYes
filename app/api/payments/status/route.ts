/**
 * GET /api/payments/status?session=<sessionId>
 *
 * Статус платежа для страницы возврата с оплаты. Finik присылает автора на
 * `RedirectUrl` сразу, а подтверждение приходит вебхуком — страница
 * /payment/callback опрашивает этот эндпоинт, пока платёж не станет
 * SUCCEEDED, и затем ведёт автора на ссылку приглашения.
 *
 * Auth: автор (401), только свои платежи (403), неизвестная сессия — 404.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { PaymentServiceError, paymentService } from '@/lib/services/payment';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const sessionId = new URL(request.url).searchParams.get('session') ?? '';
  if (!sessionId) {
    return Response.json({ error: '`session` is required.' }, { status: 400 });
  }

  try {
    const status = await paymentService.getSessionStatus(sessionId, authorId);
    return Response.json(status, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return authErrorToResponse(error);
  }
}
