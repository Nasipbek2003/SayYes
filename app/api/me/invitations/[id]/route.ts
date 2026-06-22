/**
 * GET /api/me/invitations/:id — cabinet detail for one invitation (task 10.3,
 * Requirements 10.2, 10.3, 8.6, 10.4).
 *
 * Auth: author (401 when no session). Ownership is enforced by
 * {@link InvitationService.getDetailForAuthor}: an author requesting another
 * author's invitation gets 403, and an unknown id gets 404 (Requirement 10.4).
 *
 * Returns 200 with the {@link CabinetDetail}: the public link, recorded opens,
 * the guest responses (Requirement 10.2) and — for the event template
 * ("event-rsvp") — the aggregated RSVP dashboard with guest list and totals
 * (Requirements 8.6, 10.3). `rsvp` is null for the non-event templates.
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
    const detail = await invitationService.getDetailForAuthor(id, authorId);
    return Response.json(detail, { status: 200 });
  } catch (error) {
    return invitationErrorToResponse(error);
  }
}
