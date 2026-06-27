/**
 * GET /api/telegram/contact?username=<@user> — check whether the bot can write
 * to a given Telegram nickname.
 *
 * The Bot API can only message a user by numeric `chat.id`, which we only learn
 * once that user has messaged the bot (pressed Start). This endpoint reports
 * whether we already captured that mapping for the supplied `@username`, so the
 * create form can tell the author "you're connected" or "open the bot and press
 * Start" before they rely on notifications.
 *
 * Auth: author session (the create flow is an author operation). Returns:
 *  - `{ valid: false }`            — the input isn't a valid Telegram username;
 *  - `{ valid: true, linked: bool }` — whether the bot can reach this user.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { telegramContactRepo } from '@/lib/repositories';
import { normalizeTelegramUsername } from '@/lib/notifications/telegramUsername';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const username = normalizeTelegramUsername(searchParams.get('username'));

  if (!username) {
    return Response.json({ valid: false, linked: false }, { status: 200 });
  }

  const contact = await telegramContactRepo.findByUsername(username);
  return Response.json(
    { valid: true, linked: contact !== null, username },
    { status: 200 },
  );
}
