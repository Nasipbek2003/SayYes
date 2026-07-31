'use client';

/**
 * Управление каталогом стикеров: загрузка, скрытие, удаление.
 *
 * Плитки показываются уменьшенными ссылками Cloudinary (`thumbUrl`), поэтому
 * страница с несколькими десятками стикеров остаётся лёгкой.
 */
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Eye, EyeOff, Trash2, Upload } from 'lucide-react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';

import styles from '../../admin.module.css';

export interface StickerAdminItem {
  id: string;
  thumbUrl: string;
  url: string;
  kind: 'IMAGE' | 'VIDEO';
  hidden: boolean;
  bytes: number | null;
}

export interface StickerAdminCategory {
  id: string;
  label: string;
  items: StickerAdminItem[];
}

function kb(bytes: number | null): string {
  if (!bytes) return '—';
  return `${Math.round(bytes / 1024).toLocaleString('ru-RU')} КБ`;
}

export function StickersManager({
  categories,
  configured,
}: {
  categories: StickerAdminCategory[];
  configured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState(categories[0]?.id ?? 'cat');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StickerAdminItem | null>(null);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = fileRef.current?.files;
    if (!files || files.length === 0) {
      setError('Выберите файлы');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('category', category.trim().toLowerCase());
        if (label.trim()) form.append('label', label.trim());

        const response = await fetch('/api/admin/stickers', { method: 'POST', body: form });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(`${file.name}: ${body?.error ?? 'не удалось загрузить'}`);
          return;
        }
      }
      if (fileRef.current) fileRef.current.value = '';
      setLabel('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(item: StickerAdminItem) {
    setBusy(true);
    try {
      await fetch(`/api/admin/stickers/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !item.hidden }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: StickerAdminItem) {
    setBusy(true);
    try {
      await fetch(`/api/admin/stickers/${item.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  return (
    <>
      {!configured ? (
        <p className={styles.authError} role="alert" style={{ marginBottom: 16 }}>
          Cloudinary не настроен — загрузка недоступна. Заполните доступы в разделе
          «Настройки».
        </p>
      ) : null}

      <form className={styles.filters} onSubmit={upload}>
        {error ? (
          <p className={styles.authError} role="alert" style={{ flexBasis: '100%' }}>
            {error}
          </p>
        ) : null}

        <input
          className={styles.input}
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Категория (bear, cat, hearts…)"
          aria-label="Слаг категории"
          required
          disabled={busy || !configured}
        />
        <input
          className={styles.input}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Подпись категории (напр. 🐱 Котик)"
          aria-label="Подпись категории"
          disabled={busy || !configured}
        />
        <input
          ref={fileRef}
          className={`${styles.input} ${styles.searchInput}`}
          type="file"
          multiple
          accept=".webp,.png,.jpg,.jpeg,.gif,.webm,.mp4"
          aria-label="Файлы стикеров"
          disabled={busy || !configured}
        />
        <button type="submit" className={styles.btn} disabled={busy || !configured}>
          <Upload size={15} aria-hidden="true" />
          {busy ? 'Загружаем…' : 'Загрузить'}
        </button>
      </form>

      {categories.length === 0 ? (
        <section className={styles.tableCard}>
          <p className={styles.empty}>
            Каталог пуст. Загрузите файлы выше или перенесите локальные:
            <br />
            <code>npx tsx scripts/upload-stickers.ts</code>
          </p>
        </section>
      ) : null}

      {categories.map((group) => (
        <section key={group.id} className={styles.card} style={{ marginBottom: 16 }}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>{group.label}</p>
              <p className={styles.cardMeta}>
                слаг <code>{group.id}</code> · {group.items.length} шт.
              </p>
            </div>
          </div>

          <div className={styles.stickerGrid}>
            {group.items.map((item) => (
              <figure
                key={item.id}
                className={`${styles.stickerCell} ${item.hidden ? styles.stickerCellHidden : ''}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.stickerThumb}
                  src={item.thumbUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className={styles.stickerMeta}>
                  <span className={`${styles.badge} ${item.kind === 'VIDEO' ? styles.badgeInfo : styles.badgeNeutral}`}>
                    {item.kind === 'VIDEO' ? 'видео' : 'картинка'}
                  </span>
                  <span className={styles.muted}>{kb(item.bytes)}</span>
                </figcaption>
                <div className={styles.stickerActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => toggleHidden(item)}
                    disabled={busy}
                    title={item.hidden ? 'Показать в каталоге' : 'Скрыть из каталога'}
                  >
                    {item.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    {item.hidden ? 'Показать' : 'Скрыть'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => setPendingDelete(item)}
                    disabled={busy}
                    title="Удалить вместе с файлом"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </figure>
            ))}
          </div>
        </section>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="dark"
        danger
        title="Удалить стикер?"
        description="Запись из каталога и файл в Cloudinary будут удалены. Приглашения, где этот стикер уже выбран, потеряют картинку."
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
