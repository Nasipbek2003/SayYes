/**
 * Tests for the {@link OutboxWorker} Telegram delivery loop (task 9.2).
 *
 * Uses in-memory outbox + author repos and a programmable fake Telegram client
 * (no Prisma / network), covering the four required scenarios:
 *  - successful delivery → row SENT (with sentAt);
 *  - transient error → row stays PENDING with incremented attempts (retry);
 *  - exceeding the attempt limit → row FAILED with lastError, still visible;
 *  - author without telegramChatId → row left PENDING, not sent (Req 9.5).
 *
 * **Validates: Requirements 9.3, 9.4**
 */
import { describe, expect, it } from 'vitest';
import type { Author, NotificationOutbox } from '@prisma/client';

import {
  OutboxWorker,
  type WorkerAuthorRepo,
  type WorkerOutboxRepo,
} from './outboxWorker';
import type { RetryPolicy } from './backoff';
import type { TelegramClient, TelegramMessage } from './telegram';

const POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 };

/** In-memory outbox repo over a row map; mirrors the Prisma repo semantics. */
function makeOutboxRepo(initial: NotificationOutbox[]) {
  const store = new Map<string, NotificationOutbox>(initial.map((r) => [r.id, r]));
  const repo: WorkerOutboxRepo = {
    findPending: async (limit = 50) =>
      [...store.values()]
        .filter((r) => r.status === 'PENDING')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit),
    markSent: async (id, sentAt = new Date()) => {
      const row = { ...store.get(id)!, status: 'SENT' as const, sentAt, lastError: null };
      store.set(id, row);
      return row;
    },
    incrementAttempts: async (id, lastError) => {
      const prev = store.get(id)!;
      const row = { ...prev, attempts: prev.attempts + 1, lastError };
      store.set(id, row);
      return row;
    },
    markFailed: async (id, lastError) => {
      const prev = store.get(id)!;
      const row = { ...prev, status: 'FAILED' as const, attempts: prev.attempts + 1, lastError };
      store.set(id, row);
      return row;
    },
  };
  return { repo, store };
}

/** In-memory author repo. */
function makeAuthorRepo(authors: Author[]): WorkerAuthorRepo {
  const map = new Map(authors.map((a) => [a.id, a]));
  return { findById: async (id) => map.get(id) ?? null };
}

/** Telegram fake whose `sendMessage` behaviour is programmable per call. */
function makeTelegram(behaviour: () => void | never) {
  const sent: TelegramMessage[] = [];
  const client: TelegramClient = {
    sendMessage: async (message) => {
      behaviour();
      sent.push(message);
    },
  };
  return { client, sent };
}

function author(overrides: Partial<Author> = {}): Author {
  return {
    id: 'author-1',
    email: 'a@test',
    telegramChatId: '555',
    createdAt: new Date(),
    ...overrides,
  } as Author;
}

function outboxRow(overrides: Partial<NotificationOutbox> = {}): NotificationOutbox {
  return {
    id: 'n1',
    authorId: 'author-1',
    invitationId: 'inv-1',
    type: 'opened',
    payload: { message: 'Приглашение открыли: Аиша.', messageTemplate: 'x' },
    status: 'PENDING',
    attempts: 0,
    lastError: null,
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  } as NotificationOutbox;
}

function makeWorker(rows: NotificationOutbox[], authors: Author[], telegram: TelegramClient) {
  const { repo: outboxRepo, store } = makeOutboxRepo(rows);
  const worker = new OutboxWorker({
    outboxRepo,
    authorRepo: makeAuthorRepo(authors),
    telegram,
    policy: POLICY,
  });
  return { worker, store };
}

describe('OutboxWorker.processPending — successful delivery', () => {
  it('marks the row SENT and stamps sentAt, sending the payload message', async () => {
    const { client, sent } = makeTelegram(() => {});
    const { worker, store } = makeWorker([outboxRow()], [author()], client);

    const result = await worker.processPending();

    expect(result.sent).toBe(1);
    expect(sent).toEqual([{ chatId: '555', text: 'Приглашение открыли: Аиша.' }]);
    const row = store.get('n1')!;
    expect(row.status).toBe('SENT');
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(row.lastError).toBeNull();
  });
});

describe('OutboxWorker.processPending — transient error → retry', () => {
  it('keeps the row PENDING and increments attempts on a failure', async () => {
    const { client } = makeTelegram(() => {
      throw new Error('timeout');
    });
    const { worker, store } = makeWorker([outboxRow({ attempts: 0 })], [author()], client);

    const result = await worker.processPending();

    expect(result.retried).toBe(1);
    const row = store.get('n1')!;
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('timeout');
  });
});

describe('OutboxWorker.processPending — exceeding attempts → FAILED', () => {
  it('marks the row FAILED with lastError once the retry budget is exhausted', async () => {
    const { client } = makeTelegram(() => {
      throw new Error('still failing');
    });
    // maxAttempts = 3, already 2 failed attempts → next failure is permanent.
    const { worker, store } = makeWorker([outboxRow({ attempts: 2 })], [author()], client);

    const result = await worker.processPending();

    expect(result.failed).toBe(1);
    const row = store.get('n1')!;
    expect(row.status).toBe('FAILED');
    expect(row.lastError).toContain('still failing');
    // Still visible in the cabinet (Requirement 9.4): the row is retained.
    expect(store.get('n1')).toBeDefined();
  });
});

describe('OutboxWorker.processPending — author without telegramChatId', () => {
  it('leaves the row PENDING and sends nothing (Requirement 9.5)', async () => {
    const { client, sent } = makeTelegram(() => {});
    const { worker, store } = makeWorker(
      [outboxRow()],
      [author({ telegramChatId: null })],
      client,
    );

    const result = await worker.processPending();

    expect(result.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    const row = store.get('n1')!;
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(0);
  });

  it('delivers an unlinked author\'s pending event once linked on a later run', async () => {
    // First run: not linked → skipped, stays PENDING.
    let chatId: string | null = null;
    const { client, sent } = makeTelegram(() => {});
    const { repo: outboxRepo, store } = makeOutboxRepo([outboxRow()]);
    const worker = new OutboxWorker({
      outboxRepo,
      authorRepo: { findById: async () => author({ telegramChatId: chatId }) },
      telegram: client,
      policy: POLICY,
    });

    await worker.processPending();
    expect(store.get('n1')!.status).toBe('PENDING');
    expect(sent).toHaveLength(0);

    // Author links Telegram, then a later run delivers it.
    chatId = '999';
    await worker.processPending();
    expect(store.get('n1')!.status).toBe('SENT');
    expect(sent).toEqual([{ chatId: '999', text: 'Приглашение открыли: Аиша.' }]);
  });
});
