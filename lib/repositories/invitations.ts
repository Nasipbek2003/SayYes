/**
 * Invitation data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `Invitation` model. No business logic lives
 * here — services in tasks 4.x / 5.x compose these primitives. Keeping the data
 * layer thin makes it trivial to unit-test the services with a mocked Prisma.
 */
import type { Prisma, Invitation, InvitationStatus, Tier } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface CreateInvitationInput {
  authorId: string;
  templateId: string;
  themeId: string;
  tier?: Tier;
  status?: InvitationStatus;
  data: Prisma.InputJsonValue;
  expiresAt?: Date | null;
  oneTimeView?: boolean;
  /** Telegram @username (normalised) to notify on a guest response. */
  notifyTelegram?: string | null;
}

/** Create a new invitation (typically a DRAFT). */
export function create(input: CreateInvitationInput): Promise<Invitation> {
  return prisma.invitation.create({ data: input });
}

/** Update arbitrary fields of an invitation by id. */
export function update(
  id: string,
  data: Prisma.InvitationUpdateInput,
): Promise<Invitation> {
  return prisma.invitation.update({ where: { id }, data });
}

/** Find an invitation by its primary key, or null if absent. */
export function findById(id: string): Promise<Invitation | null> {
  return prisma.invitation.findUnique({ where: { id } });
}

/** Find an invitation by its public token, or null if absent. */
export function findByToken(token: string): Promise<Invitation | null> {
  return prisma.invitation.findUnique({ where: { token } });
}

/** List all invitations belonging to an author (newest first). */
export function findByAuthor(authorId: string): Promise<Invitation[]> {
  return prisma.invitation.findMany({
    where: { authorId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Activate an invitation by assigning its public token and marking it ACTIVE.
 *
 * Sets `activatedAt` to the supplied time (defaults to now). Used after a
 * successful payment (Property 1 — activation only after successful payment).
 */
export function setTokenAndActivate(
  id: string,
  token: string,
  activatedAt: Date = new Date(),
): Promise<Invitation> {
  return prisma.invitation.update({
    where: { id },
    data: { token, status: 'ACTIVE', activatedAt },
  });
}
