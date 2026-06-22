/**
 * POST /api/me/telegram/link — start linking the author's Telegram (task 9.3).
 *
 * Auth: requires an authenticated author session (`requireAuthor`). Responds
 * 401 when there is no valid session.
 *
 * Returns a short-lived signed link code and a `t.me/<bot>?start=<code>`
 * deep-link. The author opens the link and presses Start; the bot webhook
 * (`/api/telegram/webhook`) then binds the sender's chat id to this author
 * (see {@link linkTelegramFromUpdate}). Events that accumulated as PENDING while
 * the author was unlinked are delivered by the outbox worker on its next run
 * (Requirement 9.5).
 *
 * If the author is already linked we report it so the UI can skip the flow.
 */
import { authErrorToResponse } from '@/lib/auth';
import { getCurrentAuthor, requireAuthor } from '@/lib/auth/nextCookies';
import { buildStartDeepLink, issueLinkCode } from '@/lib/notifications/telegramLink';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const author = await getCurrentAuthor();
  if (!author) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (author.telegramChatId != null) {
    return Response.json({ alreadyLinked: true });
  }

  const code = await issueLinkCode(authorId);
  const deepLink = buildStartDeepLink(code);

  return Response.json({
    alreadyLinked: false,
    code,
    deepLink,
    // Manual fallback when no bot username is configured for a deep-link.
    instructions: deepLink
      ? 'Откройте ссылку и нажмите «Старт» в Telegram-боте.'
      : `Напишите боту команду: /start ${code}`,
  });
}
