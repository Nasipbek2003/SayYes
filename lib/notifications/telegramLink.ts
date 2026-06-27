/**
 * Telegram account linking — link codes & deep-links (task 9.3, Requirement 9.5).
 *
 * ## Mechanism (chosen for the MVP)
 *
 * An author links Telegram with a short-lived, signed **link code** + a Bot
 * deep-link, so no extra DB table/migration is needed:
 *
 *  1. The authenticated author calls `POST /api/me/telegram/link`. The server
 *     mints a link code — an HS256 JWT carrying the author id (signed with
 *     `SESSION_SECRET`, audience `sayyes-telegram-link`, short TTL) — and
 *     returns a `t.me/<bot>?start=<code>` deep-link.
 *  2. The author opens the link and presses Start in Telegram. Telegram sends
 *     the bot an update `{"message": {"text": "/start <code>", "chat": {...}}}`.
 *  3. The bot webhook (`POST /api/telegram/webhook`) verifies the code, extracts
 *     the author id and the sender's `chat.id`, and stores it on the author via
 *     `authorRepo.setTelegramChatId`.
 *
 * Once linked, the outbox worker (task 9.2) finds the author's `telegramChatId`
 * and delivers any events that had been accumulating as PENDING while unlinked.
 *
 * The code is signed (not stored) so it can't be forged: a tampered or expired
 * code fails verification and links nothing. We use **jose** for parity with the
 * session layer (Web-Crypto, works in Node and Edge runtimes).
 */
import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/lib/env';
import { normalizeTelegramUsername } from '@/lib/notifications/telegramUsername';

/** Link-code lifetime: 15 minutes (seconds). */
export const TELEGRAM_LINK_TTL_SECONDS = 60 * 15;

const ISSUER = 'sayyes';
const AUDIENCE = 'sayyes-telegram-link';

/**
 * Resolve the signing secret at call time (mirrors the session layer) so tests
 * and runtime can configure `SESSION_SECRET` via the environment. Throws when
 * the secret is missing so we never sign a link code with an empty key.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || env.sessionSecret;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Mint a signed link code that binds a Telegram chat to `authorId` once the
 * author presses Start in the bot. Short-lived and single-purpose.
 */
export async function issueLinkCode(
  authorId: string,
  ttlSeconds: number = TELEGRAM_LINK_TTL_SECONDS,
): Promise<string> {
  const key = getSecretKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(authorId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/**
 * Verify a link code and return the author id it binds, or `null` when the code
 * is missing, malformed, tampered with, expired, or signed with the wrong key.
 * Never throws for an invalid code — callers branch on `null`.
 */
export async function verifyLinkCode(
  code: string | undefined | null,
): Promise<string | null> {
  if (!code) return null;
  try {
    const { payload } = await jwtVerify(code, getSecretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Build the Telegram Bot deep-link the author opens to link their account:
 * `https://t.me/<botUsername>?start=<code>`.
 *
 * Returns `null` when `TELEGRAM_BOT_USERNAME` isn't configured, so the caller
 * can still surface the raw code (e.g. for a manual `/start <code>` flow).
 */
export function buildStartDeepLink(code: string): string | null {
  const username = (process.env.TELEGRAM_BOT_USERNAME || env.telegram.botUsername).replace(
    /^@/,
    '',
  );
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

/**
 * Parse the link code out of a Telegram `/start` command text.
 *
 * Telegram delivers the deep-link payload as the message text `"/start <code>"`
 * (the bot username suffix `/start@bot` is also tolerated). Returns the code, or
 * `null` when the text isn't a `/start` command with a payload.
 */
export function parseStartCommand(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = /^\/start(?:@\w+)?\s+(\S+)\s*$/.exec(text.trim());
  return match ? match[1] : null;
}

/** Minimal shape of the Telegram update we care about for linking. */
export interface TelegramUpdate {
  message?: {
    text?: string;
    from?: { username?: string };
    chat?: { id?: number | string };
  };
}

/** Author repo surface needed to persist a linked chat id (injectable for tests). */
export interface LinkAuthorRepo {
  setTelegramChatId: (id: string, telegramChatId: string) => Promise<unknown>;
}

/** Outcome of processing a Telegram update for account linking. */
export type LinkResult =
  | { ok: true; authorId: string; chatId: string }
  | { ok: false; reason: 'not_start' | 'invalid_code' | 'no_chat' };

/**
 * Process a Telegram webhook update: if it is a `/start <code>` command with a
 * valid link code, persist the sender's chat id on the bound author.
 *
 * Pure orchestration over an injectable {@link LinkAuthorRepo} and
 * {@link verifyLinkCode}, so the webhook route stays a thin adapter and the
 * linking logic is unit-testable without Prisma.
 */
export async function linkTelegramFromUpdate(
  update: TelegramUpdate,
  repo: LinkAuthorRepo,
): Promise<LinkResult> {
  const code = parseStartCommand(update.message?.text);
  if (!code) return { ok: false, reason: 'not_start' };

  const authorId = await verifyLinkCode(code);
  if (!authorId) return { ok: false, reason: 'invalid_code' };

  const rawChatId = update.message?.chat?.id;
  if (rawChatId == null || rawChatId === '') {
    return { ok: false, reason: 'no_chat' };
  }

  const chatId = String(rawChatId);
  await repo.setTelegramChatId(authorId, chatId);
  return { ok: true, authorId, chatId };
}

/** Contact repo surface needed to capture a username → chat id mapping. */
export interface ContactRepo {
  upsert: (username: string, chatId: string) => Promise<unknown>;
}

/**
 * Capture the sender's `@username → chat.id` mapping from any incoming message.
 *
 * The Bot API cannot message a user by `@username`, only by numeric `chat.id`,
 * which we only learn once that user writes to the bot. So on every update we
 * remember the mapping; later, an invitation whose `notifyTelegram` names this
 * username can be delivered (see the outbox worker). Best-effort: returns the
 * normalised username on success, or `null` when the update carries no usable
 * username/chat.
 */
export async function captureTelegramContact(
  update: TelegramUpdate,
  repo: ContactRepo,
): Promise<string | null> {
  const username = normalizeTelegramUsername(update.message?.from?.username);
  if (!username) return null;

  const rawChatId = update.message?.chat?.id;
  if (rawChatId == null || rawChatId === '') return null;

  await repo.upsert(username, String(rawChatId));
  return username;
}
