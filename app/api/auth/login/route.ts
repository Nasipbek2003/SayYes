import { verifyPassword } from '@/lib/auth/password';
import { authorRepo } from '@/lib/repositories';
import { logger } from '@/lib/logger';
import {
  SESSION_COOKIE_NAME,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/auth';
import { getRequestOrigin } from '@/lib/auth/requestOrigin';

export const runtime = 'nodejs';

function serializeCookie(
  name: string,
  value: string,
  opts: ReturnType<typeof sessionCookieOptions>,
): string {
  const parts = [`${name}=${value}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`];
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite.charAt(0).toUpperCase()}${opts.sameSite.slice(1)}`);
  return parts.join('; ');
}

export async function POST(request: Request): Promise<Response> {
  const origin = getRequestOrigin(request);
  const contentType = request.headers.get('content-type') ?? '';
  let email: unknown;
  let password: unknown;
  let redirectAfter: string | null = null;

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    email = b.email;
    password = b.password;
    if (typeof b.redirect === 'string') redirectAfter = b.redirect;
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: 'Invalid form body' }, { status: 400 });
    }
    email = formData.get('email');
    password = formData.get('password');
    const r = formData.get('redirect');
    if (typeof r === 'string') redirectAfter = r;
  }

  const GENERIC_ERROR = 'Неверный email или пароль';

  if (typeof email !== 'string' || typeof password !== 'string') {
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL('/login?error=invalid_credentials', origin), 303);
    }
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const author = await authorRepo.findByEmail(normalizedEmail);

  if (!author || !author.passwordHash) {
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL('/login?error=invalid_credentials', origin), 303);
    }
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const valid = await verifyPassword(password, author.passwordHash);
  if (!valid) {
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL('/login?error=invalid_credentials', origin), 303);
    }
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  logger.info('auth-login-success', { authorId: author.id });

  const sessionToken = await issueSessionToken(author.id);
  const dest = redirectAfter
    ? new URL(redirectAfter, origin)
    : new URL('/me/invitations', origin);

  if (!contentType.includes('application/json')) {
    const cookie = serializeCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());
    return new Response(null, {
      status: 303,
      headers: {
        Location: dest.toString(),
        'Set-Cookie': cookie,
      },
    });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions()),
  );
  return response;
}
