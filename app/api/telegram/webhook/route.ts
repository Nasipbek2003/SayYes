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
import { authorRepo } from '@/lib/repositories';
import {
  linkTelegramFromUpdate,
  type TelegramUpdate,
} from '@/lib/notifications/telegramLink';

export const runtime = 'nodejs';

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

  // 3) Link the chat to the author when this is a valid /start <code> command.
  const result = await linkTelegramFromUpdate(update, {
    setTelegramChatId: authorRepo.setTelegramChatId,
  });

  return Response.json({ ok: true, linked: result.ok }, { status: 200 });
}
