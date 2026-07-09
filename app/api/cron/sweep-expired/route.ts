/**
 * POST /api/cron/sweep-expired — expire links and purge their stored photos.
 *
 * Intended to be called by an external cron service (e.g. Vercel Cron, GitHub
 * Actions, or a simple curl job). Protected by a shared secret in the
 * `Authorization` header to prevent unauthorized triggering.
 *
 * Two responsibilities (Requirement 11 — privacy / data lifetime):
 *  1. Flip every ACTIVE invitation whose `expiresAt` is in the past to EXPIRED.
 *  2. **Privacy purge:** for each just-expired invitation, delete the author's
 *     uploaded photos from Cloudinary (stored under `sayyes/<id>`) and scrub the
 *     photo URLs from its `data`, so heavy/sensitive uploaded content does not
 *     linger after the link is dead. The author's own textual results
 *     (responses / RSVP) are intentionally kept for the cabinet.
 *
 * The purge is best-effort: a storage failure never fails the sweep (the row is
 * still expired and will be retried on the next run for anything left behind).
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { deleteByPrefix } from '@/lib/storage/cloudinary';

export const runtime = 'nodejs';

/** Author-data keys that may hold an uploaded photo URL. */
const PHOTO_KEYS = ['фото', 'фото_обложка'] as const;

/**
 * Remove photo URL fields from an invitation's `data`. Returns the scrubbed
 * data and whether anything changed (so we only write when needed).
 */
function scrubPhotoFields(data: Prisma.JsonValue): {
  scrubbed: Prisma.InputJsonValue;
  changed: boolean;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { scrubbed: (data ?? {}) as Prisma.InputJsonValue, changed: false };
  }
  const record = { ...(data as Record<string, unknown>) };
  let changed = false;
  for (const key of PHOTO_KEYS) {
    if (record[key] !== undefined && record[key] !== '') {
      delete record[key];
      changed = true;
    }
  }
  return { scrubbed: record as Prisma.InputJsonValue, changed };
}

export async function POST(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('authorization');
    if (provided !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();

  // Load the invitations about to expire first (we need their ids + data to
  // purge photos), then flip them to EXPIRED in one batch.
  const expiring = await prisma.invitation.findMany({
    where: { status: 'ACTIVE', expiresAt: { not: null, lt: now } },
    select: { id: true, data: true },
  });

  const result = await prisma.invitation.updateMany({
    where: { status: 'ACTIVE', expiresAt: { not: null, lt: now } },
    data: { status: 'EXPIRED' },
  });

  // Privacy purge: delete uploaded photos and scrub their URLs. Best-effort —
  // never throw out of the sweep.
  let photosPurged = 0;
  for (const invitation of expiring) {
    try {
      photosPurged += await deleteByPrefix(`sayyes/${invitation.id}`);
      const { scrubbed, changed } = scrubPhotoFields(invitation.data);
      if (changed) {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { data: scrubbed },
        });
      }
    } catch (error) {
      logger.warn('sweep-purge-failed', {
        invitationId: invitation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('sweep-expired', {
    swept: result.count,
    photosPurged,
    at: now.toISOString(),
  });

  return Response.json({ swept: result.count, photosPurged, at: now.toISOString() });
}
