/**
 * POST /api/auth/magic-link/request
 *
 * Body: { "email": "user@example.com" }
 *
 * Provisions the author if needed, issues a short-lived single-use magic-link
 * token, and emails a sign-in URL via the {@link Mailer}. Always responds 200
 * with a generic message regardless of whether the email already existed, so
 * the endpoint can't be used to enumerate registered accounts.
 */
import {
  MAGIC_LINK_TTL_SECONDS,
  defaultMailer,
  issueMagicLinkForEmail,
} from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/** Minimal email shape check — full validation belongs to the provider. */
function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request): Promise<Response> {
  // Accept both JSON and HTML-form (application/x-www-form-urlencoded) bodies.
  const contentType = request.headers.get('content-type') ?? '';
  let email: unknown;
  let redirectAfter: string | null = null;
  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    email = (body as { email?: unknown })?.email;
    const r = (body as { redirect?: unknown })?.redirect;
    if (typeof r === 'string') redirectAfter = r;
  } else {
    // HTML form submission (method="post")
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: 'Invalid form body' }, { status: 400 });
    }
    email = formData.get('email');
    const r = formData.get('redirect');
    if (typeof r === 'string') redirectAfter = r;
  }

  if (!isValidEmail(email)) {
    // For HTML form errors redirect back to login with an error param.
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return Response.redirect(new URL('/login?error=invalid_email', env.appUrl), 303);
    }
    return Response.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { rawToken, expiresAt } = await issueMagicLinkForEmail(normalizedEmail);

  const confirmUrl = new URL('/api/auth/magic-link/confirm', env.appUrl);
  confirmUrl.searchParams.set('token', rawToken);
  if (redirectAfter) confirmUrl.searchParams.set('redirect', redirectAfter);

  await defaultMailer.sendMagicLink({
    to: normalizedEmail,
    url: confirmUrl.toString(),
    expiresInMinutes: Math.floor(MAGIC_LINK_TTL_SECONDS / 60),
  }).catch((err: unknown) => {
    // Log but don't expose delivery errors to the client.
    console.error('[mailer] failed to send magic-link:', err instanceof Error ? err.message : err);
  });

  // For HTML form submissions redirect to a "check your email" page.
  // In development without a real mailer, pass the link in the URL so it's
  // visible without opening the server terminal.
  if (!contentType.includes('application/json')) {
    const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
    const hasRealMailer = Boolean(process.env.RESEND_API_KEY);
    if (isDev && !hasRealMailer) {
      // Show the magic link directly on the page for easy dev testing.
      const dest = new URL('/login/sent', env.appUrl);
      dest.searchParams.set('devlink', confirmUrl.toString());
      return Response.redirect(dest.toString(), 303);
    }
    return Response.redirect(new URL('/login/sent', env.appUrl), 303);
  }

  // Generic JSON response — never reveal whether the account already existed.
  return Response.json(
    { message: 'If that email is valid, a sign-in link is on its way.', expiresAt },
    { status: 200 },
  );
}
