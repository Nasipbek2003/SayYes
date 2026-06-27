/**
 * Integration tests for the public open Route Handler (task 7.4):
 *   POST /api/i/:token/open
 *
 * ## Testing approach
 * The {@link InvitationService} singleton is mocked, so these tests cover the
 * HTTP adapter only: delegation to `recordOpen`, the success payload
 * (`firstOpen`), and graceful mapping of an unavailable link to 404 with a
 * `reason` (Requirement 4.4) rather than a 500. The recording/idempotency
 * behaviour itself is unit-tested in `lib/services/invitation.test.ts`.
 *
 * **Validates: Requirements 9.1, 4.4**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvitationUnavailableError } from '@/lib/services/invitation';

const recordOpen = vi.fn();

vi.mock('@/lib/services/invitation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/invitation')>(
    '@/lib/services/invitation',
  );
  return {
    ...actual,
    invitationService: {
      recordOpen: (...args: unknown[]) => recordOpen(...args),
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

function openReq(ua = 'jest-UA'): Request {
  return new Request('http://localhost/api/i/tok123456789/open', {
    method: 'POST',
    headers: { 'user-agent': ua },
  });
}

const params = (token = 'tok123456789') => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/i/:token/open', () => {
  it('records the open and returns firstOpen=true on the first call', async () => {
    recordOpen.mockResolvedValue({ event: { id: 'o1' }, firstOpen: true });

    const res = await POST(openReq(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, firstOpen: true });
    expect(recordOpen).toHaveBeenCalledWith('tok123456789', 'jest-UA');
  });

  it('reports firstOpen=false on a repeat open (idempotent notification)', async () => {
    recordOpen.mockResolvedValue({ event: { id: 'o2' }, firstOpen: false });

    const res = await POST(openReq(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, firstOpen: false });
  });

  it('maps an unavailable link to 404 with a reason (Req 4.4)', async () => {
    recordOpen.mockRejectedValue(new InvitationUnavailableError('expired'));

    const res = await POST(openReq(), params());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ reason: 'expired' });
  });

  it('maps an unknown token to 404 not_found', async () => {
    recordOpen.mockRejectedValue(new InvitationUnavailableError('not_found'));

    const res = await POST(openReq(), params('nope'));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ reason: 'not_found' });
  });

  it('returns 429 once the rate limit is exceeded (task 11.2)', async () => {
    recordOpen.mockResolvedValue({ event: { id: 'o1' }, firstOpen: true });
    // Unique token + IP so this test owns a fresh limiter budget.
    const token = 'rate-open-token';
    const ip = '203.0.113.201';
    const req = () =>
      new Request(`http://localhost/api/i/${token}/open`, {
        method: 'POST',
        headers: { 'user-agent': 'jest-UA', 'x-forwarded-for': ip },
      });

    let last = await POST(req(), params(token));
    // Hammer until throttled (limit is generous; bound the loop defensively).
    for (let i = 0; i < 100 && last.status !== 429; i++) {
      last = await POST(req(), params(token));
    }
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBeTruthy();
    await expect(last.json()).resolves.toMatchObject({ reason: 'rate_limited' });
  });
});
