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

/** Один тариф по идентификатору. */
export async function getPlan(id: PlanId): Promise<Plan> {
  return (await getPlans())[id];
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

/** Сохранить `@username` бота (пустая строка удаляет переопределение). */
export async function saveBotUsername(value: string): Promise<void> {
  await setSetting(SETTING_KEYS.botUsername, value.trim().replace(/^@/, ''), {
    description: 'Имя Telegram-бота для ссылки привязки (t.me/<username>)',
  });
}
