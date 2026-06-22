/**
 * Tests for {@link BotApiTelegramClient} (task 9.2).
 *
 * Exercises the Bot API client against an injected `fetch` fake:
 *  - posts to the correct sendMessage URL with chat_id + text;
 *  - resolves on a `{ ok: true }` response;
 *  - throws {@link TelegramDeliveryError} on non-2xx, `{ ok: false }`, or a
 *    network error, and {@link TelegramConfigError} when no token is set.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  BotApiTelegramClient,
  TelegramConfigError,
  TelegramDeliveryError,
} from './telegram';

function okResponse(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BotApiTelegramClient.sendMessage', () => {
  it('posts chat_id and text to the sendMessage endpoint', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const client = new BotApiTelegramClient({
      token: 'TOKEN123',
      apiBase: 'https://tg.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.sendMessage({ chatId: '42', text: 'Привет' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://tg.test/botTOKEN123/sendMessage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: '42', text: 'Привет' });
  });

  it('throws TelegramConfigError when no token is configured', async () => {
    const client = new BotApiTelegramClient({
      token: '',
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
    });
    await expect(client.sendMessage({ chatId: '1', text: 'x' })).rejects.toBeInstanceOf(
      TelegramConfigError,
    );
  });

  it('throws TelegramDeliveryError on a non-2xx response', async () => {
    const client = new BotApiTelegramClient({
      token: 'T',
      fetchImpl: (async () =>
        new Response('nope', { status: 500 })) as unknown as typeof fetch,
    });
    await expect(client.sendMessage({ chatId: '1', text: 'x' })).rejects.toBeInstanceOf(
      TelegramDeliveryError,
    );
  });

  it('throws TelegramDeliveryError when Telegram replies ok:false', async () => {
    const client = new BotApiTelegramClient({
      token: 'T',
      fetchImpl: (async () =>
        okResponse({ ok: false, description: 'chat not found' })) as unknown as typeof fetch,
    });
    await expect(client.sendMessage({ chatId: '1', text: 'x' })).rejects.toBeInstanceOf(
      TelegramDeliveryError,
    );
  });

  it('throws TelegramDeliveryError on a network error', async () => {
    const client = new BotApiTelegramClient({
      token: 'T',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    await expect(client.sendMessage({ chatId: '1', text: 'x' })).rejects.toBeInstanceOf(
      TelegramDeliveryError,
    );
  });
});
