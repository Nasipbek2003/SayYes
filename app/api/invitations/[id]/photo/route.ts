/**
 * POST /api/invitations/:id/photo — upload an author photo (task 4.3, Req 2.2).
 *
 * Auth: author (401 when no session). Ownership enforced (403 for someone
 * else's invitation, Requirement 10.4); unknown id → 404.
 *
 * Body: `multipart/form-data` with a single `file` field (JPEG/PNG/WebP/GIF,
 * ≤ 7 MB). The file is validated and forwarded to Cloudinary via a server-side
 * signed upload (see {@link uploadImage}); the resulting public URL is returned
 * as `{ url }` for the client to store on the invitation's `data`.
 *
 * Invalid type / oversized / empty files are rejected with 400 and a clear
 * message; a storage misconfiguration surfaces as 500, an upstream failure as
 * 502 — never a bare crash.
 */
import { authErrorToResponse } from '@/lib/auth';
import { assertOwnership } from '@/lib/auth/guards';
import { requireAuthor } from '@/lib/auth/nextCookies';
import { invitationRepo } from '@/lib/repositories';
import { StorageError, uploadImage, validateImage } from '@/lib/storage/cloudinary';

export const runtime = 'nodejs';

export async function POST(
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

  const invitation = await invitationRepo.findById(id);
  if (!invitation) {
    return Response.json({ error: 'Invitation not found' }, { status: 404 });
  }
  try {
    assertOwnership(authorId, invitation.authorId);
  } catch (error) {
    return authErrorToResponse(error);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: 'Expected multipart form data with a `file` field.' },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing `file`.' }, { status: 400 });
  }

  try {
    validateImage({ type: file.type, size: file.size });
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadImage(buffer, {
      contentType: file.type,
      // Namespace uploads per invitation so a later privacy purge can target them.
      folder: `sayyes/${id}`,
    });
    return Response.json({ url }, { status: 200 });
  } catch (error) {
    if (error instanceof StorageError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json({ error: 'Не удалось загрузить фото.' }, { status: 500 });
  }
}
