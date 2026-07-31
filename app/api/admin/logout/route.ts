/**
 * Выход из админ-панели: гасим cookie сессии (Max-Age=0) и уводим на `/admin`.
 */
import { adminCookieOptions, serializeAdminCookie } from '@/lib/admin/session';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

function clearCookieHeader(): string {
  return serializeAdminCookie('', { ...adminCookieOptions(0), maxAge: 0 });
}

export async function POST(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin || env.appUrl;
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/admin', origin).toString(),
      'Set-Cookie': clearCookieHeader(),
    },
  });
}
