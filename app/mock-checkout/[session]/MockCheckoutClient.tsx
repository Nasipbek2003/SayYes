'use client';

/**
 * Клиентская часть тестовой оплаты: два исхода — успех и отказ. После вызова
 * `/api/payments/mock-complete` уводит на ту же страницу возврата, что и Finik.
 */
import { useState } from 'react';

import styles from '../../payment/payment.module.css';

interface Props {
  sessionId: string;
}

export function MockCheckoutClient({ sessionId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete(status: 'succeeded' | 'failed') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/mock-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: sessionId, status }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Не удалось завершить тестовый платёж.');
      }
      window.location.href = `/payment/callback?session=${encodeURIComponent(sessionId)}`;
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Ошибка тестовой оплаты.');
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Тестовая оплата</h1>
        <p className={styles.text}>
          Реальный эквайринг выключен (<code>PAYMENT_PROVIDER=mock</code>). Выбери
          исход платежа — дальше всё пойдёт по обычному сценарию.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => complete('succeeded')}
          >
            Оплатить
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => complete('failed')}
          >
            Отказ
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </section>
    </main>
  );
}
