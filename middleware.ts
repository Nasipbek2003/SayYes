/**
 * Edge authorization middleware (task 4.1).
 *
 * Cheaply rejects unauthenticated requests to protected areas before they reach
 * a Route Handler. Uses jose-based `verifySessionToken`, which runs on the Edge
 * runtime (Web Crypto), so no Node-only crypto is pulled into the bundle.
 *
 * - Protected API routes (`/api/me`, `/api/invitations`, `/api/me/...`) get a
 *   401 JSON response when the session is missing/invalid.
 * - Protected pages (`/me`) redirect to `/login`.
 *
 * Per-resource ownership (403) is enforced in handlers via `assertOwnership`,
 * since middleware doesn't load the resource.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

/** Path prefixes that require an authenticated author. */
const PROTECTED_API_PREFIXES = ['/api/me', '/api/invitations'];
const PROTECTED_PAGE_PREFIXES = ['/me', '/create'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isProtectedApi = matchesPrefix(pathname, PROTECTED_API_PREFIXES);
  const isProtectedPage = matchesPrefix(pathname, PROTECTED_PAGE_PREFIXES);

  if (!isProtectedApi && !isProtectedPage) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = await verifySessionToken(token);

  if (claims) {
    return NextResponse.next();
  }

  if (isProtectedApi) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  const fullPath = pathname + request.nextUrl.search;
  loginUrl.searchParams.set('redirect', fullPath);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/api/me/:path*', '/api/invitations/:path*', '/me/:path*', '/create'],
};
