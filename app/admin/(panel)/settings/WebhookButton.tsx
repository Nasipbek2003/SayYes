'use client';

/**
 * Кнопка перерегистрации вебхука Telegram.
 *
 * Адрес не вводится руками: сервер берёт его из самого запроса. Нажатие в
 * панели на проде регистрирует прод-домен, нажатие в локальном туннеле — адрес
 * туннеля. Это же решает частую поломку: туннель перезапустился, адрес сменился,
 * бот молча перестал получать сообщения.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

import styles from '../../admin.module.css';

export function WebhookButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/telegram/webhook', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok) {
        setError(body?.error ?? 'Не удалось перенастроить');
        return;
      }
      setMessage(`Вебхук указывает на ${body?.url}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <button type="button" className={styles.btn} onClick={apply} disabled={busy}>
        <RefreshCw size={15} aria-hidden="true" />
        {busy ? 'Настраиваем…' : 'Перенастроить вебхук на этот адрес'}
      </button>

      {message ? (
        <span className={`${styles.badge} ${styles.badgeSuccess}`}>{message}</span>
      ) : null}
      {error ? (
        <span className={`${styles.badge} ${styles.badgeDanger}`}>{error}</span>
      ) : null}
    </div>
  );
}
