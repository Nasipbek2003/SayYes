/**
 * POST /api/cron/process-outbox — deliver pending Telegram notifications.
 *
 * Intended to be called by an external cron service (e.g. Vercel Cron). The
 * guest-facing open/respond endpoints already trigger an immediate best-effort
 * delivery, but this cron is the reliability backstop: it retries rows that
 * stayed PENDING because Telegram was momentarily unavailable, or because the
 * named `notifyTelegram` user only linked the bot afterwards.
 *
 * Protected by a shared secret in the `Authorization` header (same pattern as
 * sweep-expired) so it can't be triggered by third parties.
 */
import { outboxWorker } from '@/lib/notifications/outboxWorker';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('authorization');
    if (provided !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await outboxWorker.processPending();
  logger.info('process-outbox', {
    processed: result.processed,
    sent: result.sent,
    skipped: result.skipped,
    retried: result.retried,
    failed: result.failed,
  });

  return Response.json(result);
}
