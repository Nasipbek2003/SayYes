/**
 * /payment/callback — страница, на которую Finik возвращает автора после оплаты
 * (значение `RedirectUrl` в запросе создания платежа).
 *
 * Сама логика в клиентском компоненте: он опрашивает статус платежа, пока
 * вебхук не подтвердит оплату.
 */
import { Suspense } from 'react';

import { CallbackClient } from './CallbackClient';
import styles from '../payment.module.css';

export const metadata = {
  title: 'Оплата — SayYes',
  robots: { index: false, follow: false },
};

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <section className={styles.card}>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.text}>Проверяем платёж…</p>
          </section>
        </main>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}
