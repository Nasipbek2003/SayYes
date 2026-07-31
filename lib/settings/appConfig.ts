/**
 * Настройки, которые администратор меняет на ходу — из таблицы `Setting`.
 *
 * Зачем не только окружение: `.env` не попадает в репозиторий и правится лишь
 * на хостинге с последующим редеплоем. Цена тарифа или имя бота — это не
 * «параметр сборки», а обычные данные: их нужно менять из панели и сразу.
 *
 * Правило разрешения одно для всех значений: **база → окружение → значение по
 * умолчанию в коде**. Поэтому существующие деплои, где всё задано через `.env`,
 * продолжают работать без изменений, а запись в базу переопределяет их.
 *
 * Что осознанно НЕ переносим в базу:
 *  - `DATABASE_URL` — им же и читается сама таблица;
 *  - `SESSION_SECRET` — им шифруются значения секретов в этой таблице;
 *  - `TELEGRAM_WEBHOOK_SECRET` — он должен совпадать с тем, что зарегистрирован
 *    в Telegram; смена из панели тихо сломала бы приём сообщений.
 *
 * Только серверный код: модуль ходит в БД.
 */
import { env } from '@/lib/env';
import { DEFAULT_PLANS, type Plan, type PlanId } from '@/lib/pricing';
import { getSetting, setSetting } from './store';

/** Ключи настроек в таблице `Setting`. */
export const SETTING_KEYS = {
  singleAmount: 'pricing.single_amount',
  monthlyAmount: 'pricing.monthly_amount',
  monthlyPeriodDays: 'pricing.monthly_period_days',
  botUsername: 'telegram.bot_username',
  cloudinaryCloudName: 'cloudinary.cloud_name',
  cloudinaryApiKey: 'cloudinary.api_key',
  cloudinaryApiSecret: 'cloudinary.api_secret',
  cloudinaryFolder: 'cloudinary.upload_folder',
  heroVideoPublicId: 'media.hero_video_public_id',
} as const;

/**
 * Прочитать целое положительное число из настройки. Мусор («ноль», «сто сом»,
 * отрицательное) игнорируем и берём запасное значение: неверная цена в базе не
 * должна ломать оплату.
 */
async function getPositiveInt(key: string, fallback: number, max: number): Promise<number> {
  const raw = await getSetting(key);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return fallback;
  return parsed;
}

/** Максимумы — защита от опечатки вида «5000000». */
const MAX_AMOUNT = 1_000_000;
const MAX_PERIOD_DAYS = 3650;

/**
 * Актуальные тарифы: суммы и срок подписки берутся из базы, остальное
 * (названия, описания, enum плана) — из кода.
 */
export async function getPlans(): Promise<Record<PlanId, Plan>> {
  const [single, monthly, periodDays] = await Promise.all([
    getPositiveInt(SETTING_KEYS.singleAmount, DEFAULT_PLANS.single.amount, MAX_AMOUNT),
    getPositiveInt(SETTING_KEYS.monthlyAmount, DEFAULT_PLANS.monthly.amount, MAX_AMOUNT),
    getPositiveInt(
      SETTING_KEYS.monthlyPeriodDays,
      DEFAULT_PLANS.monthly.periodDays ?? 30,
      MAX_PERIOD_DAYS,
    ),
  ]);

  return {
    single: { ...DEFAULT_PLANS.single, amount: single },
    monthly: { ...DEFAULT_PLANS.monthly, amount: monthly, periodDays },
  };
}

/** Тарифы списком, в порядке показа в UI. */
export async function getPlanList(): Promise<Plan[]> {
  const plans = await getPlans();
  return [plans.single, plans.monthly];
}

export interface PricingUpdate {
  singleAmount: number;
  monthlyAmount: number;
  monthlyPeriodDays: number;
}

