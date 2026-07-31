/**
 * Вернуть упавшее уведомление в очередь.
 *
 * `attempts` сбрасываем в 0 осознанно: воркер решает судьбу записи через
 * `hasExhaustedRetries(row.attempts)`, и без сброса запись мгновенно снова
 * стала бы FAILED, не сделав ни одной новой попытки.
 */
import { getAdminFromRequest } from '@/lib/admin/guard';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  const { id } = await context.params;

  const existing = await prisma.notificationOutbox.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.notificationOutbox.update({
    where: { id },
    data: { status: 'PENDING', attempts: 0, lastError: null },
  });

  logger.info('admin-outbox-retry', { id, admin, previousStatus: existing.status });

  return Response.json({ ok: true, status: updated.status });
}
