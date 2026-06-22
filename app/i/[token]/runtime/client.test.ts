/**
 * Tests for the runtime API client wrappers (tasks 7.4 / 11.2).
 *
 * Verifies that {@link postOpen} / {@link postRespond} never throw and degrade
 * gracefully on a `429` throttle (Requirement 4.4): a throttled open returns
 * `false` (scenario still starts) and a throttled respond returns
 * `{ ok: false, rateLimited: true }` (distinct from a validation rejection), so
 * the guest is never shown a technical error.
 *
 * **Validates: Requirements 4.4, 5.5, 8.5**
 */
import { describe, expect, it, vi } from 'vitest';

import { postOpen, postRespond } from './client';
import type { GuestResponse } from '@/templates/types';

const ACCEPTED: GuestResponse = { type: 'accepted', place: 'Парк' } as GuestResponse;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('postOpen', () => {
  it('returns true on a 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(postOpen('tok', fetchImpl as unknown as typeof fetch)).resolves.toBe(true);
  });

  it('returns false on a 429 throttle without throwing (Req 4.4)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, { reason: 'rate_limited' }));
    await expect(postOpen('tok', fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });

  it('returns false on a network error (does not block the scenario)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(postOpen('tok', fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });
});

describe('postRespond', () => {
  it('returns ok=true on a 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(
      postRespond('tok', ACCEPTED, fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ ok: true });
  });

  it('flags rateLimited on a 429, distinct from a validation rejection (Req 4.4)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, { reason: 'rate_limited' }));
    const result = await postRespond('tok', ACCEPTED, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, rateLimited: true });
    expect(result.errors).toBeUndefined();
  });

  it('returns errors (not rateLimited) on a 400 validation rejection', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { errors: [{ field: 'place' }] }));
    const result = await postRespond('tok', ACCEPTED, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBeUndefined();
    expect(result.errors).toEqual([{ field: 'place' }]);
  });

  it('returns ok=false on a network error without throwing', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      postRespond('tok', ACCEPTED, fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ ok: false });
  });
});
