/**
 * Payment data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `Payment` model. Lookups by `sessionId`
 * support idempotent webhook handling (Property 2 / Requirement 3.2).
 */
import type { Payment, PaymentPlan, PaymentStatus, Tier } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface CreatePaymentInput {
  /** Приглашение, за которое платят. Отсутствует у «чистой» подписки. */
  invitationId?: string | null;
  authorId: string;
  plan: PaymentPlan;
  provider: string;
  sessionId: string;
  /** Сумма в целых сомах. */
  amount: number;
  currency?: string;
  tier: Tier;
  status?: PaymentStatus;
  externalId?: string | null;
}

/** Create a payment record (typically PENDING at checkout time). */
export function create(input: CreatePaymentInput): Promise<Payment> {
  return prisma.payment.create({ data: input });
}

/** Find a payment by the provider session id, or null if absent. */
export function findBySessionId(sessionId: string): Promise<Payment | null> {
  return prisma.payment.findUnique({ where: { sessionId } });
}

/** Latest payment attached to an invitation, or null if absent. */
export function findByInvitation(invitationId: string): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: { invitationId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Update a payment's status, keyed by its provider session id. Успешный платёж
 * дополнительно фиксирует `paidAt` и id транзакции провайдера.
 */
export function updateStatus(
  sessionId: string,
  status: PaymentStatus,
  extra: { externalId?: string | null } = {},
): Promise<Payment> {
  return prisma.payment.update({
    where: { sessionId },
    data: {
      status,
      ...(status === 'SUCCEEDED' ? { paidAt: new Date() } : {}),
      ...(extra.externalId ? { externalId: extra.externalId } : {}),
    },
  });
}
