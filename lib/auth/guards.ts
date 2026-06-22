/**
 * Server-side auth guards for Route Handlers (task 4.1).
 *
 * - `getCurrentAuthorId` / `getCurrentAuthor`: read the session cookie and
 *   resolve the authenticated author (or null).
 * - `requireAuthor`: throws an {@link AuthError} (401) when there is no valid
 *   session; otherwise returns the author id.
 * - `assertOwnership`: throws an {@link AuthError} (403) when an author tries to
 *   access a resource they don't own (Requirement 10.4 — access to someone
 *   else's invitation is forbidden).
 *
 * Guards throw `AuthError` rather than returning `Response` objects so handlers
 * can compose them freely; `authErrorToResponse` turns a caught `AuthError`
 * into the appropriate JSON `Response`. Reading cookies is injectable so the
 * pure logic is testable without a live Next.js request.
 */
import { verifySessionToken } from './session';
import { authorRepo } from '@/lib/repositories';
import type { Author } from '@prisma/client';

/** Source of the session cookie value (abstracts Next.js `cookies()`). */
export type CookieReader = () => string | undefined | Promise<string | undefined>;

/** Error carrying the HTTP status a guard wants the handler to return. */
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Resolve the current author id from a session cookie value, or null.
 *
 * Accepts the raw cookie string directly so it works in any context (Route
 * Handler, middleware, tests). Returns null for missing/invalid/expired tokens.
 */
export function getAuthorIdFromCookie(
  cookieValue: string | undefined | null,
): Promise<string | null> {
  return verifySessionToken(cookieValue).then((claims) => claims?.authorId ?? null);
}

/**
 * Resolve the current author id using a {@link CookieReader}, or null.
 */
export async function getCurrentAuthorId(
  readCookie: CookieReader,
): Promise<string | null> {
  const value = await readCookie();
  return getAuthorIdFromCookie(value);
}

/**
 * Resolve the full current {@link Author} record using a {@link CookieReader},
 * or null when unauthenticated / the author no longer exists.
 */
export async function getCurrentAuthor(
  readCookie: CookieReader,
): Promise<Author | null> {
  const authorId = await getCurrentAuthorId(readCookie);
  if (!authorId) return null;
  return authorRepo.findById(authorId);
}

/**
 * Require an authenticated author. Returns the author id, or throws a 401
 * {@link AuthError} when there is no valid session.
 */
export async function requireAuthor(readCookie: CookieReader): Promise<string> {
  const authorId = await getCurrentAuthorId(readCookie);
  if (!authorId) {
    throw new AuthError(401, 'Authentication required');
  }
  return authorId;
}

/**
 * Assert that `currentAuthorId` owns a resource whose owner is
 * `resourceAuthorId`. Throws a 403 {@link AuthError} otherwise
 * (Requirement 10.4).
 */
export function assertOwnership(
  currentAuthorId: string,
  resourceAuthorId: string,
): void {
  if (currentAuthorId !== resourceAuthorId) {
    throw new AuthError(403, 'You do not have access to this resource');
  }
}

/** Convert a caught {@link AuthError} into a JSON `Response`. */
export function authErrorToResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
