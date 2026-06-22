/**
 * Magic-link confirmation endpoint.
 *
 * GET  /api/auth/magic-link/confirm?token=...   (clicked from the email)
 * POST /api/auth/magic-link/confirm  { "token": "..." }   (programmatic)
 *
 * Consumes the single-use token, and on success issues a session JWT in an
 * httpOnly cookie. The GET variant redirects the browser to the cabinet (or to
 * an error screen); the POST variant returns JSON for API clients.
 */
import {
  SESSION_COOKIE_NAME,
  consumeMagicLink,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/** Consume the token and, on success, return a session cookie-setting helper. */
async function authenticate(rawToken: string | null) {
  if (!rawToken) {
    return { ok: false as const, reason: 'not_found' as const };
  }
  return consumeMagicLink(rawToken);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const redirectTo = url.searchParams.get('redirect');
  const result = await authenticate(token);

  if (!result.ok) {
    const dest = new URL('/login', env.appUrl);
    dest.searchParams.set('error', result.reason);
    if (redirectTo) dest.searchParams.set('redirect', redirectTo);
    return new Response(null, { status: 303, headers: { Location: dest.toString() } });
  }

  const sessionToken = await issueSessionToken(result.authorId);
  // Redirect to the original destination (e.g. /create?template=...) or cabinet.
  const dest = redirectTo
    ? new URL(redirectTo, env.appUrl)
    : new URL('/me/invitations', env.appUrl);

  // Response.redirect() is immutable — set the cookie via a manual Response
  // instead of trying to append headers after the fact.
  const cookie = serializeCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());
  return new Response(null, {
    status: 303,
    headers: {
      Location: dest.toString(),
      'Set-Cookie': cookie,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let token: string | null = null;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body?.token === 'string' ? body.token : null;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await authenticate(token);
  if (!result.ok) {
    return Response.json({ error: 'Invalid or expired link', reason: result.reason }, {
      status: 400,
    });
  }

  const sessionToken = await issueSessionToken(result.authorId);
  const response = Response.json({ ok: true });
  response.headers.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions()),
  );
  return response;
}

/** Serialize a cookie header value from name/value/options. */
function serializeCookie(
  name: string,
  value: string,
  opts: ReturnType<typeof sessionCookieOptions>,
): string {
  const parts = [`${name}=${value}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`];
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${capitalize(opts.sameSite)}`);
  return parts.join('; ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
