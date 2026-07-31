/**
 * Гейт админ-панели для серверных компонентов и route handlers.
 *
 * Единственный модуль админки, который импортирует `next/headers` — так же, как
 * `lib/auth/nextCookies.ts` для авторской части. Работает в Node-рантайме,
 * поэтому берёт секрет подписи из `./secret` (окружение либо таблица `Setting`)
 * и дополнительно перепроверяет роль в БД: снятие роли `ADMIN` должно закрывать
 * доступ сразу, не дожидаясь истечения токена.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';

import { getAdminSigningSecret } from './secret';
import { ADMIN_COOKIE_NAME, verifyAdminToken, type AdminClaims } from './session';

/** Роль всё ещё действует? Для env-админа (authorId = null) проверять нечего. */
async function stillAdmin(claims: AdminClaims): Promise<boolean> {
  if (!claims.authorId) return true;
  const author = await prisma.author.findUnique({
    where: { id: claims.authorId },
    select: { role: true },
  });
  return author?.role === 'ADMIN';
}

/** Claims текущей админ-сессии из cookie, либо null. */
export async function getAdminSession(): Promise<AdminClaims | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  const secret = await getAdminSigningSecret();
  const claims = await verifyAdminToken(token, secret);
  if (!claims) return null;
  return (await stillAdmin(claims)) ? claims : null;
}

/** Логин/email текущего администратора, либо null. */
export async function getAdminEmail(): Promise<string | null> {
  const claims = await getAdminSession();
  return claims?.subject ?? null;
}

/**
 * Требовать админ-сессию в серверном компоненте. Без сессии — редирект на
 * `/admin` (единственная точка входа). Дублирует проверку из middleware
 * осознанно: страница не должна зависеть от того, попала ли она под matcher.
 */
export async function requireAdmin(): Promise<string> {
  const claims = await getAdminSession();
  if (!claims) {
    redirect('/admin');
  }
  return claims.subject;
}

/** Проверка админ-сессии по объекту запроса (для route handlers). */
export async function getAdminFromRequest(request: Request): Promise<string | null> {
  const raw = request.headers.get('cookie') ?? '';
  const match = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  const token = match?.slice(ADMIN_COOKIE_NAME.length + 1);
  const secret = await getAdminSigningSecret();
  const claims = await verifyAdminToken(token, secret);
  if (!claims) return null;
  return (await stillAdmin(claims)) ? claims.subject : null;
}
