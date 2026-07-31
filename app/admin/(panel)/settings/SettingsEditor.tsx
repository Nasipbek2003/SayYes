'use client';

/**
 * Редактор настроек из таблицы `Setting`.
 *
 * Значения секретов сюда не приходят — только маска, поэтому «изменить секрет»
 * означает записать новое значение поверх, а не отредактировать старое.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';

import styles from '../../admin.module.css';

export interface SettingItem {
  key: string;
  display: string;
  isSecret: boolean;
  description: string | null;
  updatedAt: string;
}

export function SettingsEditor({ items }: { items: SettingItem[] }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Ключ, удаление которого ждёт подтверждения в модалке. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, description, isSecret }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Не удалось сохранить');
        return;
      }
      setKey('');
      setValue('');
      setDescription('');
      setIsSecret(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/settings?key=${encodeURIComponent(target)}`, {
        method: 'DELETE',
      });
      router.refresh();
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  return (
    <>
      <form className={styles.filters} onSubmit={save}>
        {error ? (
          <p className={styles.authError} role="alert" style={{ flexBasis: '100%' }}>
            {error}
          </p>
        ) : null}
        <input
          className={styles.input}
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Ключ (например finik.api_key)"
          aria-label="Ключ настройки"
          required
          disabled={busy}
        />
        <input
          className={`${styles.input} ${styles.searchInput}`}
          type={isSecret ? 'password' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Значение"
          aria-label="Значение настройки"
          autoComplete="off"
          required
          disabled={busy}
        />
        <input
          className={styles.input}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание (необязательно)"
          aria-label="Описание настройки"
          disabled={busy}
        />
        <label className={styles.chip} style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(e) => setIsSecret(e.target.checked)}
            disabled={busy}
          />{' '}
          секрет (шифровать)
        </label>
        <button type="submit" className={styles.btn} disabled={busy}>
          <Save size={15} aria-hidden="true" />
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>

      <section className={styles.tableCard}>
        {items.length === 0 ? (
          <p className={styles.empty}>
            Настроек пока нет. Секрет подписи админ-сессии появится здесь
            автоматически, если убрать его из окружения.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ключ</th>
                  <th>Значение</th>
                  <th>Описание</th>
                  <th>Обновлено</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key}>
                    <td className={`${styles.mono} ${styles.strong}`}>{item.key}</td>
                    <td>
                      {item.isSecret ? (
                        <span className={`${styles.badge} ${styles.badgeWarning}`}>
                          {item.display} секрет
                        </span>
                      ) : (
                        <span className={styles.mono}>{item.display}</span>
                      )}
                    </td>
                    <td className={styles.muted} style={{ whiteSpace: 'normal', maxWidth: 360 }}>
                      {item.description ?? '—'}
                    </td>
                    <td className={styles.muted}>
                      {new Date(item.updatedAt).toLocaleString('ru-RU')}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        onClick={() => setPendingDelete(item.key)}
                        disabled={busy}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="dark"
        danger
        title="Удалить настройку?"
        description={
          pendingDelete
            ? `Значение ключа «${pendingDelete}» будет удалено из базы. Если его использует интеграция, она перестанет работать до повторного заполнения.`
            : undefined
        }
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
