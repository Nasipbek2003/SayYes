/**
 * POST /api/auth/logout — clear the session cookie and redirect to home.
 */
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const opts = sessionCookieOptions();
  // Expire the cookie immediately.
  const cookie = `${SESSION_COOKIE_NAME}=; Path=${opts.path}; Max-Age=0; HttpOnly; SameSite=${capitalize(opts.sameSite ?? 'lax')}`;

  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/', env.appUrl).toString(),
      'Set-Cookie': cookie,
    },
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
