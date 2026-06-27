/**
 * Integration tests for POST /api/telegram/webhook (task 9.3).
 *
 * The author repo is mocked so these tests cover the HTTP adapter: secret-token
 * verification, body parsing, and that a valid `/start <code>` update links the
 * sender's chat id to the bound author.
 *
 * **Validates: Requirements 9.5**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { issueLinkCode } from '@/lib/notifications/telegramLink';

const setTelegramChatId = vi.fn();
const upsertContact = vi.fn();
const sendMessage = vi.fn();

vi.mock('@/lib/repositories', () => ({
  authorRepo: { setTelegramChatId: (...args: unknown[]) => setTelegramChatId(...args) },
  telegramContactRepo: { upsert: (...args: unknown[]) => upsertContact(...args) },
}));

vi.mock('@/lib/notifications/telegram', () => ({
  getTelegramClient: () => ({ sendMessage: (...args: unknown[]) => sendMessage(...args) }),
}));

const { POST } = await import('./route');

const SECRET = 'test-session-secret-value';

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = SECRET;
  setTelegramChatId.mockResolvedValue({});
  upsertContact.mockResolvedValue({});
  sendMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

describe('POST /api/telegram/webhook', () => {
  it('links the sender chat id for a valid /start <code> update', async () => {
    const code = await issueLinkCode('author-1');

    const res = await POST(req({ message: { text: `/start ${code}`, chat: { id: 777 } } }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, linked: true });
    expect(setTelegramChatId).toHaveBeenCalledWith('author-1', '777');
  });

  it('acknowledges a non-start update without linking', async () => {
    const res = await POST(req({ message: { text: 'hello', chat: { id: 1 } } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, linked: false });
    expect(setTelegramChatId).not.toHaveBeenCalled();
  });

  it('captures the sender @username → chat.id on any message', async () => {
    const res = await POST(
      req({ message: { text: 'hi', from: { username: 'Alice' }, chat: { id: 4242 } } }),
    );
    expect(res.status).toBe(200);
    // Username is normalised (lowercased) before storage.
    expect(upsertContact).toHaveBeenCalledWith('alice', '4242');
  });

  it('replies with a confirmation on /start when the contact is captured', async () => {
    upsertContact.mockResolvedValue({});
    const res = await POST(
      req({ message: { text: '/start', from: { username: 'Alice' }, chat: { id: 4242 } } }),
    );
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const arg = sendMessage.mock.calls[0][0] as { chatId: string; text: string };
    expect(arg.chatId).toBe('4242');
    expect(arg.text).toContain('@Alice');
  });

  it('does not reply to a non-/start message', async () => {
    await POST(req({ message: { text: 'просто привет', from: { username: 'Bob' }, chat: { id: 7 } } }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an update with a wrong secret token (401)', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';
    const res = await POST(
      req({ message: { text: '/start x', chat: { id: 1 } } }, {
        'x-telegram-bot-api-secret-token': 'wrong',
      }),
    );
    expect(res.status).toBe(401);
    expect(setTelegramChatId).not.toHaveBeenCalled();
  });

  it('accepts a matching secret token', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';
    const code = await issueLinkCode('author-2');
    const res = await POST(
      req({ message: { text: `/start ${code}`, chat: { id: 9 } } }, {
        'x-telegram-bot-api-secret-token': 'expected-secret',
      }),
    );
    expect(res.status).toBe(200);
    expect(setTelegramChatId).toHaveBeenCalledWith('author-2', '9');
  });

  it('returns 400 for an unparseable body', async () => {
    const bad = new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
