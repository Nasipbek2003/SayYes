/**
 * Email magic-link token issuing and verification (task 4.1).
 *
 * Flow:
 *  1. `requestMagicLink(email)` finds-or-creates the author, generates a
 *     high-entropy random token, stores only its SHA-256 hash with a short
 *     expiry, and returns the raw token so a caller can build the sign-in URL
 *     and hand it to a {@link Mailer}.
 *  2. The author clicks the link; `consumeMagicLink(rawToken)` hashes the
 *     presented token, atomically marks the stored row consumed (single-use),
 *     and — if valid and unexpired — returns the owning author id so the caller
 *     can issue a session.
 *
 * Security notes:
 *  - The raw token is never persisted or logged; only its hash is stored.
 *  - Tokens are short-lived ({@link MAGIC_LINK_TTL_SECONDS}).
 *  - Consumption is atomic and single-use: a replayed link fails.
 */
import { createHash, randomBytes } from 'node:crypto';

import { authorRepo, magicLinkRepo } from '@/lib/repositories';

/** Magic-link lifetime: 15 minutes (seconds). */
export const MAGIC_LINK_TTL_SECONDS = 60 * 15;

/** Number of random bytes in a raw magic-link token (256 bits of entropy). */
const TOKEN_BYTES = 32;

/** Generate a URL-safe random magic-link token. */
export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Hash a raw token for storage/lookup.
 *
 * SHA-256 is appropriate here (not a slow password hash): the token already has
 * 256 bits of entropy, so it is not brute-forceable, and lookups must be fast.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface IssuedMagicLink {
  authorId: string;
  /** Raw token to embed in the sign-in URL (never stored). */
  rawToken: string;
  expiresAt: Date;
}

/**
 * Issue a magic-link token for the given email, provisioning the author if
 * needed. Returns the raw token and metadata; the caller builds the link and
 * sends it via a {@link Mailer}.
 */
export async function issueMagicLinkForEmail(
  email: string,
  now: Date = new Date(),
): Promise<IssuedMagicLink> {
  const author = await authorRepo.findOrCreateByEmail(email);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_SECONDS * 1000);

  await magicLinkRepo.create({ authorId: author.id, tokenHash, expiresAt });

  return { authorId: author.id, rawToken, expiresAt };
}

export type ConsumeResult =
  | { ok: true; authorId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' };

/**
 * Verify and consume a presented magic-link token.
 *
 * Returns `{ ok: true, authorId }` exactly once for a valid, unexpired,
 * unconsumed token. Subsequent attempts (or expired/unknown tokens) return
 * `{ ok: false, reason }` so the caller can render the right message without
 * leaking which case occurred.
 */
export async function consumeMagicLink(
  rawToken: string,
  now: Date = new Date(),
): Promise<ConsumeResult> {
  const tokenHash = hashToken(rawToken);
  const record = await magicLinkRepo.findByHash(tokenHash);

  if (!record) return { ok: false, reason: 'not_found' };
  if (record.consumedAt) return { ok: false, reason: 'already_used' };
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  // Atomically claim the token; only one caller can win this race.
  const consumed = await magicLinkRepo.consumeByHash(tokenHash, now);
  if (consumed !== 1) return { ok: false, reason: 'already_used' };

  return { ok: true, authorId: record.authorId };
}
