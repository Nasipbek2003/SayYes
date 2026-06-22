/**
 * Author session as a signed JWT in an httpOnly cookie (task 4.1).
 *
 * We use **jose** for signing/verification rather than `jsonwebtoken`:
 * jose is dependency-free and runs on the Web Crypto API, so the exact same
 * code works in Node.js Route Handlers AND in the Edge runtime used by Next.js
 * `middleware.ts`. That lets middleware cheaply reject unauthenticated requests
 * without pulling a Node-only crypto library into the Edge bundle.
 *
 * The session is an HS256 JWT signed with `SESSION_SECRET`. It carries the
 * author id as the `sub` claim plus standard `iat`/`exp`. We deliberately keep
 * the payload minimal — no email or Telegram id — so the cookie never leaks
 * private author data (aligns with the token-privacy posture in the design).
 */
import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/lib/env';

/** Name of the httpOnly session cookie. */
export const SESSION_COOKIE_NAME = 'sayyes_session';

/** Default session lifetime: 30 days (seconds). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const ISSUER = 'sayyes';
const AUDIENCE = 'sayyes-author';

/**
 * Resolve the signing secret at call time (not module load) so tests and
 * runtime can configure `SESSION_SECRET` via the environment. Throws when the
 * secret is missing so we never sign sessions with an empty key.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || env.sessionSecret;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  /** The authenticated author's id. */
  authorId: string;
}

/**
 * Issue a signed session JWT for an author.
 *
 * @param authorId  the authenticated author's id (becomes the `sub` claim)
 * @param ttlSeconds  lifetime in seconds (defaults to {@link SESSION_TTL_SECONDS})
 */
export async function issueSessionToken(
  authorId: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  // `getSecretKey` may throw when SESSION_SECRET is unset; being async ensures
  // that surfaces as a rejected promise for consistent caller handling.
  const key = getSecretKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(authorId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/**
 * Verify a session JWT and extract its claims.
 *
 * Returns the {@link SessionClaims} on success, or `null` when the token is
 * missing, malformed, tampered with, expired, or signed with the wrong key.
 * Never throws for an invalid token — callers branch on `null`.
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }
    return { authorId: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Cookie attributes for the session cookie.
 *
 * `secure` is enabled outside development so the cookie only travels over
 * HTTPS in production. `httpOnly` keeps it out of JS; `sameSite: 'lax'` allows
 * the magic-link GET redirect to carry it while blocking cross-site POSTs.
 */
export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  const isProd = (process.env.NODE_ENV || env.nodeEnv) === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
