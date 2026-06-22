/**
 * Integration tests for the preview Route Handler (task 4.4):
 *   GET /api/invitations/:id/preview
 *
 * ## Testing approach
 * Auth (`requireAuthor` from `@/lib/auth/nextCookies`) and the
 * {@link InvitationService} singleton are mocked, so these tests cover the HTTP
 * adapter only: auth gating, ownership/404 status mapping and that a correct
 * payload is returned. The real {@link InvitationServiceError} class is kept so
 * `invitationErrorToResponse` maps domain errors to the right status.
 *
 * **Validates: Requirements 2.5, 10.4**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/guards';
import { InvitationServiceError } from '@/lib/services/invitation';

const requireAuthor = vi.fn();
const preview = vi.fn();

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
      preview: (...args: unknown[]) => preview(...args),
    },
  };
});

// Import the handler AFTER the mocks are registered.
const { GET } = await import('./route');

const AUTHOR = 'author-1';

function getReq(): Request {
  return new Request('http://localhost/api/invitations/inv-1/preview', {
    method: 'GET',
  });
}

const params = (id = 'inv-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthor.mockResolvedValue(AUTHOR);
});

describe('GET /api/invitations/:id/preview', () => {
  it('returns the preview payload with 200', async () => {
    const payload = {
      invitationId: 'inv-1',
      templateId: 'simple-date',
      themeId: 'romantic',
      tier: 'BASIC',
      status: 'DRAFT',
      template: {
        name: 'Приглашение на свидание',
        description: 'desc',
        startScreen: 'intro',
        screens: [{ id: 'intro' }],
        premiumFeatures: [],
      },
      data: { имя_адресата: 'Айя' },
      places: [],
      validation: { ok: true, errors: [] },
    };
    preview.mockResolvedValue(payload);

    const res = await GET(getReq(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      invitationId: 'inv-1',
      templateId: 'simple-date',
    });
    expect(preview).toHaveBeenCalledWith('inv-1', AUTHOR);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthor.mockRejectedValue(new AuthError(401, 'Authentication required'));

    const res = await GET(getReq(), params());
    expect(res.status).toBe(401);
    expect(preview).not.toHaveBeenCalled();
  });

  it("returns 403 for another author's invitation (Requirement 10.4)", async () => {
    preview.mockRejectedValue(new AuthError(403, 'forbidden'));

    const res = await GET(getReq(), params());
    expect(res.status).toBe(403);
  });

  it('returns 404 for a missing invitation', async () => {
    preview.mockRejectedValue(
      new InvitationServiceError(404, 'not found', 'not_found'),
    );

    const res = await GET(getReq(), params('missing'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'not_found' });
  });
});
