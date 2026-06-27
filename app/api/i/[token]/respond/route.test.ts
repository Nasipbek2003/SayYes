/**
 * Integration tests for the public respond Route Handler (task 7.4):
 *   POST /api/i/:token/respond
 *
 * ## Testing approach
 * The {@link InvitationService} singleton is mocked, so these tests cover the
 * HTTP adapter only: body parsing, delegation to `recordResponse`, the
 * idempotent success payload (`updated`), and the mapping of a server-side
 * validation rejection to 400 with per-field errors (Property 5) and an
 * unavailable link to 404 (Requirement 4.4). The validation and idempotent
 * upsert behaviour themselves are unit-tested in
 * `lib/services/invitation.test.ts`.
 *
 * **Validates: Requirements 5.5, 8.5, 4.4**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvitationUnavailableError,
  ResponseValidationError,
} from '@/lib/services/invitation';

const recordResponse = vi.fn();

vi.mock('@/lib/services/invitation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/invitation')>(
    '@/lib/services/invitation',
  );
  return {
    ...actual,
    invitationService: {
      recordResponse: (...args: unknown[]) => recordResponse(...args),
    },
  };
});

vi.mock('@/lib/notifications/outboxWorker', () => ({
  outboxWorker: {
    processPending: vi.fn().mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      retried: 0,
      failed: 0,
      outcomes: [],
    }),
  },
}));

const { POST } = await import('./route');

function respondReq(body: unknown): Request {
  return new Request('http://localhost/api/i/tok123456789/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const params = (token = 'tok123456789') => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/i/:token/respond', () => {
  it('records a valid answer and returns updated=false the first time', async () => {
    recordResponse.mockResolvedValue({ response: { id: 'r1' }, updated: false });

    const res = await POST(respondReq({ type: 'accepted', place: 'Парк' }), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, updated: false });
    expect(recordResponse).toHaveBeenCalledWith('tok123456789', {
      type: 'accepted',
      place: 'Парк',
    });
  });

  it('reports updated=true when an existing answer is overwritten (Req 8.5)', async () => {
    recordResponse.mockResolvedValue({ response: { id: 'r1' }, updated: true });

    const res = await POST(respondReq({ type: 'rsvp', guestName: 'Аиша', rsvp: 'no' }), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, updated: true });
  });

  it('maps a validation rejection to 400 with errors (Property 5)', async () => {
    recordResponse.mockRejectedValue(
      new ResponseValidationError([
        { field: 'place', code: 'enum', message: 'not a known place' },
      ]),
    );

    const res = await POST(respondReq({ type: 'accepted', place: 'Марс' }), params());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      errors: [{ field: 'place', code: 'enum' }],
    });
  });

  it('maps an unavailable link to 404 with a reason (Req 4.4)', async () => {
    recordResponse.mockRejectedValue(new InvitationUnavailableError('consumed'));

    const res = await POST(respondReq({ type: 'accepted' }), params());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ reason: 'consumed' });
  });

  it('rejects invalid JSON with 400 (no service call)', async () => {
    const res = await POST(respondReq('{not json'), params());

    expect(res.status).toBe(400);
    expect(recordResponse).not.toHaveBeenCalled();
  });

  it('rejects a non-object body with 400 (no service call)', async () => {
    const res = await POST(respondReq([1, 2, 3]), params());

    expect(res.status).toBe(400);
    expect(recordResponse).not.toHaveBeenCalled();
  });

  it('returns 429 once the rate limit is exceeded (task 11.2)', async () => {
    recordResponse.mockResolvedValue({ response: { id: 'r1' }, updated: false });
    // Unique token + IP so this test owns a fresh limiter budget.
    const token = 'rate-respond-token';
    const ip = '203.0.113.202';
    const req = () =>
      new Request(`http://localhost/api/i/${token}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ type: 'accepted', place: 'Парк' }),
      });

    let last = await POST(req(), params(token));
    for (let i = 0; i < 100 && last.status !== 429; i++) {
      last = await POST(req(), params(token));
    }
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBeTruthy();
    await expect(last.json()).resolves.toMatchObject({ reason: 'rate_limited' });
  });
});
