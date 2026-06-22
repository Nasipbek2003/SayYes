/**
 * POST /api/invitations  — create a draft invitation (task 4.2).
 *
 * Auth: author (401 when no session). Body:
 *   { templateId: string, themeId: string, data?: object }
 *
 * Delegates to {@link InvitationService.createDraft}, which validates the
 * structural invariants (known template → 404, valid theme → 400) but tolerates
 * partial `data` (Requirement 2.6 — drafts auto-save while still incomplete).
 * On success returns 201 with the created draft.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';
import { invitationErrorToResponse } from '@/lib/api/errorResponses';

export const runtime = 'nodejs';

interface CreateBody {
  templateId?: unknown;
  themeId?: unknown;
  data?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body?.templateId !== 'string' || typeof body?.themeId !== 'string') {
    return Response.json(
      { error: '`templateId` and `themeId` are required strings.' },
      { status: 400 },
    );
  }

  const data =
    body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};

  try {
    const invitation = await invitationService.createDraft(
      authorId,
      body.templateId,
      body.themeId,
      data,
    );
    return Response.json(invitation, { status: 201 });
  } catch (error) {
    return invitationErrorToResponse(error);
  }
}
