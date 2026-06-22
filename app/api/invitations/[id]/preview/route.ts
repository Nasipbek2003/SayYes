/**
 * GET /api/invitations/:id/preview — payload for rendering an invitation
 * preview before payment (task 4.4, Requirement 2.5).
 *
 * Auth: author (401 when no session). Ownership enforced (403 for someone
 * else's invitation, Requirement 10.4); unknown id → 404; unknown template on
 * the stored draft → 404.
 *
 * Delegates to {@link InvitationService.preview}, which assembles the render
 * payload (template metadata + screens, author `{{переменные}}`, normalised
 * place list, theme and readiness validation) from the stored draft. The
 * preview is tolerant of partial data — it always renders work-in-progress and
 * reports outstanding required fields in `validation` rather than failing.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';
import { invitationErrorToResponse } from '@/lib/api/errorResponses';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { id } = await context.params;

  try {
    const payload = await invitationService.preview(id, authorId);
    return Response.json(payload, { status: 200 });
  } catch (error) {
    return invitationErrorToResponse(error);
  }
}
