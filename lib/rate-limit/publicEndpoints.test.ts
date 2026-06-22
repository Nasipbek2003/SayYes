/**
 * Tests for the public-endpoint rate-limit wiring (task 11.2).
 *
 * Covers client-IP extraction from proxy headers, the limiter key shape, and
 * {@link enforcePublicRateLimit} producing a graceful `429` (with `Retry-After`
 * and a `rate_limited` reason) once the per-(token+IP) budget is exhausted.
 *
 * **Validates: Requirements 4.4**
 */
import { describe, expect, it } from 'vitest';

import {
  PUBLIC_RATE_LIMITS,
  clientIpFromHeaders,
  enforcePublicRateLimit,
  rateLimitKey,
} from './publicEndpoints';

describe('clientIpFromHeaders', () => {
  it('takes the left-most x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' });
    expect(clientIpFromHeaders(h)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip then to "unknown"', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.5' }))).toBe(
      '198.51.100.5',
    );
    expect(clientIpFromHeaders(new Headers())).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('namespaces by action and scopes to token + ip', () => {
    expect(rateLimitKey('open', 'tok1', '203.0.113.7')).toBe('open:tok1:203.0.113.7');
  });
});

describe('enforcePublicRateLimit', () => {
  it('allows requests under the limit (no 429 response)', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.50' });
    const { result, response } = enforcePublicRateLimit('respond', 'tok-allow', headers);
    expect(result.allowed).toBe(true);
    expect(response).toBeNull();
  });

  it('returns a graceful 429 once the per-token+IP budget is exhausted', async () => {
    const ip = '203.0.113.99';
    const headers = new Headers({ 'x-forwarded-for': ip });
    const token = 'tok-throttle';

    // Exhaust the respond budget for this unique token+IP.
    for (let i = 0; i < PUBLIC_RATE_LIMITS.respond.limit; i++) {
      const { response } = enforcePublicRateLimit('respond', token, headers);
      expect(response).toBeNull();
    }

    const { result, response } = enforcePublicRateLimit('respond', token, headers);
    expect(result.allowed).toBe(false);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get('retry-after')).toBeTruthy();
    await expect(response!.json()).resolves.toMatchObject({ reason: 'rate_limited' });
  });

  it('keeps separate budgets per IP for the same token', () => {
    const token = 'tok-shared';
    // Exhaust IP A.
    for (let i = 0; i < PUBLIC_RATE_LIMITS.open.limit; i++) {
      enforcePublicRateLimit('open', token, new Headers({ 'x-forwarded-for': '10.1.1.1' }));
    }
    const blockedA = enforcePublicRateLimit(
      'open',
      token,
      new Headers({ 'x-forwarded-for': '10.1.1.1' }),
    );
    expect(blockedA.response).not.toBeNull();

    // A different IP still has its full budget for the same token.
    const freshB = enforcePublicRateLimit(
      'open',
      token,
      new Headers({ 'x-forwarded-for': '10.2.2.2' }),
    );
    expect(freshB.response).toBeNull();
  });
});
