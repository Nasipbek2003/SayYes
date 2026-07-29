/**
 * Тарифы SayYes — единственный источник правды по ценам.
 *
 * Два варианта оплаты:
 *  - `single`  — разовая оплата одного приглашения, 100 сом;
 *  - `monthly` — подписка на месяц, 300 сом: 30 дней публикуй приглашения
 *    без отдельной оплаты.
 *
 * Суммы — в целых сомах (KGS), как их принимает Finik в поле `Amount`.
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

export const PLANS: Record<PlanId, Plan> = {
  single: {
    id: 'single',
    prismaPlan: 'SINGLE',
    title: 'Разовая оплата',
    amount: 100,
    currency: 'KGS',
    periodDays: null,
    description: 'Одно приглашение',
  },
  monthly: {
    id: 'monthly',
    prismaPlan: 'MONTHLY',
    title: 'Подписка на месяц',
    amount: 300,
    currency: 'KGS',
    periodDays: 30,
    description: 'Неограниченные приглашения на 30 дней',
  },
};

/** Список планов в порядке показа в UI. */
export const PLAN_LIST: Plan[] = [PLANS.single, PLANS.monthly];

/** Сумма к списанию по плану, в целых сомах. */
export const PLAN_AMOUNTS: Record<PlanId, number> = {
  single: PLANS.single.amount,
  monthly: PLANS.monthly.amount,
};

/** Валидация произвольного значения как {@link PlanId}. */
export function parsePlan(value: unknown): PlanId | null {
  return value === 'single' || value === 'monthly' ? value : null;
}

/** Обратное преобразование: enum базы → «проводной» id плана. */
export function planIdFromPrisma(plan: PaymentPlan): PlanId {
  return plan === 'MONTHLY' ? 'monthly' : 'single';
}
