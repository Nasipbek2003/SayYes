/**
 * POST /api/telegram/webhook — Telegram Bot update receiver (task 9.3).
 *
 * Auth: Telegram's secret token. When `TELEGRAM_WEBHOOK_SECRET` is configured
 * Telegram echoes it in the `X-Telegram-Bot-Api-Secret-Token` header (set when
 * registering the webhook); a mismatch → 401. This stops third parties from
 * spoofing updates and linking arbitrary chats.
 *
 * The handler processes `/start <code>` deep-link commands: it verifies the
 * signed link code and binds the sender's `chat.id` to the bound author
 * (Requirement 9.5). After linking, the outbox worker delivers any events that
 * had accumulated as PENDING while the author was unlinked.
 *
 * We always return 200 for a parseable, authenticated update (even non-`/start`
 * messages or invalid codes) so Telegram doesn't retry endlessly; only a bad
 * secret (401) or unparseable body (400) is rejected.
 */
import { env } from '@/lib/env';
import { authorRepo, telegramContactRepo } from '@/lib/repositories';
import {
  captureTelegramContact,
  linkTelegramFromUpdate,
  type TelegramUpdate,
} from '@/lib/notifications/telegramLink';
import { getTelegramClient } from '@/lib/notifications/telegram';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** Friendly reply so the user sees the bot reacted to /start. */
async function replyToStart(
  update: TelegramUpdate,
  captured: string | null,
): Promise<void> {
  const text = update.message?.text ?? '';
  if (!/^\/start(?:@\w+)?\b/.test(text.trim())) return;

  const chatId = update.message?.chat?.id;
  if (chatId == null || chatId === '') return;

  const username = update.message?.from?.username;
  const greeting = captured
    ? `Готово! Я запомнил тебя (@${username}). Теперь, когда кто-то ответит на твоё приглашение, я пришлю уведомление сюда. 💌`
    : 'Привет! Чтобы получать уведомления об ответах на приглашения, у твоего аккаунта должен быть публичный @username (Настройки → Имя пользователя). Добавь его и нажми /start ещё раз.';

  try {
    await getTelegramClient().sendMessage({ chatId: String(chatId), text: greeting });
  } catch (error) {
    logger.warn('telegram-start-reply-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  // 1) Verify the Telegram secret token, when configured.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || env.telegram.webhookSecret;
  if (expected) {
    const provided = request.headers.get('x-telegram-bot-api-secret-token');
    if (provided !== expected) {
      return Response.json({ error: 'Invalid secret token' }, { status: 401 });
    }
  }

  // 2) Parse the update body.
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 3) Remember the sender's @username → chat.id so invitations that name this
  //    nickname (notifyTelegram) can be delivered later. Best-effort.
  const capturedUsername = await captureTelegramContact(update, {
    upsert: telegramContactRepo.upsert,
  });

  // 4) Link the chat to the author when this is a valid /start <code> command.
  const result = await linkTelegramFromUpdate(update, {
    setTelegramChatId: authorRepo.setTelegramChatId,
  });

  // 5) Acknowledge a /start so the user gets visible confirmation.
  await replyToStart(update, capturedUsername);

  return Response.json({ ok: true, linked: result.ok }, { status: 200 });
}
