/**
 * Секрет подписи админ-сессии (Node-рантайм).
 *
 * Порядок разрешения:
 *  1. `ADMIN_SESSION_SECRET` / `SESSION_SECRET` из окружения — единственный
 *     вариант, доступный Edge-рантайму `middleware.ts`
 *     (см. `adminSecretFromEnv` в `./session`);
 *  2. настройка `auth.admin_session_secret` в БД — генерируется один раз и
 *     живёт в таблице `Setting`.
 *
 * Второй пункт и есть ответ на «закрыл страницу — не хочу входить заново»:
 * секрет не пересоздаётся при каждом старте процесса, поэтому выданный ранее
 * JWT остаётся валидным после перезапуска и редеплоя. Cookie при этом
 * персистентная (Max-Age 30 дней), так что закрытие вкладки или браузера сессию
 * не рвёт.
 */
import { randomBytes } from 'node:crypto';

import { getOrCreateSetting } from '@/lib/settings/store';

import { adminSecretFromEnv } from './session';

/** Ключ настройки, под которым лежит секрет. */
export const ADMIN_SECRET_SETTING_KEY = 'auth.admin_session_secret';

/**
 * Итоговый секрет подписи: окружение, иначе persisted-значение из БД (при
 * первом обращении генерируется 32 случайных байта и сохраняется).
 */
export async function getAdminSigningSecret(): Promise<string> {
  const fromEnv = adminSecretFromEnv();
  if (fromEnv) return fromEnv;

  return getOrCreateSetting(
    ADMIN_SECRET_SETTING_KEY,
    () => randomBytes(32).toString('base64'),
    {
      isSecret: true,
      description:
        'Секрет подписи JWT админ-сессии. Сгенерирован автоматически; смена разлогинит всех администраторов.',
    },
  );
}
