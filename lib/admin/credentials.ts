/**
 * Аутентификация администратора (Node-рантайм: `node:crypto` + БД).
 *
 * Основной путь — пользователь из БД с ролью `ADMIN`: вход по короткому логину
 * (`Author.login`) или по email, пароль сверяется с `passwordHash`. Так роль
 * администратора управляется данными, а не деплоем.
 *
 * Резервный путь — креденшелы из окружения (`ADMIN_EMAIL` +
 * `ADMIN_PASSWORD_HASH`/`ADMIN_PASSWORD`). Нужен для первичной загрузки: если
 * в базе ещё нет ни одного админа, войти всё равно можно. Если не задано ни
 * env-кредов, ни админов в базе — вход в панель закрыт.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { verifyPassword } from '@/lib/auth/password';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

import type { AdminIdentity } from './session';

interface EnvCredentials {
  email: string;
  passwordHash: string;
  password: string;
}

function readEnvCredentials(): EnvCredentials {
  return {
    email: (process.env.ADMIN_EMAIL ?? env.admin.email).trim().toLowerCase(),
    passwordHash: (process.env.ADMIN_PASSWORD_HASH ?? env.admin.passwordHash).trim(),
    password: process.env.ADMIN_PASSWORD ?? env.admin.password,
  };
}

function envConfigured(): boolean {
  const { email, passwordHash, password } = readEnvCredentials();
  return email.length > 0 && (passwordHash.length > 0 || password.length > 0);
}

/**
 * Настроен ли вход в панель: есть админ в БД или заданы env-креды.
 * Пустая конфигурация не должна превращаться в «пускать всех».
 */
export async function isAdminConfigured(): Promise<boolean> {
  if (envConfigured()) return true;
  const dbAdmins = await prisma.author.count({
    where: { role: 'ADMIN', passwordHash: { not: null } },
  });
  return dbAdmins > 0;
}

/** Сравнение строк без утечки длины совпавшего префикса по времени. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Проверить пару «логин или email» + пароль. Возвращает identity при успехе и
 * `null` в любом другом случае — вызывающий отдаёт одну общую ошибку, чтобы не
 * подсказывать, что именно не совпало.
 */
export async function verifyAdminCredentials(
  loginOrEmail: string,
  password: string,
): Promise<AdminIdentity | null> {
  const identifier = loginOrEmail.trim().toLowerCase();
  if (!identifier || !password) return null;

  const author = await prisma.author.findFirst({
    where: {
      role: 'ADMIN',
      passwordHash: { not: null },
      OR: [{ login: identifier }, { email: identifier }],
    },
  });

  if (author?.passwordHash) {
    const valid = await verifyPassword(password, author.passwordHash);
    return valid
      ? { subject: author.login ?? author.email ?? author.id, authorId: author.id }
      : null;
  }

  // Резервный путь: креденшелы из окружения.
  if (!envConfigured()) return null;
  const expected = readEnvCredentials();
  const emailOk = safeEqual(identifier, expected.email);
  const passwordOk = expected.passwordHash
    ? await verifyPassword(password, expected.passwordHash)
    : safeEqual(password, expected.password);

  // Оба фактора считаем до ветвления, чтобы время ответа не зависело от того,
  // угадан ли логин.
  return emailOk && passwordOk ? { subject: expected.email, authorId: null } : null;
}
