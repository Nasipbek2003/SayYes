/**
 * Integration tests for the invitation Route Handlers (task 4.2):
 *   POST   /api/invitations
 *   PATCH  /api/invitations/:id
 *
 * ## Testing approach
 * Auth (`requireAuthor` from `@/lib/auth/nextCookies`) and the
 * {@link InvitationService} singleton are mocked, so these tests cover the HTTP
 * adapter logic only: body parsing, status-code mapping and the auto-save vs.
 * validation routing. The real {@link InvitationServiceError} class is kept so
 * `invitationErrorToResponse` maps domain errors to the right status.
 *
 * **Validates: Requirements 2.1, 2.3, 2.6**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/guards';
import { InvitationServiceError } from '@/lib/services/invitation';

const requireAuthor = vi.fn();
const createDraft = vi.fn();
const updateDraft = vi.fn();
const validateForActivation = vi.fn();

vi.mock('@/lib/auth/nextCookies', () => ({
  requireAuthor: () => requireAuthor(),
}));

vi.mock('@/lib/services/invitation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/invitation')>(
    '@/lib/services/invitation',
  );
  return {
    ...actual,
    invitationService: {
      createDraft: (...args: unknown[]) => createDraft(...args),
      updateDraft: (...args: unknown[]) => updateDraft(...args),
      validateForActivation: (...args: unknown[]) => validateForActivation(...args),
    },
  };
});

// Import the handlers AFTER the mocks are registered.
const { POST } = await import('./route');
const { PATCH } = await import('./[id]/route');

const AUTHOR = 'author-1';

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/invitations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/invitations/inv-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const params = (id = 'inv-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthor.mockResolvedValue(AUTHOR);
});

describe('POST /api/invitations', () => {
  it('creates a draft and returns 201', async () => {
    createDraft.mockResolvedValue({ id: 'inv-1', status: 'DRAFT' });

    const res = await POST(
      postReq({ templateId: 'simple-date', themeId: 'romantic', data: { x: 1 } }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: 'inv-1' });
    expect(createDraft).toHaveBeenCalledWith(
      AUTHOR,
      'simple-date',
      'romantic',
      { x: 1 },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthor.mockRejectedValue(new AuthError(401, 'Authentication required'));

    const res = await POST(postReq({ templateId: 'simple-date', themeId: 'x' }));
    expect(res.status).toBe(401);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('returns 400 when templateId/themeId missing', async () => {
    const res = await POST(postReq({ templateId: 'simple-date' }));
    expect(res.status).toBe(400);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('maps an unknown-template service error to 404', async () => {
    createDraft.mockRejectedValue(
      new InvitationServiceError(404, 'Unknown template', 'template_not_found'),
    );

    const res = await POST(postReq({ templateId: 'nope', themeId: 'x' }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'template_not_found' });
  });

  it('maps an invalid-theme service error to 400', async () => {
    createDraft.mockRejectedValue(
      new InvitationServiceError(400, 'Bad theme', 'invalid_theme'),
    );

    const res = await POST(postReq({ templateId: 'simple-date', themeId: 'bad' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'invalid_theme' });
  });
});

describe('PATCH /api/invitations/:id (auto-save)', () => {
  it('merges data and returns 200', async () => {
    updateDraft.mockResolvedValue({ id: 'inv-1', data: { a: 1 } });

    const res = await PATCH(patchReq({ data: { a: 1 } }), params());

    expect(res.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith('inv-1', AUTHOR, {
      data: { a: 1 },
      themeId: undefined,
    });
  });

  it("returns 403 for another author's invitation", async () => {
    updateDraft.mockRejectedValue(new AuthError(403, 'forbidden'));
    const res = await PATCH(patchReq({ data: {} }), params());
    expect(res.status).toBe(403);
  });

  it('returns 409 when editing a non-DRAFT invitation', async () => {
    updateDraft.mockRejectedValue(
      new InvitationServiceError(409, 'Only drafts can be edited', 'not_draft'),
    );
    const res = await PATCH(patchReq({ data: {} }), params());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'not_draft' });
  });

  it('returns 404 for a missing invitation', async () => {
    updateDraft.mockRejectedValue(
      new InvitationServiceError(404, 'not found', 'not_found'),
    );
    const res = await PATCH(patchReq({ data: {} }), params('missing'));
    expect(res.status).toBe(404);
  });

  it('rejects a non-object data with 400 (no service call)', async () => {
    const res = await PATCH(patchReq({ data: 'oops' }), params());
    expect(res.status).toBe(400);
    expect(updateDraft).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/invitations/:id (validate mode, Requirement 2.3)', () => {
  it('returns the ValidationResult with field errors and HTTP 200', async () => {
    validateForActivation.mockResolvedValue({
      ok: false,
      errors: [{ field: 'подпись', code: 'required', message: 'required' }],
    });

    const res = await PATCH(patchReq({ validate: true }), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      errors: [{ field: 'подпись', code: 'required', message: 'required' }],
    });
    expect(validateForActivation).toHaveBeenCalledWith('inv-1', AUTHOR);
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('returns ok:true when the draft is complete', async () => {
    validateForActivation.mockResolvedValue({ ok: true, errors: [] });
    const res = await PATCH(patchReq({ validate: true }), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, errors: [] });
  });
});