/** Проверить и сохранить тарифы. Возвращает текст ошибки либо null. */
export async function savePricing(update: PricingUpdate): Promise<string | null> {
  const checks: Array<[number, string, number]> = [
    [update.singleAmount, 'Разовая оплата', MAX_AMOUNT],
    [update.monthlyAmount, 'Подписка', MAX_AMOUNT],
    [update.monthlyPeriodDays, 'Срок подписки', MAX_PERIOD_DAYS],
  ];
  for (const [value, label, max] of checks) {
    if (!Number.isInteger(value) || value <= 0 || value > max) {
      return `${label}: нужно целое число от 1 до ${max}`;
    }
  }

  await Promise.all([
    setSetting(SETTING_KEYS.singleAmount, String(update.singleAmount), {
      description: 'Цена разовой оплаты приглашения, целые сомы',
    }),
    setSetting(SETTING_KEYS.monthlyAmount, String(update.monthlyAmount), {
      description: 'Цена подписки на период, целые сомы',
    }),
    setSetting(SETTING_KEYS.monthlyPeriodDays, String(update.monthlyPeriodDays), {
      description: 'Длительность подписки в днях',
    }),
  ]);
  return null;
}

/**
 * `@username` бота без «собачки»: сначала база, потом окружение. Пустая строка
 * и строка из пробелов считаются незаданным значением — именно на этом раньше
 * молча ломалась ссылка привязки Telegram.
 */
export async function getBotUsername(): Promise<string> {
  const fromDb = (await getSetting(SETTING_KEYS.botUsername))?.trim().replace(/^@/, '');
  if (fromDb) return fromDb;
  return env.telegram.botUsername;
}


/* ============================================================
   Cloudinary
   ============================================================ */

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Папка, внутри которой создаются все объекты проекта. */
  uploadFolder: string;
}

/**
 * Доступы к Cloudinary: сначала таблица `Setting`, потом `CLOUDINARY_URL` из
 * окружения. Секрет в базе хранится зашифрованным (см. `store.ts`) и наружу не
 * отдаётся — только на сервер, где подписывается загрузка.
 */
export async function getCloudinaryConfig(): Promise<CloudinaryConfig> {
  const [cloudName, apiKey, apiSecret, folder] = await Promise.all([
    getSetting(SETTING_KEYS.cloudinaryCloudName),
    getSetting(SETTING_KEYS.cloudinaryApiKey),
    getSetting(SETTING_KEYS.cloudinaryApiSecret),
    getSetting(SETTING_KEYS.cloudinaryFolder),
  ]);

  return {
    cloudName: cloudName?.trim() || env.cloudinary.cloudName,
    apiKey: apiKey?.trim() || env.cloudinary.apiKey,
    apiSecret: apiSecret?.trim() || env.cloudinary.apiSecret,
    uploadFolder: folder?.trim() || env.cloudinary.uploadFolder,
  };
}

/** Сохранить доступы Cloudinary. Пустые поля не перезаписывают текущие. */
export async function saveCloudinaryConfig(update: {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  uploadFolder?: string;
}): Promise<void> {
  const writes: Array<Promise<void>> = [];
  if (update.cloudName?.trim()) {
    writes.push(
      setSetting(SETTING_KEYS.cloudinaryCloudName, update.cloudName.trim(), {
        description: 'Cloudinary: имя облака (cloud name)',
      }),
    );
  }
  if (update.apiKey?.trim()) {
    writes.push(
      setSetting(SETTING_KEYS.cloudinaryApiKey, update.apiKey.trim(), {
        description: 'Cloudinary: API key',
      }),
    );
  }
  if (update.apiSecret?.trim()) {
    writes.push(
      setSetting(SETTING_KEYS.cloudinaryApiSecret, update.apiSecret.trim(), {
        isSecret: true,
        description: 'Cloudinary: API secret (хранится зашифрованным)',
      }),
    );
  }
  if (update.uploadFolder?.trim()) {
    writes.push(
      setSetting(SETTING_KEYS.cloudinaryFolder, update.uploadFolder.trim(), {
        description: 'Cloudinary: корневая папка проекта',
      }),
    );
  }
  await Promise.all(writes);
}

/**
 * `publicId` фонового видео на главной. Пока не задан, страница использует
 * локальный файл `/bg-hero.webm`.
 */
export async function getHeroVideoPublicId(): Promise<string | null> {
  const value = (await getSetting(SETTING_KEYS.heroVideoPublicId))?.trim();
  return value ? value : null;
}
