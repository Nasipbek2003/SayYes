/**
 * Настройки приложения в БД (таблица `Setting`).
 *
 * Зачем таблица, если есть окружение: значения, которые сервис генерирует сам
 * (секрет подписи админ-сессии) или которые меняет администратор из панели
 * (пароли интеграций, переключатели), должны переживать перезапуск и редеплой.
 * Держать их только в памяти нельзя — при каждом старте они менялись бы, и все
 * сессии разлогинивались.
 *
 * Секреты (`isSecret = true`) шифруются AES-256-GCM: дамп базы сам по себе не
 * выдаёт пароли. Ключ шифрования выводится из `SETTINGS_ENCRYPTION_KEY` (либо
 * `SESSION_SECRET` как fallback) — при его смене старые секреты становятся
 * нечитаемыми, это осознанный компромисс.
 *
 * Только серверный код: модуль тянет `node:crypto`.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

/** Префикс-маркер зашифрованного значения (формат: enc:v1:iv:tag:payload). */
const ENC_PREFIX = 'enc:v1:';

/** Соль вывода ключа. Константа: ключ должен быть воспроизводимым. */
const KEY_SALT = 'sayyes-settings-v1';

function encryptionKey(): Buffer {
  const secret =
    process.env.SETTINGS_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    env.sessionSecret;
  if (!secret) {
    throw new Error('SETTINGS_ENCRYPTION_KEY / SESSION_SECRET is not configured');
  }
  return scryptSync(secret, KEY_SALT, 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${payload.toString('base64')}`;
}

function decrypt(stored: string): string | null {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const [ivB64, tagB64, payloadB64] = stored.slice(ENC_PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !payloadB64) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payloadB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    // Обычно означает смену ключа шифрования: значение больше не расшифровать.
    logger.warn('setting-decrypt-failed');
    return null;
  }
}

/**
 * Короткий кэш прочитанных значений. Секрет подписи сессии читается на каждом
 * запросе к панели — не гонять за ним в БД каждый раз.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: string | null; expiresAt: number }>();

/** Сбросить кэш (после записи или вручную). */
export function invalidateSettingsCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/** Прочитать значение настройки (секреты расшифровываются), либо null. */
export async function getSetting(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await prisma.setting.findUnique({ where: { key } });
  const value = row ? decrypt(row.value) : null;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export interface SetSettingOptions {
  /** Шифровать значение и не отдавать его в UI. */
  isSecret?: boolean;
  description?: string;
}

/** Создать или обновить настройку. */
export async function setSetting(
  key: string,
  value: string,
  options: SetSettingOptions = {},
): Promise<void> {
  const isSecret = options.isSecret ?? false;
  const stored = isSecret ? encrypt(value) : value;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, isSecret, description: options.description },
    update: {
      value: stored,
      isSecret,
      ...(options.description !== undefined ? { description: options.description } : {}),
    },
  });
  invalidateSettingsCache(key);
}

/**
 * Прочитать настройку, а если её нет — создать со значением из `factory`.
 *
 * Гонка двух параллельных запросов разрешается на уникальном ключе: при
 * конфликте вставки мы просто перечитываем строку и используем чужое значение.
 * Это важно именно для секрета подписи — два разных секрета означали бы, что
 * половина выданных сессий не проходит проверку.
 */
export async function getOrCreateSetting(
  key: string,
  factory: () => string,
  options: SetSettingOptions = {},
): Promise<string> {
  const existing = await getSetting(key);
  if (existing) return existing;

  const value = factory();
  const isSecret = options.isSecret ?? false;
  try {
    await prisma.setting.create({
      data: {
        key,
        value: isSecret ? encrypt(value) : value,
        isSecret,
        description: options.description,
      },
    });
    invalidateSettingsCache(key);
    return value;
  } catch {
    invalidateSettingsCache(key);
    const raced = await getSetting(key);
    if (raced) return raced;
    throw new Error(`Failed to persist setting "${key}"`);
  }
}

/** Удалить настройку. */
export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.delete({ where: { key } }).catch(() => undefined);
  invalidateSettingsCache(key);
}

export interface SettingSummary {
  key: string;
  /** Для секретов — маска, для обычных значений — само значение. */
  display: string;
  isSecret: boolean;
  description: string | null;
  updatedAt: Date;
}

/** Маскируем секрет: длину не раскрываем, видно только что он задан. */
function mask(): string {
  return '••••••••';
}

/** Список настроек для панели: секреты замаскированы. */
export async function listSettings(): Promise<SettingSummary[]> {
  const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  return rows.map((row) => ({
    key: row.key,
    display: row.isSecret ? mask() : row.value,
    isSecret: row.isSecret,
    description: row.description,
    updatedAt: row.updatedAt,
  }));
}
