/**
 * Author data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `Author` model. Used by the auth layer
 * (task 4.1) to find-or-create an author at sign-in time and to resolve the
 * current author from a session.
 */
import type { Author } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/** Find an author by primary key, or null if absent. */
export function findById(id: string): Promise<Author | null> {
  return prisma.author.findUnique({ where: { id } });
}

/** Find an author by email, or null if absent. */
export function findByEmail(email: string): Promise<Author | null> {
  return prisma.author.findUnique({ where: { email } });
}

/**
 * Find an existing author by email or create one.
 *
 * The email magic-link flow treats sign-in and sign-up as the same action: a
 * first-time email transparently provisions an author (Requirement 10.4 — the
 * author owns their invitations once authenticated).
 */
export async function findOrCreateByEmail(email: string): Promise<Author> {
  const existing = await prisma.author.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.author.create({ data: { email } });
}

/** Create an author with email and password hash. */
export function createWithPassword(
  email: string,
  passwordHash: string,
): Promise<Author> {
  return prisma.author.create({ data: { email, passwordHash } });
}

/** Attach a Telegram chat id to an author (Telegram-login / linking). */
export function setTelegramChatId(
  id: string,
  telegramChatId: string,
): Promise<Author> {
  return prisma.author.update({ where: { id }, data: { telegramChatId } });
}
