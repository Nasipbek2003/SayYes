/**
 * Вход в админ-панель.
 *
 * Принимает логин (`Author.login`) или email. Основной путь — пользователь из
 * БД с ролью `ADMIN`; резервный — креденшелы из окружения (первичная загрузка).
 * Сессия кладётся в свой cookie с audience `sayyes-admin`, подписывается
 * секретом из `getAdminSigningSecret()` (окружение или таблица `Setting`).
 * Ответ на неудачу всегда одинаковый, чтобы нельзя было перебором выяснить
 * существующий логин.
 */
import { isAdminConfigured, verifyAdminCredentials } from '@/lib/admin/credentials';
import { getAdminSigningSecret } from '@/lib/admin/secret';
import {
  adminCookieOptions,
  issueAdminToken,
  serializeAdminCookie,
} from '@/lib/admin/session';
import { logger } from '@/lib/logger';
import { RateLimiter } from '@/lib/rate-limit/rateLimiter';

export const runtime = 'nodejs';

/**
 * 8 попыток в 10 минут на IP. Хранилище процесс-локальное (см. оговорку в
 * `rateLimiter.ts`), но для формы входа с одним известным логином этого
 * достаточно как «тормоз» против перебора.
 */
const limiter = new RateLimiter({ limit: 8, windowMs: 10 * 60 * 1000 });

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminConfigured())) {
    return Response.json(
      {
        error:
          'Админ-панель не настроена: создайте администратора (node --import tsx scripts/create-admin.ts) или задайте ADMIN_EMAIL и ADMIN_PASSWORD_HASH',
      },
      { status: 503 },
    );
  }

  const verdict = limiter.check(clientKey(request));
  if (!verdict.allowed) {
    return Response.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(verdict.retryAfterMs / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  // Форма присылает `login`; `email` поддерживаем для обратной совместимости.
  const login = typeof raw.login === 'string' ? raw.login : raw.email;
  const password = raw.password;

  if (typeof login !== 'string' || typeof password !== 'string') {
    return Response.json({ error: 'Неверный логин или пароль' }, { status: 401 });
  }

  const identity = await verifyAdminCredentials(login, password);
  if (!identity) {
    logger.warn('admin-login-failed', { ip: clientKey(request) });
    return Response.json({ error: 'Неверный логин или пароль' }, { status: 401 });
  }

  logger.info('admin-login-success', {
    subject: identity.subject,
    authorId: identity.authorId,
  });

  const secret = await getAdminSigningSecret();
  const token = await issueAdminToken(identity, secret);
  const response = Response.json({ ok: true });
  response.headers.append(
    'Set-Cookie',
    serializeAdminCookie(token, adminCookieOptions()),
  );
  return response;
}
