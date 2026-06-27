/**
 * PATCH /api/invitations/:id — update a draft (auto-save) or run an explicit
 * readiness validation (task 4.2).
 *
 * Auth: author (401). Ownership enforced (403 for someone else's invitation,
 * Requirement 10.4); editing a non-DRAFT invitation → 409; unknown id → 404.
 *
 * Two modes, distinguished by the body:
 *
 *  - **Auto-save** (Requirement 2.6) — default. Body:
 *      { data?: object, themeId?: string }
 *    Merges `data` into the stored draft and/or switches the theme. Tolerant of
 *    partial data; returns 200 with the updated draft.
 *
 *  - **Validation** (Requirement 2.3) — when `{ validate: true }` is sent.
 *    Runs full author-data validation against the stored draft and returns the
 *    {@link ValidationResult} `{ ok, errors[] }`. `ok: false` is returned with
 *    HTTP 200 (the request succeeded; the *data* has field errors) so the
 *    client can render per-field messages and block the next step. This is the
 *    explicit "check my fields" path kept separate from auto-save, which never
 *    rejects an incomplete draft.
 */
import { authErrorToResponse } from '@/lib/auth';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';
import { invitationErrorToResponse } from '@/lib/api/errorResponses';

export const runtime = 'nodejs';

interface PatchBody {
  validate?: unknown;
  data?: unknown;
  themeId?: unknown;
  notifyTelegram?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let authorId: string;
  try {
    authorId = await requireAuthor();
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { id } = await context.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Explicit readiness validation path (Requirement 2.3).
  if (body?.validate === true) {
    try {
      const result = await invitationService.validateForActivation(id, authorId);
      return Response.json(result, { status: 200 });
    } catch (error) {
      return invitationErrorToResponse(error);
    }
  }

  // Auto-save path (Requirement 2.6).
  if (body?.themeId !== undefined && typeof body.themeId !== 'string') {
    return Response.json({ error: '`themeId` must be a string.' }, { status: 400 });
  }
  if (
    body?.data !== undefined &&
    (typeof body.data !== 'object' || body.data === null || Array.isArray(body.data))
  ) {
    return Response.json({ error: '`data` must be an object.' }, { status: 400 });
  }
  if (
    body?.notifyTelegram !== undefined &&
    body.notifyTelegram !== null &&
    typeof body.notifyTelegram !== 'string'
  ) {
    return Response.json(
      { error: '`notifyTelegram` must be a string or null.' },
      { status: 400 },
    );
  }

  try {
    const invitation = await invitationService.updateDraft(id, authorId, {
      data: body.data as Record<string, unknown> | undefined,
      themeId: body.themeId as string | undefined,
      notifyTelegram: body.notifyTelegram as string | null | undefined,
    });
    return Response.json(invitation, { status: 200 });
  } catch (error) {
    return invitationErrorToResponse(error);
  }
}
