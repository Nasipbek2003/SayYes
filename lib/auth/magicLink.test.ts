/**
 * Unit tests for the email magic-link token layer (task 4.1).
 *
 * The repository layer (Prisma-backed) is mocked, so these tests exercise the
 * crypto + state-machine logic without a database:
 *  - issuing hashes the token (raw token never stored) and sets a short expiry,
 *  - consuming a valid token returns the author id exactly once,
 *  - expired / unknown / already-consumed tokens are rejected with a reason,
 *  - a replay (lost atomic consume race) is rejected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/repositories', () => ({
  authorRepo: {
    findOrCreateByEmail: vi.fn(),
  },
  magicLinkRepo: {
    create: vi.fn(),
    findByHash: vi.fn(),
    consumeByHash: vi.fn(),
  },
}));

import { authorRepo, magicLinkRepo } from '@/lib/repositories';
import {
  MAGIC_LINK_TTL_SECONDS,
  consumeMagicLink,
  generateRawToken,
  hashToken,
  issueMagicLinkForEmail,
} from './magicLink';

const authorRepoMock = vi.mocked(authorRepo);
const magicLinkRepoMock = vi.mocked(magicLinkRepo);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('token crypto helpers', () => {
  it('generates high-entropy, URL-safe, unique tokens', () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('hashes deterministically and differs from the raw token', () => {
    const raw = 'some-raw-token';
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('issueMagicLinkForEmail', () => {
  it('provisions the author and stores only the token hash with a short expiry', async () => {
    authorRepoMock.findOrCreateByEmail.mockResolvedValue({
      id: 'author-1',
    } as never);
    magicLinkRepoMock.create.mockResolvedValue({} as never);

    const now = new Date('2025-01-01T00:00:00.000Z');
    const issued = await issueMagicLinkForEmail('user@example.com', now);

    expect(authorRepoMock.findOrCreateByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(issued.authorId).toBe('author-1');
    expect(issued.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);

    // Stored row uses the HASH of the raw token, never the raw token itself.
    const createArg = magicLinkRepoMock.create.mock.calls[0][0];
    expect(createArg.tokenHash).toBe(hashToken(issued.rawToken));
    expect(createArg.tokenHash).not.toBe(issued.rawToken);
    expect(createArg.authorId).toBe('author-1');

    // Expiry is the short TTL ahead of `now`.
    const expectedExpiry = now.getTime() + MAGIC_LINK_TTL_SECONDS * 1000;
    expect(createArg.expiresAt.getTime()).toBe(expectedExpiry);
    expect(issued.expiresAt.getTime()).toBe(expectedExpiry);
  });
});

describe('consumeMagicLink', () => {
  const now = new Date('2025-01-01T00:00:00.000Z');
  const future = new Date(now.getTime() + 60_000);
  const past = new Date(now.getTime() - 60_000);

  it('returns the author id for a valid, unexpired, unconsumed token (once)', async () => {
    magicLinkRepoMock.findByHash.mockResolvedValue({
      authorId: 'author-1',
      consumedAt: null,
      expiresAt: future,
    } as never);
    magicLinkRepoMock.consumeByHash.mockResolvedValue(1);

    const result = await consumeMagicLink('raw', now);
    expect(result).toEqual({ ok: true, authorId: 'author-1' });
    expect(magicLinkRepoMock.consumeByHash).toHaveBeenCalledWith(
      hashToken('raw'),
      now,
    );
  });

  it('rejects an unknown token', async () => {
    magicLinkRepoMock.findByHash.mockResolvedValue(null);
    expect(await consumeMagicLink('raw', now)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('rejects an already-consumed token', async () => {
    magicLinkRepoMock.findByHash.mockResolvedValue({
      authorId: 'author-1',
      consumedAt: past,
      expiresAt: future,
    } as never);
    expect(await consumeMagicLink('raw', now)).toEqual({
      ok: false,
      reason: 'already_used',
    });
    expect(magicLinkRepoMock.consumeByHash).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    magicLinkRepoMock.findByHash.mockResolvedValue({
      authorId: 'author-1',
      consumedAt: null,
      expiresAt: past,
    } as never);
    expect(await consumeMagicLink('raw', now)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects a replay that lost the atomic consume race', async () => {
    magicLinkRepoMock.findByHash.mockResolvedValue({
      authorId: 'author-1',
      consumedAt: null,
      expiresAt: future,
    } as never);
    // Another request consumed it first → 0 rows updated.
    magicLinkRepoMock.consumeByHash.mockResolvedValue(0);

    expect(await consumeMagicLink('raw', now)).toEqual({
      ok: false,
      reason: 'already_used',
    });
  });
});
