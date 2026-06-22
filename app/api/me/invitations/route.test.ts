/**
 * Integration tests for the cabinet Route Handlers (task 10.3):
 *   GET /api/me/invitations
 *   GET /api/me/invitations/:id
 *
 * Auth (`requireAuthor`) and the {@link InvitationService} singleton are mocked,
 * so these cover the HTTP adapter only: auth gating and status-code mapping. The
 * real {@link InvitationServiceError} / {@link AuthError} classes drive the
 * error → status mapping.
 *
 * **Validates: Requirements 10.1, 10.2, 10.4**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/guards';
import { InvitationServiceError } from '@/lib/services/invitation';

const requireAuthor = vi.fn();
const listForAuthor = vi.fn();
const getDetailForAuthor = vi.fn();

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
      listForAuthor: (...args: unknown[]) => listForAuthor(...args),
      getDetailForAuthor: (...args: unknown[]) => getDetailForAuthor(...args),
    },
  };
});

const { GET: listGET } = await import('./route');
const { GET: detailGET } = await import('./[id]/route');

const AUTHOR = 'author-1';
const params = (id = 'inv-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthor.mockResolvedValue(AUTHOR);
});

describe('GET /api/me/invitations', () => {
  it('returns the author\u2019s list (200)', async () => {
    listForAuthor.mockResolvedValue([{ id: 'inv-1', cabinetStatus: 'active' }]);

    const res = await listGET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      invitations: [{ id: 'inv-1', cabinetStatus: 'active' }],
    });
    expect(listForAuthor).toHaveBeenCalledWith(AUTHOR);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthor.mockRejectedValue(new AuthError(401, 'Authentication required'));

    const res = await listGET();

    expect(res.status).toBe(401);
    expect(listForAuthor).not.toHaveBeenCalled();
  });
});

describe('GET /api/me/invitations/:id', () => {
  it('returns the detail (200)', async () => {
    getDetailForAuthor.mockResolvedValue({ id: 'inv-1', rsvp: null });

    const res = await detailGET(new Request('http://localhost'), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 'inv-1' });
    expect(getDetailForAuthor).toHaveBeenCalledWith('inv-1', AUTHOR);
  });

  it('returns 403 for another author\u2019s invitation (Req 10.4)', async () => {
    getDetailForAuthor.mockRejectedValue(new AuthError(403, 'forbidden'));

    const res = await detailGET(new Request('http://localhost'), params());

    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown invitation', async () => {
    getDetailForAuthor.mockRejectedValue(
      new InvitationServiceError(404, 'not found', 'not_found'),
    );

    const res = await detailGET(new Request('http://localhost'), params('missing'));

    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthor.mockRejectedValue(new AuthError(401, 'Authentication required'));

    const res = await detailGET(new Request('http://localhost'), params());

    expect(res.status).toBe(401);
    expect(getDetailForAuthor).not.toHaveBeenCalled();
  });
});
