/**
 * Next.js-bound auth helpers (task 4.1).
 *
 * These thin adapters bind the runtime-agnostic guards in `./guards` to the
 * Next.js App Router `cookies()` store. Keep this the only module that imports
 * `next/headers` so the core auth logic stays portable and unit-testable.
 */
import { cookies } from 'next/headers';

import {
  getCurrentAuthor as getCurrentAuthorBase,
  getCurrentAuthorId as getCurrentAuthorIdBase,
  requireAuthor as requireAuthorBase,
} from './index';
import { SESSION_COOKIE_NAME } from './session';

/** Read the session cookie value from the Next.js cookie store. */
async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

/** Current author id from the request's session cookie, or null. */
export function getCurrentAuthorId(): Promise<string | null> {
  return getCurrentAuthorIdBase(readSessionCookie);
}

/** Current author record from the request's session cookie, or null. */
export function getCurrentAuthor() {
  return getCurrentAuthorBase(readSessionCookie);
}

/** Require an authenticated author (throws 401 AuthError otherwise). */
export function requireAuthor(): Promise<string> {
  return requireAuthorBase(readSessionCookie);
}
