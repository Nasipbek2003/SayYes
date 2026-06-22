/**
 * Telegram client abstraction (task 9.2).
 *
 * The outbox worker delivers author notifications through the
 * {@link TelegramClient} interface only, so the real Bot API can be swapped for
 * an in-memory fake in tests (mirroring the `PaymentProvider` pattern). The
 * concrete {@link BotApiTelegramClient} posts to `api.telegram.org` with the
 * bot token from the environment (`TELEGRAM_BOT_TOKEN`); the worker never talks
 * to `fetch` directly.
 */
import { env } from '@/lib/env';

/** A single Telegram message to deliver to an author's chat. */
export interface TelegramMessage {
  /** Target chat id (the author's linked `telegramChatId`). */
  chatId: string;
  /** Message text to send. */
  text: string;
}

/**
 * The contract the outbox worker depends on. Kept tiny: delivering a chat
 * message is the only capability the worker needs.
 */
export interface TelegramClient {
  /**
   * Deliver a message. Resolves on success; throws on any delivery failure
   * (network error, non-2xx response, Telegram `ok: false`) so the worker can
   * apply its retry / fail policy.
   */
  sendMessage(message: TelegramMessage): Promise<void>;
}

/** Error raised when the Telegram Bot API rejects or fails a delivery. */
export class TelegramDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramDeliveryError';
  }
}

/** Error raised when the client is constructed/used without a bot token. */
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramConfigError';
  }
}

/**
 * Real client backed by the Telegram Bot API.
 *
 * Calls `POST https://api.telegram.org/bot<token>/sendMessage`. A missing token
 * or any non-ok response surfaces as a {@link TelegramDeliveryError} /
 * {@link TelegramConfigError} so the worker retries (transient) or eventually
 * marks the row FAILED (persistent).
 */
export class BotApiTelegramClient implements TelegramClient {
  private readonly token: string;
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    options: {
      /** Bot token; defaults to `TELEGRAM_BOT_TOKEN` from the environment. */
      token?: string;
      /** Override the API base (defaults to api.telegram.org). */
      apiBase?: string;
      /** Override `fetch` (defaults to the global). */
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    this.token = options.token ?? env.telegram.botToken;
    this.apiBase = (options.apiBase ?? 'https://api.telegram.org').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendMessage({ chatId, text }: TelegramMessage): Promise<void> {
    if (!this.token) {
      throw new TelegramConfigError('TELEGRAM_BOT_TOKEN is not configured');
    }

    const url = `${this.apiBase}/bot${this.token}/sendMessage`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (cause) {
      throw new TelegramDeliveryError(
        `Telegram request failed: ${(cause as Error).message}`,
      );
    }

    if (!res.ok) {
      throw new TelegramDeliveryError(
        `Telegram responded with HTTP ${res.status}`,
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TelegramDeliveryError('Telegram returned a non-JSON response');
    }

    if (!body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) {
      const description =
        (body as { description?: unknown })?.description ?? 'unknown error';
      throw new TelegramDeliveryError(`Telegram delivery rejected: ${description}`);
    }
  }
}

/** Resolve the configured {@link TelegramClient} for the worker. */
export function getTelegramClient(): TelegramClient {
  return new BotApiTelegramClient();
}
