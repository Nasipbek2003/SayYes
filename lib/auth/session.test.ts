/**
 * Unit tests for the session JWT layer (task 4.1).
 *
 * Covers issuing and verifying the signed session token: a valid token round
 * trips, an expired token is rejected, a tampered/forged token is rejected, and
 * a token signed with a different secret is rejected. No database is involved —
 * this is pure crypto logic driven by `SESSION_SECRET`.
 */
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  issueSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from './session';

const SECRET = 'test-session-secret-value';

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.NODE_ENV;
});

describe('issueSessionToken / verifySessionToken', () => {
  it('round-trips a valid session and returns the author id', async () => {
    const token = await issueSessionToken('author-1');
    const claims = await verifySessionToken(token);
    expect(claims).toEqual({ authorId: 'author-1' });
  });

  it('returns null for a missing/empty token', async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken('')).toBeNull();
  });

  it('rejects an expired token', async () => {
    // Issue a token that expired one second ago.
    const token = await issueSessionToken('author-1', -1);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('rejects a tampered/garbage token', async () => {
    const token = await issueSessionToken('author-1');
    const tampered = `${token}x`;
    expect(await verifySessionToken(tampered)).toBeNull();
    expect(await verifySessionToken('not.a.jwt')).toBeNull();
  });

  it('rejects a token signed with a different secret (forgery)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('attacker')
      .setIssuer('sayyes')
      .setAudience('sayyes-author')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode('a-totally-different-secret'));

    expect(await verifySessionToken(forged)).toBeNull();
  });

  it('rejects a token with a wrong issuer/audience', async () => {
    const now = Math.floor(Date.now() / 1000);
    const wrongAud = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('author-1')
      .setIssuer('someone-else')
      .setAudience('someone-else')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(SECRET));

    expect(await verifySessionToken(wrongAud)).toBeNull();
  });

  it('throws when signing without a configured secret', async () => {
    delete process.env.SESSION_SECRET;
    await expect(issueSessionToken('author-1')).rejects.toThrow(
      /SESSION_SECRET/,
    );
  });
});

describe('sessionCookieOptions', () => {
  it('is httpOnly + lax + rooted at / and not secure in development', () => {
    process.env.NODE_ENV = 'development';
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.secure).toBe(false);
  });

  it('is secure in production', () => {
    process.env.NODE_ENV = 'production';
    expect(sessionCookieOptions().secure).toBe(true);
  });
});
