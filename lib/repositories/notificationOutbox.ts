/**
 * NotificationOutbox data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `NotificationOutbox` model (outbox pattern).
 * Supports reliable Telegram delivery with retries (Requirement 9): a worker
 * reads PENDING rows, delivers them, and marks them SENT or FAILED.
 */
import type { NotificationOutbox, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface CreateOutboxInput {
  authorId: string;
  invitationId: string;
  /** opened | accepted | declined | rsvp */
  type: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Append an event to the outbox. Pass a Prisma transaction client (`tx`) to
 * enqueue in the same transaction as the domain change (Property 8 — every
 * domain event yields exactly one outbox row).
 */
export function create(
  input: CreateOutboxInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<NotificationOutbox> {
  return tx.notificationOutbox.create({ data: input });
}

/** Fetch pending outbox events for the worker (oldest first). */
export function findPending(limit = 50): Promise<NotificationOutbox[]> {
  return prisma.notificationOutbox.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/** Mark an event as successfully delivered. */
export function markSent(
  id: string,
  sentAt: Date = new Date(),
): Promise<NotificationOutbox> {
  return prisma.notificationOutbox.update({
    where: { id },
    data: { status: 'SENT', sentAt, lastError: null },
  });
}

/**
 * Record a failed delivery attempt: increments `attempts` and stores the error.
 * The row stays PENDING so the worker can retry with backoff.
 */
export function incrementAttempts(
  id: string,
  lastError: string,
): Promise<NotificationOutbox> {
  return prisma.notificationOutbox.update({
    where: { id },
    data: { attempts: { increment: 1 }, lastError },
  });
}

/**
 * Mark an event as permanently FAILED (e.g. after exceeding max attempts) while
 * recording the last error. The event remains visible in the author's cabinet
 * (Requirement 9.4).
 */
export function markFailed(
  id: string,
  lastError: string,
): Promise<NotificationOutbox> {
  return prisma.notificationOutbox.update({
    where: { id },
    data: { status: 'FAILED', attempts: { increment: 1 }, lastError },
  });
}
