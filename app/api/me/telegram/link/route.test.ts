/**
 * Integration tests for POST /api/me/telegram/link (task 9.3).
 *
 * Auth (`requireAuthor` / `getCurrentAuthor` from `@/lib/auth/nextCookies`) is
 * mocked so these tests cover the HTTP adapter: 401 when unauthenticated, a
 * link code + deep-link for an unlinked author, and an `alreadyLinked` short
 * circuit when the author already has a `telegramChatId`.
 *
 * **Validates: Requirements 9.5**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/guards';
import { verifyLinkCode } from '@/lib/notifications/telegramLink';

const requireAuthor = vi.fn();
const getCurrentAuthor = vi.fn();

vi.mock('@/lib/auth/nextCookies', () => ({
  requireAuthor: () => requireAuthor(),
  getCurrentAuthor: () => getCurrentAuthor(),
}));

const { POST } = await import('./route');

const SECRET = 'test-session-secret-value';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = SECRET;
  process.env.TELEGRAM_BOT_USERNAME = 'SayYesBot';
  requireAuthor.mockResolvedValue('author-1');
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.TELEGRAM_BOT_USERNAME;
});

describe('POST /api/me/telegram/link', () => {
  it('returns a verifiable link code and deep-link for an unlinked author', async () => {
    getCurrentAuthor.mockResolvedValue({ id: 'author-1', telegramChatId: null });

    const res = await POST();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      alreadyLinked: boolean;
      code: string;
      deepLink: string;
    };
    expect(body.alreadyLinked).toBe(false);
    expect(body.deepLink).toBe(`https://t.me/SayYesBot?start=${encodeURIComponent(body.code)}`);
    // The code is signed and binds back to this author.
    expect(await verifyLinkCode(body.code)).toBe('author-1');
  });

  it('short-circuits with alreadyLinked when the author has a chat id', async () => {
    getCurrentAuthor.mockResolvedValue({ id: 'author-1', telegramChatId: '555' });

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyLinked: true });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthor.mockRejectedValue(new AuthError(401, 'Authentication required'));

    const res = await POST();
    expect(res.status).toBe(401);
    expect(getCurrentAuthor).not.toHaveBeenCalled();
  });
});
