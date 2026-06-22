/**
 * Magic-link token data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `MagicLinkToken` model used by the email
 * magic-link sign-in flow (task 4.1). Only the SHA-256 hash of a token is ever
 * persisted — the raw token lives solely in the emailed link. A token is
 * single-use: `consumeByHash` atomically stamps `consumedAt` and only succeeds
 * if the row is still unconsumed, so a replayed link is rejected.
 */
import type { MagicLinkToken } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface CreateMagicLinkInput {
  authorId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Persist a freshly issued magic-link token (hash only). */
export function create(input: CreateMagicLinkInput): Promise<MagicLinkToken> {
  return prisma.magicLinkToken.create({ data: input });
}

/** Look up a magic-link token by its hash, or null if absent. */
export function findByHash(tokenHash: string): Promise<MagicLinkToken | null> {
  return prisma.magicLinkToken.findUnique({ where: { tokenHash } });
}

/**
 * Atomically consume a magic-link token by hash.
 *
 * Uses a conditional `updateMany` (where `consumedAt IS NULL`) so that two
 * concurrent confirmations can never both succeed: exactly one update affects a
 * row. Returns the number of rows consumed (0 or 1), letting callers detect a
 * replay or already-used link.
 */
export async function consumeByHash(
  tokenHash: string,
  consumedAt: Date = new Date(),
): Promise<number> {
  const result = await prisma.magicLinkToken.updateMany({
    where: { tokenHash, consumedAt: null },
    data: { consumedAt },
  });
  return result.count;
}

/** Delete expired or consumed tokens (housekeeping). */
export function deleteExpired(now: Date = new Date()): Promise<{ count: number }> {
  return prisma.magicLinkToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
  });
}
