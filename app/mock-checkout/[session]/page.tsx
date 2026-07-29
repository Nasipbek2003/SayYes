/**
 * /mock-checkout/<session> — платёжная страница-заглушка для локальной работы
 * без реального эквайринга (`PAYMENT_PROVIDER=mock`).
 *
 * Кнопки вызывают `/api/payments/mock-complete`, который прогоняет платёж через
 * тот же `PaymentService.handleWebhook`, что и настоящий вебхук Finik.
 */
import { notFound } from 'next/navigation';

import { env } from '@/lib/env';

import { MockCheckoutClient } from './MockCheckoutClient';

export const metadata = {
  title: 'Тестовая оплата — SayYes',
  robots: { index: false, follow: false },
};

export default async function MockCheckoutPage({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  if (env.nodeEnv === 'production' || env.payment.provider !== 'mock') {
    notFound();
  }

  const { session } = await params;
  return <MockCheckoutClient sessionId={session} />;
}
