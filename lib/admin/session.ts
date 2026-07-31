/**
 * Сессия администратора — подписанный JWT в httpOnly cookie.
 *
 * Полный аналог `lib/auth/session.ts`, но с отдельным cookie и **другой
 * audience** (`sayyes-admin`): авторский токен нельзя предъявить админке, а
 * админский — авторским роутам, даже если секрет подписи один и тот же.
 *
 * Модуль использует только `jose` (Web Crypto), поэтому проверка работает и в
 * Edge-рантайме `middleware.ts`. Секрет подписи передаётся аргументом: в Node
 * его отдаёт `./secret` (окружение или таблица `Setting`), в Edge доступен
 * только вариант из окружения. Сверка пароля живёт в `./credentials`.
 */
import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/lib/env';

/** Имя httpOnly cookie админ-сессии. */
export const ADMIN_COOKIE_NAME = 'sayyes_admin';

/**
 * Время жизни сессии — 30 дней. Cookie персистентная, поэтому закрытие вкладки
 * или браузера не разлогинивает: повторный вход нужен только по истечении срока
 * или после «Выйти».
 */
export const ADMIN_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Порог скользящего продления: если сессии осталось меньше этого времени,
 * middleware выдаёт свежий токен. Так активная работа в панели не прерывается
 * по календарному сроку.
 */
export const ADMIN_RENEW_THRESHOLD_SECONDS = 60 * 60 * 24 * 7;

const ISSUER = 'sayyes';
const AUDIENCE = 'sayyes-admin';

/**
 * Секрет подписи из окружения, либо null.
 *
 * Живёт здесь, а не в `./secret`, потому что этот модуль обязан оставаться
 * edge-safe: `./secret` тянет Prisma ради значения из таблицы `Setting`, а
 * middleware такой импорт не соберёт.
 */
export function adminSecretFromEnv(): string | null {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    env.admin.sessionSecret ||
    process.env.SESSION_SECRET ||
    env.sessionSecret;
  return secret && secret.length > 0 ? secret : null;
}

function toKey(secret: string): Uint8Array {
  if (!secret) {
    throw new Error('Admin session secret is not configured');
  }
  return new TextEncoder().encode(secret);
}

export interface AdminClaims {
  /** Логин или email администратора — то, чем он вошёл. */
  subject: string;
  /** Id записи `Author`, если админ живёт в БД (null — вход по env-кредам). */
  authorId: string | null;
  /** Когда истекает токен (epoch-секунды) — нужно для скользящего продления. */
  expiresAt: number;
}

export interface AdminIdentity {
  subject: string;
  authorId: string | null;
}

/** Выдать подписанный токен админ-сессии. */
export async function issueAdminToken(
  identity: AdminIdentity,
  secret: string,
  ttlSeconds: number = ADMIN_TTL_SECONDS,
): Promise<string> {
  const key = toKey(secret);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ authorId: identity.authorId, role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.subject)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

/**
 * Проверить токен админ-сессии заданным секретом. Возвращает claims либо `null`
 * для любого невалидного случая (нет токена, истёк, чужая подпись, чужая
 * audience, не та роль). Никогда не бросает на плохом токене.
 */
export async function verifyAdminToken(
  token: string | undefined | null,
  secret: string | null,
): Promise<AdminClaims | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, toKey(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    if (payload.role !== 'ADMIN') return null;
    return {
      subject: payload.sub,
      authorId: typeof payload.authorId === 'string' ? payload.authorId : null,
      expiresAt: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

/** Пора ли выдать новый токен (скользящее продление). */
export function shouldRenew(claims: AdminClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  return claims.expiresAt - now < ADMIN_RENEW_THRESHOLD_SECONDS;
}

/**
 * Атрибуты cookie админ-сессии. `sameSite: 'strict'` (жёстче авторского `lax`):
 * в панель не ведёт ни одна внешняя ссылка, зато это отсекает CSRF по
 * навигации.
 */
export function adminCookieOptions(maxAgeSeconds: number = ADMIN_TTL_SECONDS) {
  const isProd = (process.env.NODE_ENV || env.nodeEnv) === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Сериализовать cookie в значение заголовка `Set-Cookie`. */
export function serializeAdminCookie(
  value: string,
  opts: ReturnType<typeof adminCookieOptions> = adminCookieOptions(),
): string {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${value}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) {
    parts.push(
      `SameSite=${opts.sameSite.charAt(0).toUpperCase()}${opts.sameSite.slice(1)}`,
    );
  }
  return parts.join('; ');
}
