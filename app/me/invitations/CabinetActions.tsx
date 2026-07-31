'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';

import styles from './cabinet.module.css';

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button onClick={handleCopy} className={styles.copyBtn} title="Скопировать ссылку">
      {copied ? 'Скопировано!' : 'Скопировать ссылку'}
    </button>
  );
}

export function DeleteInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/me/invitations/${invitationId}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <>
      <button onClick={() => setAsking(true)} className={styles.deleteBtn} title="Удалить">
        Удалить
      </button>

      <ConfirmDialog
        open={asking}
        danger
        title="Удалить приглашение?"
        description="Ссылка перестанет работать, а ответы гостей и статистика открытий будут удалены. Восстановить их не получится."
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

export function DeleteAccountButton() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch('/api/me/delete-account', { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <>
      <button onClick={() => setAsking(true)} className={styles.dangerBtn}>
        Удалить аккаунт
      </button>

      {/*
        Раньше здесь спрашивали confirm() дважды. Второй системный диалог заменён
        обязательным чекбоксом: то же «подумай ещё раз», но одним окном.
      */}
      <ConfirmDialog
        open={asking}
        danger
        title="Удалить аккаунт навсегда?"
        description="Будут удалены все приглашения, ответы гостей и данные аккаунта. Действие необратимо, восстановить их будет нельзя."
        requireAck="Понимаю, что данные удаляются безвозвратно"
        confirmLabel="Удалить аккаунт"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
