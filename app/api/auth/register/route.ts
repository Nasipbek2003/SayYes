import { env } from '@/lib/env';
import { hashPassword } from '@/lib/auth/password';
import { authorRepo } from '@/lib/repositories';
import {
  SESSION_COOKIE_NAME,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/auth';

export const runtime = 'nodejs';

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

  if (!isValidEmail(email)) {
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL('/login?error=invalid_email&tab=register', env.appUrl), 303);
    }
    return Response.json({ error: 'Введите корректный email' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length < 6) {
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL('/login?error=weak_password&tab=register', env.appUrl), 303);
    }
    return Response.json({ error: 'Пароль должен быть минимум 6 символов' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await authorRepo.findByEmail(normalizedEmail);
  if (existing) {
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL('/login?error=email_taken&tab=register', env.appUrl), 303);
    }
    return Response.json({ error: 'Этот email уже зарегистрирован' }, { status: 409 });
  }

  const hashed = await hashPassword(password);
  const author = await authorRepo.createWithPassword(normalizedEmail, hashed);

  const sessionToken = await issueSessionToken(author.id);
  const dest = redirectAfter
    ? new URL(redirectAfter, env.appUrl)
    : new URL('/me/invitations', env.appUrl);

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
