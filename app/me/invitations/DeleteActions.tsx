'use client';

import { useRouter } from 'next/navigation';
import styles from './cabinet.module.css';

export function DeleteInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('Удалить это приглашение? Все данные будут потеряны.')) return;

    const res = await fetch(`/api/me/invitations/${invitationId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <button onClick={handleDelete} className={styles.deleteBtn} title="Удалить">
      Удалить
    </button>
  );
}

export function DeleteAccountButton() {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('Вы уверены? Аккаунт и все приглашения будут удалены навсегда.')) return;
    if (!confirm('Это действие необратимо. Подтвердите удаление.')) return;

    const res = await fetch('/api/me/delete-account', { method: 'DELETE' });

    if (res.ok) {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <button onClick={handleDelete} className={styles.dangerBtn}>
      Удалить аккаунт
    </button>
  );
}
