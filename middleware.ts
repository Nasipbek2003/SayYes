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

import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  adminSecretFromEnv,
  issueAdminToken,
  shouldRenew,
  verifyAdminToken,
} from '@/lib/admin/session';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

/** Path prefixes that require an authenticated author. */
const PROTECTED_API_PREFIXES = ['/api/me', '/api/invitations'];
const PROTECTED_PAGE_PREFIXES = ['/me', '/create'];

/**
 * Админка. Точка входа только одна — страница `/admin` (там форма логина),
 * поэтому она сама в защиту не попадает: гейт стоит на всех вложенных
 * страницах `/admin/*` и на `/api/admin/*`, кроме входа/выхода.
 */
const ADMIN_PUBLIC_PATHS = ['/admin', '/api/admin/login', '/api/admin/logout'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Отказ для админки: JSON для API, редирект на форму входа для страниц. */
function adminReject(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith('/api/admin')) {
    return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/admin', request.url));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Внимание: matcher `/admin/:path*` совпадает и с самим `/admin`, поэтому
    // страницу входа надо исключить явно — иначе она редиректит на себя.
    if (ADMIN_PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.next();
    }

    const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const envSecret = adminSecretFromEnv();

    // Секрет живёт в БД, а не в окружении: на Edge его не прочитать, поэтому
    // здесь ограничиваемся наличием cookie — полную проверку подписи и роли
    // делает Node-гейт (`requireAdmin` в layout/страницах, `getAdminFromRequest`
    // в route handlers).
    if (!envSecret) {
      if (adminToken) return NextResponse.next();
      return adminReject(request, pathname);
    }

    const adminClaims = await verifyAdminToken(adminToken, envSecret);
    if (!adminClaims) {
      return adminReject(request, pathname);
    }

    // Скользящее продление: у активного администратора сессия не обрывается по
    // календарному сроку.
    if (shouldRenew(adminClaims)) {
      const response = NextResponse.next();
      const renewed = await issueAdminToken(
        { subject: adminClaims.subject, authorId: adminClaims.authorId },
        envSecret,
      );
      response.cookies.set(ADMIN_COOKIE_NAME, renewed, adminCookieOptions());
      return response;
    }

    return NextResponse.next();
  }

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
  matcher: [
    '/api/me/:path*',
    '/api/invitations/:path*',
    '/me/:path*',
    '/create',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
