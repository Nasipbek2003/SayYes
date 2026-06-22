/**
 * POST /api/cron/sweep-expired — mark expired invitations as EXPIRED.
 *
 * Intended to be called by an external cron service (e.g. Vercel Cron, GitHub
 * Actions, or a simple curl job). Protected by a shared secret in the
 * `Authorization` header to prevent unauthorized triggering.
 *
 * Finds all ACTIVE invitations whose `expiresAt` is in the past and flips
 * their status to EXPIRED in a single batch update.
 */
import { prisma } from '@/lib/prisma';
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

  const now = new Date();

  const result = await prisma.invitation.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { not: null, lt: now },
    },
    data: { status: 'EXPIRED' },
  });

  logger.info('sweep-expired', { swept: result.count, at: now.toISOString() });

  return Response.json({ swept: result.count, at: now.toISOString() });
}
