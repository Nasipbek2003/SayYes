/**
 * /mock-checkout/<session> — платёжная страница-заглушка для работы без
 * реального эквайринга (`PAYMENT_PROVIDER=mock`). На задеплоенном стенде
 * доступна только при `ALLOW_MOCK_PAYMENTS=true`.
 *
 * Кнопки вызывают `/api/payments/mock-complete`, который прогоняет платёж через
 * тот же `PaymentService.handleWebhook`, что и настоящий вебхук Finik.
 */
import { notFound } from 'next/navigation';

import { mockPaymentsEnabled } from '@/lib/payments/mockAccess';

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
  if (!mockPaymentsEnabled()) {
    notFound();
  }

  const { session } = await params;
  return <MockCheckoutClient sessionId={session} />;
}
