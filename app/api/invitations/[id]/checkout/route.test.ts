/**
 * Integration tests for the checkout Route Handler (task 5.1):
 *   POST /api/invitations/:id/checkout
 *
 * ## Testing approach
 * Auth (`requireAuthor` from `@/lib/auth/nextCookies`) and the
 * {@link PaymentService} singleton are mocked, so these tests cover the HTTP
 * adapter only: auth gating, tier validation, ownership/404/409 status mapping
 * and that the checkout URL is returned. The real {@link PaymentServiceError}
 * class is kept so `paymentErrorToResponse` maps domain errors to the right
 * status.
 *
 * **Validates: Requirements 3.1, 3.2**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/guards';
import { PaymentServiceError } from '@/lib/services/payment';

const requireAuthor = vi.fn();
const startCheckout = vi.fn();

vi.mock('@/lib/auth/nextCookies', () => ({
  requireAuthor: () => requireAuthor(),
}));

vi.mock('@/lib/services/payment', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/payment')>(
    '@/lib/services/payment',
  );
  return {
    ...actual,
    paymentService: {
      startCheckout: (...args: unknown[]) => startCheckout(...args),
    },
  };
});

// Import the handler AFTER the mocks are registered.
const { POST } = await import('./route');

const AUTHOR = 'author-1';

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/invitations/inv-1/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = (id = 'inv-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthor.mockResolvedValue(AUTHOR);
});

describe('POST /api/invitations/:id/checkout', () => {
  it('starts a basic checkout and returns the checkoutUrl with 200', async () => {
    startCheckout.mockResolvedValue('https://pay.example/sess_1');

    const res = await POST(postReq({ tier: 'basic' }), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      checkoutUrl: 'https://pay.example/sess_1',
    });
    expect(startCheckout).toHaveBeenCalledWith('inv-1', AUTHOR, 'basic');
  });

  it('starts a premium checkout', async () => {
    startCheckout.mockResolvedValue('https://pay.example/sess_2');

    const res = await POST(postReq({ tier: 'premium' }), params());

    expect(res.status).toBe(200);
    expect(startCheckout).toHaveBeenCalledWith('inv-1', AUTHOR, 'premium');
  });

  it('returns 400 for a missing or invalid tier (no service call)', async () => {
    const res = await POST(postReq({ tier: 'gold' }), params());
    expect(res.status).toBe(400);
    expect(startCheckout).not.toHaveBeenCalled();

    const res2 = await POST(postReq({}), params());
    expect(res2.status).toBe(400);
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthor.mockRejectedValue(new AuthError(401, 'Authentication required'));

    const res = await POST(postReq({ tier: 'basic' }), params());
    expect(res.status).toBe(401);
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("returns 403 for another author's invitation (Requirement 10.4)", async () => {
    startCheckout.mockRejectedValue(new AuthError(403, 'forbidden'));

    const res = await POST(postReq({ tier: 'basic' }), params());
    expect(res.status).toBe(403);
  });

  it('returns 404 for a missing invitation', async () => {
    startCheckout.mockRejectedValue(
      new PaymentServiceError(404, 'not found', 'not_found'),
    );

    const res = await POST(postReq({ tier: 'basic' }), params('missing'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'not_found' });
  });

  it('returns 409 when the invitation is not a DRAFT', async () => {
    startCheckout.mockRejectedValue(
      new PaymentServiceError(409, 'not draft', 'not_draft'),
    );

    const res = await POST(postReq({ tier: 'basic' }), params());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'not_draft' });
  });
});
