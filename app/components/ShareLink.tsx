'use client';

/**
 * Готовая ссылка приглашения + кнопка «Скопировать».
 *
 * Показывается автору после публикации: приглашение открывает *адресат*, а не
 * автор, поэтому мы не ведём автора на ссылку автоматически, а даём её
 * скопировать и отправить. Кнопка работает и без Clipboard API (fallback на
 * скрытое поле + `execCommand`), т.к. в мобильных вебвью прав может не быть.
 */
import { useState } from 'react';

import styles from './ShareLink.module.css';

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.url} title={url}>
        {url}
      </p>
      <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
        {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </button>
    </div>
  );
}
