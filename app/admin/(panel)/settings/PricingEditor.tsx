'use client';

/**
 * Редактор тарифов. Значения уходят в таблицу `Setting`, поэтому применяются
 * сразу — без редеплоя и правки `.env`.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save } from 'lucide-react';

import styles from '../../admin.module.css';

export interface PricingValues {
  singleAmount: number;
  monthlyAmount: number;
  monthlyPeriodDays: number;
}

export function PricingEditor({ initial }: { initial: PricingValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function field(key: keyof PricingValues) {
    return {
      value: String(values[key]),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setSaved(false);
        setValues((prev) => ({ ...prev, [key]: Number(event.target.value) }));
      },
    };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Не удалось сохранить');
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.filters} onSubmit={submit}>
      {error ? (
        <p className={styles.authError} role="alert" style={{ flexBasis: '100%' }}>
          {error}
        </p>
      ) : null}

      <label className={styles.kv}>
        <span className={styles.kvKey}>Разовая оплата, сом</span>
        <input
          className={styles.input}
          type="number"
          min={1}
          step={1}
          required
          disabled={busy}
          {...field('singleAmount')}
        />
      </label>

      <label className={styles.kv}>
        <span className={styles.kvKey}>Подписка, сом</span>
        <input
          className={styles.input}
          type="number"
          min={1}
          step={1}
          required
          disabled={busy}
          {...field('monthlyAmount')}
        />
      </label>

      <label className={styles.kv}>
        <span className={styles.kvKey}>Срок подписки, дней</span>
        <input
          className={styles.input}
          type="number"
          min={1}
          step={1}
          required
          disabled={busy}
          {...field('monthlyPeriodDays')}
        />
      </label>

      <button type="submit" className={styles.btn} disabled={busy}>
        <Save size={15} aria-hidden="true" />
        {busy ? 'Сохраняем…' : 'Сохранить цены'}
      </button>

      {saved ? (
        <span className={`${styles.badge} ${styles.badgeSuccess}`}>Сохранено</span>
      ) : null}
    </form>
  );
}
