'use client';

/**
 * Возврат упавшего уведомления в очередь. Действие безопасное и обратимое:
 * запись просто снова становится PENDING, отправкой занимается воркер
 * `/api/cron/process-outbox`.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RotateCw } from 'lucide-react';

import styles from '../../admin.module.css';

export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/outbox/${id}/retry`, { method: 'POST' });
      if (response.ok) {
        router.refresh();
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.btnGhost}`}
      onClick={retry}
      disabled={busy}
    >
      <RotateCw size={14} aria-hidden="true" />
      {busy ? '…' : 'В очередь'}
    </button>
  );
}
