'use client';

/**
 * Доступы Cloudinary. Хранятся в таблице `Setting`, секрет — зашифрованным и
 * наружу не отдаётся: поле секрета всегда пустое, заполняется только при замене.
 * Перед сохранением сервер проверяет ключи на реальном API.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save } from 'lucide-react';

import styles from '../../admin.module.css';

export function CloudinaryEditor({
  initial,
}: {
  initial: { cloudName: string; apiKey: string; uploadFolder: string; secretSet: boolean };
}) {
  const router = useRouter();
  const [cloudName, setCloudName] = useState(initial.cloudName);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [apiSecret, setApiSecret] = useState('');
  const [uploadFolder, setUploadFolder] = useState(initial.uploadFolder);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/admin/cloudinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudName, apiKey, apiSecret, uploadFolder }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Не удалось сохранить');
        return;
      }
      setApiSecret('');
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
        <span className={styles.kvKey}>Cloud name</span>
        <input
          className={styles.input}
          type="text"
          value={cloudName}
          onChange={(e) => setCloudName(e.target.value)}
          disabled={busy}
          required
        />
      </label>

      <label className={styles.kv}>
        <span className={styles.kvKey}>API key</span>
        <input
          className={styles.input}
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={busy}
          required
        />
      </label>

      <label className={styles.kv}>
        <span className={styles.kvKey}>
          API secret {initial.secretSet ? '(задан — заполните для замены)' : ''}
        </span>
        <input
          className={styles.input}
          type="password"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          placeholder={initial.secretSet ? '••••••••' : ''}
          autoComplete="off"
          disabled={busy}
        />
      </label>

      <label className={styles.kv}>
        <span className={styles.kvKey}>Папка проекта</span>
        <input
          className={styles.input}
          type="text"
          value={uploadFolder}
          onChange={(e) => setUploadFolder(e.target.value)}
          disabled={busy}
        />
      </label>

      <button type="submit" className={styles.btn} disabled={busy}>
        <Save size={15} aria-hidden="true" />
        {busy ? 'Проверяем…' : 'Сохранить'}
      </button>

      {saved ? (
        <span className={`${styles.badge} ${styles.badgeSuccess}`}>Сохранено</span>
      ) : null}
    </form>
  );
}
