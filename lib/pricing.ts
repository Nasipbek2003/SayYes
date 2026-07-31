/**
 * Тарифы SayYes — типы и значения по умолчанию.
 *
 * Два варианта оплаты:
 *  - `single`  — разовая оплата одного приглашения;
 *  - `monthly` — подписка: 30 дней публикуй приглашения без отдельной оплаты.
 *
 * Суммы — в целых сомах (KGS), как их принимает Finik в поле `Amount`.
 *
 * ВАЖНО: действующие цены живут в таблице `Setting` и меняются из админ-панели —
 * читать их надо через `getPlans()` из `lib/settings/appConfig.ts`. Здесь только
 * значения по умолчанию (когда в базе ничего не задано) и типы. Этот модуль
 * намеренно не ходит в БД: его импортируют клиентские компоненты, а Prisma в
 * браузерный бандл попадать не должна.
 */
import type { PaymentPlan } from '@prisma/client';

/** Идентификатор плана в API/UI (нижний регистр — «проводной» вид). */
export type PlanId = 'single' | 'monthly';

export interface Plan {
  id: PlanId;
  /** Значение enum-а в базе. */
  prismaPlan: PaymentPlan;
  /** Название для UI. */
  title: string;
  /** Сумма списания в целых сомах. */
  amount: number;
  /** ISO-4217. Finik работает в сомах. */
  currency: 'KGS';
  /** Сколько дней действует подписка (null — разовый платёж). */
  periodDays: number | null;
  /** Описание для платёжной страницы и карточек тарифов. */
  description: string;
}

/** Значения по умолчанию: применяются, пока в таблице `Setting` ничего нет. */
export const DEFAULT_PLANS: Record<PlanId, Plan> = {
  single: {
    id: 'single',
    prismaPlan: 'SINGLE',
    title: 'Разовая оплата',
    amount: 5,
    currency: 'KGS',
    periodDays: null,
    description: 'Одно приглашение',
  },
  monthly: {
    id: 'monthly',
    prismaPlan: 'MONTHLY',
    title: 'Подписка на месяц',
    amount: 5,
    currency: 'KGS',
    periodDays: 30,
    description: 'Неограниченные приглашения на 30 дней',
  },
};

/**
 * Суммы по умолчанию, в целых сомах.
 *
 * Нужны там, где действующая цена не важна: в юнит-тестах и как запасное
 * значение. Для показа и списания используйте `getPlans()`.
 */
export const PLAN_AMOUNTS: Record<PlanId, number> = {
  single: DEFAULT_PLANS.single.amount,
  monthly: DEFAULT_PLANS.monthly.amount,
};

/** Валидация произвольного значения как {@link PlanId}. */
export function parsePlan(value: unknown): PlanId | null {
  return value === 'single' || value === 'monthly' ? value : null;
}

/** Обратное преобразование: enum базы → «проводной» id плана. */
export function planIdFromPrisma(plan: PaymentPlan): PlanId {
  return plan === 'MONTHLY' ? 'monthly' : 'single';
}
