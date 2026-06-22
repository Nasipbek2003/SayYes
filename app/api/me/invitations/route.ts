/**
 * GET /api/me/invitations — the author's cabinet invitation list (task 10.3,
 * Requirements 10.1, 10.4).
 *
 * Auth: author (401 when no session). The list is scoped to the authenticated
 * author only — another author's invitations are never returned (Requirement
 * 10.4) — because {@link InvitationService.listForAuthor} queries by the
 * session author id.
 *
 * Returns 200 with `{ invitations: CabinetListItem[] }`, each carrying the
 * derived status badge ("черновик / активно / отвечено"), the public URL once
 * active, and the open/response counts (Requirement 10.1).
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';
import { invitationErrorToResponse } from '@/lib/api/errorResponses';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  try {
    const invitations = await invitationService.listForAuthor(authorId);
    return Response.json({ invitations }, { status: 200 });
  } catch (error) {
    return invitationErrorToResponse(error);
  }
}
