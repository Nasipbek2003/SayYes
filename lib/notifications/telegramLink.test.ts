/**
 * Unit tests for Telegram account linking (task 9.3, Requirement 9.5).
 *
 * Covers the signed link-code round trip, deep-link / `/start` parsing, and the
 * `linkTelegramFromUpdate` orchestration that binds a chat id to an author.
 * Pure crypto + an in-memory author repo — no Prisma or network involved.
 *
 * **Validates: Requirements 9.5**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildStartDeepLink,
  issueLinkCode,
  linkTelegramFromUpdate,
  parseStartCommand,
  verifyLinkCode,
  type LinkAuthorRepo,
} from './telegramLink';

const SECRET = 'test-session-secret-value';

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.TELEGRAM_BOT_USERNAME;
  vi.restoreAllMocks();
});

describe('issueLinkCode / verifyLinkCode', () => {
  it('round-trips and returns the bound author id', async () => {
    const code = await issueLinkCode('author-1');
    expect(await verifyLinkCode(code)).toBe('author-1');
  });

  it('returns null for missing/empty codes', async () => {
    expect(await verifyLinkCode(undefined)).toBeNull();
    expect(await verifyLinkCode(null)).toBeNull();
    expect(await verifyLinkCode('')).toBeNull();
  });

  it('rejects a tampered code', async () => {
    const code = await issueLinkCode('author-1');
    expect(await verifyLinkCode(code + 'x')).toBeNull();
  });

  it('rejects a code signed with a different secret', async () => {
    const code = await issueLinkCode('author-1');
    process.env.SESSION_SECRET = 'a-different-secret';
    expect(await verifyLinkCode(code)).toBeNull();
  });

  it('rejects an expired code', async () => {
    const code = await issueLinkCode('author-1', -1);
    expect(await verifyLinkCode(code)).toBeNull();
  });
});

describe('parseStartCommand', () => {
  it('extracts the payload from /start <code>', () => {
    expect(parseStartCommand('/start abc123')).toBe('abc123');
  });

  it('tolerates the /start@bot suffix', () => {
    expect(parseStartCommand('/start@SayYesBot abc123')).toBe('abc123');
  });

  it('returns null for non-start text or a bare /start', () => {
    expect(parseStartCommand('hello')).toBeNull();
    expect(parseStartCommand('/start')).toBeNull();
    expect(parseStartCommand(undefined)).toBeNull();
  });
});

describe('buildStartDeepLink', () => {
  it('builds a t.me deep-link when the bot username is configured', () => {
    process.env.TELEGRAM_BOT_USERNAME = 'SayYesBot';
    expect(buildStartDeepLink('code123')).toBe('https://t.me/SayYesBot?start=code123');
  });

  it('returns null when no bot username is configured', () => {
    expect(buildStartDeepLink('code123')).toBeNull();
  });
});

describe('linkTelegramFromUpdate', () => {
  function makeRepo() {
    const calls: Array<{ id: string; chatId: string }> = [];
    const repo: LinkAuthorRepo = {
      setTelegramChatId: async (id, chatId) => {
        calls.push({ id, chatId });
        return { id, telegramChatId: chatId };
      },
    };
    return { repo, calls };
  }

  it('persists the chat id for a valid /start <code> update', async () => {
    const code = await issueLinkCode('author-1');
    const { repo, calls } = makeRepo();

    const result = await linkTelegramFromUpdate(
      { message: { text: `/start ${code}`, chat: { id: 424242 } } },
      repo,
    );

    expect(result).toEqual({ ok: true, authorId: 'author-1', chatId: '424242' });
    expect(calls).toEqual([{ id: 'author-1', chatId: '424242' }]);
  });

  it('ignores non-start messages without touching the repo', async () => {
    const { repo, calls } = makeRepo();
    const result = await linkTelegramFromUpdate(
      { message: { text: 'hi there', chat: { id: 1 } } },
      repo,
    );
    expect(result).toEqual({ ok: false, reason: 'not_start' });
    expect(calls).toHaveLength(0);
  });

  it('rejects an invalid code without linking', async () => {
    const { repo, calls } = makeRepo();
    const result = await linkTelegramFromUpdate(
      { message: { text: '/start not-a-real-code', chat: { id: 1 } } },
      repo,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid_code' });
    expect(calls).toHaveLength(0);
  });

  it('fails when the update has no chat id', async () => {
    const code = await issueLinkCode('author-1');
    const { repo, calls } = makeRepo();
    const result = await linkTelegramFromUpdate(
      { message: { text: `/start ${code}` } },
      repo,
    );
    expect(result).toEqual({ ok: false, reason: 'no_chat' });
    expect(calls).toHaveLength(0);
  });
});

describe('accumulated PENDING events deliver after linking (Requirement 9.5)', () => {
  it('worker skips while unlinked, then delivers the backlog once linked', async () => {
    const { OutboxWorker } = await import('./outboxWorker');

    // Shared author store: starts unlinked.
    const authorStore = new Map<string, { id: string; telegramChatId: string | null }>([
      ['author-1', { id: 'author-1', telegramChatId: null }],
    ]);
    const linkRepo: LinkAuthorRepo = {
      setTelegramChatId: async (id, chatId) => {
        authorStore.set(id, { id, telegramChatId: chatId });
        return authorStore.get(id)!;
      },
    };

    // One PENDING outbox row accumulated before linking.
    const row = {
      id: 'n1',
      authorId: 'author-1',
      invitationId: 'inv-1',
      type: 'opened',
      payload: { message: 'Приглашение открыли.' },
      status: 'PENDING' as const,
      attempts: 0,
      lastError: null as string | null,
      createdAt: new Date(),
      sentAt: null as Date | null,
    };
    const sent: Array<{ chatId: string; text: string }> = [];
    const worker = new OutboxWorker({
      outboxRepo: {
        findPending: async () => (row.status === 'PENDING' ? [row as never] : []),
        markSent: async () => {
          row.status = 'SENT' as never;
          return row as never;
        },
        incrementAttempts: async () => row as never,
        markFailed: async () => row as never,
      },
      authorRepo: { findById: async (id) => (authorStore.get(id) as never) ?? null },
      telegram: {
        sendMessage: async (m) => {
          sent.push(m);
        },
      },
    });

    // 1) Before linking: the worker skips and the event stays PENDING.
    const before = await worker.processPending();
    expect(before.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    expect(row.status).toBe('PENDING');

    // 2) Author links Telegram via the /start <code> flow.
    const code = await issueLinkCode('author-1');
    const linked = await linkTelegramFromUpdate(
      { message: { text: `/start ${code}`, chat: { id: 12345 } } },
      linkRepo,
    );
    expect(linked.ok).toBe(true);

    // 3) The next worker run now finds the chat id and delivers the backlog.
    const after = await worker.processPending();
    expect(after.sent).toBe(1);
    expect(sent).toEqual([{ chatId: '12345', text: 'Приглашение открыли.' }]);
    expect(row.status).toBe('SENT');
  });
});

