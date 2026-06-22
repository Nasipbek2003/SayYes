/**
 * OpenEvent data-access (repository) layer.
 *
 * Thin wrapper over Prisma for recording invitation "open" events
 * (Requirement 9.1 — author is notified when the link is opened).
 */
import type { OpenEvent, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface CreateOpenEventInput {
  invitationId: string;
  userAgent?: string | null;
}

/**
 * Record that an invitation was opened.
 *
 * Pass a Prisma transaction client (`tx`) to record the open in the same
 * transaction as the matching outbox enqueue (Property 8 — every domain event
 * yields exactly one outbox row, atomically).
 */
export function create(
  input: CreateOpenEventInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<OpenEvent> {
  return tx.openEvent.create({
    data: {
      invitationId: input.invitationId,
      userAgent: input.userAgent ?? null,
    },
  });
}

/** List open events for an invitation (oldest first). */
export function findByInvitation(invitationId: string): Promise<OpenEvent[]> {
  return prisma.openEvent.findMany({
    where: { invitationId },
    orderBy: { openedAt: 'asc' },
  });
}

/**
 * Count how many times an invitation has been opened. Accepts an optional
 * transaction client so first-open detection can share the recording
 * transaction (Property 8 / Requirement 9.1).
 */
export function countByInvitation(
  invitationId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  return tx.openEvent.count({ where: { invitationId } });
}
