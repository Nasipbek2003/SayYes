/**
 * POST /api/auth/logout — clear the session cookie and redirect to home.
 */
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth';
import { getRequestOrigin } from '@/lib/auth/requestOrigin';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const origin = getRequestOrigin(request);
  const opts = sessionCookieOptions();
  const cookie = `${SESSION_COOKIE_NAME}=; Path=${opts.path}; Max-Age=0; HttpOnly; SameSite=${capitalize(opts.sameSite ?? 'lax')}`;

  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/', origin).toString(),
      'Set-Cookie': cookie,
    },
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
