/**
 * POST /api/payments/mock-complete — только для локальной разработки.
 *
 * Заменяет вебхук провайдера, когда `PAYMENT_PROVIDER=mock`: страница
 * /mock-checkout/<session> вызывает этот эндпоинт с нужным исходом, и платёж
 * проходит тот же путь, что и настоящий (`PaymentService.handleWebhook`).
 *
 * Закрыт при любом реальном провайдере, а на задеплоенном стенде — ещё и без
 * `ALLOW_MOCK_PAYMENTS=true`, чтобы нельзя было «оплатить» приглашение бесплатно.
 */
import { AuthError, authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { logger } from '@/lib/logger';
import { mockPaymentsEnabled } from '@/lib/payments/mockAccess';
import { PaymentServiceError, paymentService } from '@/lib/services/payment';

export const runtime = 'nodejs';

interface Body {
  session?: unknown;
  status?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  if (!mockPaymentsEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.session === 'string' ? body.session : '';
  const status = body.status === 'failed' ? 'failed' : 'succeeded';
  if (!sessionId) {
    return Response.json({ error: '`session` is required.' }, { status: 400 });
  }

  try {
    // Проверяем владельца платежа тем же путём, что и страница статуса:
    // 404 — неизвестная сессия, 403 — платёж другого автора.
    await paymentService.getSessionStatus(sessionId, authorId);

    const result = await paymentService.handleWebhook({ sessionId, status });
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    // Ошибка авторизации/владения — отдаём 401/403 вместо непрозрачного 500.
    if (error instanceof AuthError) {
      return authErrorToResponse(error);
    }

    logger.error('mock-complete-failed', {
      sessionId,
      status,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json(
      {
        error:
          error instanceof Error
            ? `Тестовый платёж не завершился: ${error.message}`
            : 'Тестовый платёж не завершился.',
      },
      { status: 500 },
    );
  }
}
