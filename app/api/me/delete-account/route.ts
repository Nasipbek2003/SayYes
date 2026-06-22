/**
 * DELETE /api/me/delete-account — permanently delete the author's account
 * and all associated data (invitations, responses, opens, payments, outbox).
 *
 * This is an irreversible operation. Requires an authenticated session.
 * After deletion, the session cookie is cleared and the user is logged out.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth';

export const runtime = 'nodejs';

export async function DELETE(): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  // Cascade delete all author data in a transaction.
  await prisma.$transaction(async (tx) => {
    const invitations = await tx.invitation.findMany({
      where: { authorId },
      select: { id: true },
    });
    const invitationIds = invitations.map((i) => i.id);

    if (invitationIds.length > 0) {
      await tx.response.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.openEvent.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.payment.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.notificationOutbox.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.invitation.deleteMany({ where: { authorId } });
    }

    await tx.magicLinkToken.deleteMany({ where: { authorId } });
    await tx.notificationOutbox.deleteMany({ where: { authorId } });
    await tx.author.delete({ where: { id: authorId } });
  });

  logger.info('account-deleted', { authorId });

  // Clear the session cookie.
  const opts = sessionCookieOptions();
  const cookie = `${SESSION_COOKIE_NAME}=; Path=${opts.path}; Max-Age=0; HttpOnly; SameSite=${capitalize(opts.sameSite ?? 'lax')}`;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
