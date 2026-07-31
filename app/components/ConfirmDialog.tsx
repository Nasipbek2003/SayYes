'use client';

/**
 * Модальное подтверждение в оформлении проекта — замена `window.confirm()`.
 *
 * Системный диалог выглядит как сообщение браузера («Сайт localhost сообщает…»),
 * его нельзя оформить, и он блокирует поток. Здесь обычная модалка: фокус
 * переводится на безопасную кнопку, Escape и клик по фону отменяют действие,
 * фоновая прокрутка блокируется.
 *
 * `requireAck` добавляет обязательный чекбокс — им заменяется практика «спросить
 * confirm дважды» для необратимых операций.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка и предупреждающая иконка для необратимых действий. */
  danger?: boolean;
  /** Текст обязательного чекбокса: пока не отмечен, подтвердить нельзя. */
  requireAck?: string;
  /** Палитра: светлая (сайт) или тёмная (админ-панель). */
  variant?: 'light' | 'dark';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  requireAck,
  variant = 'light',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [acked, setAcked] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Сбрасываем подтверждение при каждом открытии и уводим фокус на «Отмену»:
  // для деструктивного действия безопасный вариант должен быть по умолчанию.
  useEffect(() => {
    if (!open) return;
    setAcked(false);
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const isDark = variant === 'dark';
  const blocked = busy || (Boolean(requireAck) && !acked);

  return (
    <div
      className={`${styles.overlay}${isDark ? ` ${styles.overlayDark}` : ''}`}
      onClick={onCancel}
    >
      <div
        className={`${styles.dialog}${isDark ? ` ${styles.dark}` : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-text' : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <span
            className={`${styles.iconBadge}${danger ? '' : ` ${styles.iconBadgeNeutral}`}`}
            aria-hidden="true"
          >
            {danger ? <AlertTriangle size={19} /> : <HelpCircle size={19} />}
          </span>
          <h2 className={styles.title} id="confirm-title">
            {title}
          </h2>
        </div>

        {description ? (
          <p className={styles.text} id="confirm-text">
            {description}
          </p>
        ) : null}

        {requireAck ? (
          <label className={styles.ack}>
            <input
              type="checkbox"
              checked={acked}
              onChange={(event) => setAcked(event.target.checked)}
            />
            {requireAck}
          </label>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            ref={cancelRef}
            className={`${styles.btn} ${styles.cancel}`}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.confirm}${danger ? ` ${styles.confirmDanger}` : ''}`}
            onClick={onConfirm}
            disabled={blocked}
          >
            {busy ? 'Выполняем…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
