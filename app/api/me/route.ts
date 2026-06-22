/**
 * GET /api/me
 *
 * Returns the authenticated author's public profile. Demonstrates the
 * `requireAuthor` guard: responds 401 when there is no valid session.
 */
import { authErrorToResponse } from '@/lib/auth';
import { getCurrentAuthor, requireAuthor } from '@/lib/auth/nextCookies';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const author = await getCurrentAuthor();
  if (!author) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Only expose non-sensitive fields — never email/telegram secrets verbatim.
  return Response.json({
    id: author.id,
    email: author.email,
    hasTelegram: author.telegramChatId != null,
  });
}
