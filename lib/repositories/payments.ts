/**
 * Payment data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `Payment` model. Lookups by `sessionId`
 * support idempotent webhook handling (Property 2 / Requirement 3.2).
 */
import type { Payment, PaymentStatus, Tier } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface CreatePaymentInput {
  invitationId: string;
  provider: string;
  sessionId: string;
  amount: number;
  tier: Tier;
  status?: PaymentStatus;
}

/** Create a payment record (typically PENDING at checkout time). */
export function create(input: CreatePaymentInput): Promise<Payment> {
  return prisma.payment.create({ data: input });
}

/** Find a payment by the provider session id, or null if absent. */
export function findBySessionId(sessionId: string): Promise<Payment | null> {
  return prisma.payment.findUnique({ where: { sessionId } });
}

/** Find the payment attached to an invitation, or null if absent. */
export function findByInvitation(invitationId: string): Promise<Payment | null> {
  return prisma.payment.findUnique({ where: { invitationId } });
}

/** Update a payment's status, keyed by its provider session id. */
export function updateStatus(
  sessionId: string,
  status: PaymentStatus,
): Promise<Payment> {
  return prisma.payment.update({
    where: { sessionId },
    data: { status },
  });
}
