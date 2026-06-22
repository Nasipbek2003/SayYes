/**
 * Unit tests for the auth guards (task 4.1).
 *
 * Covers:
 *  - requireAuthor returns the author id for a valid session cookie and throws
 *    a 401 AuthError when the cookie is missing/invalid,
 *  - assertOwnership throws a 403 AuthError for a foreign author id and passes
 *    for the owner (Requirement 10.4),
 *  - authErrorToResponse maps AuthError to the right HTTP status.
 *
 * The author repository is mocked; the session secret is set so real JWTs can
 * be issued and verified end-to-end through the guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/repositories', () => ({
  authorRepo: {
    findById: vi.fn(),
  },
}));

import { authorRepo } from '@/lib/repositories';
import {
  AuthError,
  assertOwnership,
  authErrorToResponse,
  getCurrentAuthor,
  getCurrentAuthorId,
  requireAuthor,
} from './guards';
import { issueSessionToken } from './session';

const authorRepoMock = vi.mocked(authorRepo);

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-value';
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe('requireAuthor', () => {
  it('returns the author id for a valid session cookie', async () => {
    const token = await issueSessionToken('author-42');
    const authorId = await requireAuthor(() => token);
    expect(authorId).toBe('author-42');
  });

  it('throws a 401 AuthError when no cookie is present', async () => {
    await expect(requireAuthor(() => undefined)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws a 401 AuthError for an invalid cookie', async () => {
    await expect(requireAuthor(() => 'garbage.token')).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('supports an async cookie reader', async () => {
    const token = await issueSessionToken('author-7');
    const authorId = await requireAuthor(async () => token);
    expect(authorId).toBe('author-7');
  });
});

describe('getCurrentAuthorId / getCurrentAuthor', () => {
  it('returns null when unauthenticated', async () => {
    expect(await getCurrentAuthorId(() => undefined)).toBeNull();
    expect(await getCurrentAuthor(() => undefined)).toBeNull();
    expect(authorRepoMock.findById).not.toHaveBeenCalled();
  });

  it('resolves the full author record for a valid session', async () => {
    const token = await issueSessionToken('author-9');
    authorRepoMock.findById.mockResolvedValue({
      id: 'author-9',
      email: 'a@b.com',
    } as never);

    const author = await getCurrentAuthor(() => token);
    expect(author).toMatchObject({ id: 'author-9' });
    expect(authorRepoMock.findById).toHaveBeenCalledWith('author-9');
  });
});

describe('assertOwnership (Requirement 10.4)', () => {
  it('passes when the current author owns the resource', () => {
    expect(() => assertOwnership('author-1', 'author-1')).not.toThrow();
  });

  it('throws a 403 AuthError for a foreign author id', () => {
    try {
      assertOwnership('author-1', 'author-2');
      throw new Error('expected assertOwnership to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).status).toBe(403);
    }
  });
});

describe('authErrorToResponse', () => {
  it('maps a 401 AuthError to a 401 response', async () => {
    const res = authErrorToResponse(new AuthError(401, 'nope'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'nope' });
  });

  it('maps a 403 AuthError to a 403 response', () => {
    expect(authErrorToResponse(new AuthError(403, 'forbidden')).status).toBe(403);
  });

  it('rethrows non-AuthError values', () => {
    const boom = new Error('boom');
    expect(() => authErrorToResponse(boom)).toThrow('boom');
  });
});
