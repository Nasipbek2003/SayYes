'use client';

/**
 * Форматирует дату/время в локальном часовом поясе браузера пользователя.
 *
 * Серверные компоненты Next.js работают в UTC — поэтому toLocaleDateString()
 * на сервере всегда возвращает UTC-время, а не время пользователя. Этот
 * клиентский компонент решает проблему: браузер знает свой часовой пояс
 * и форматирует дату правильно.
 *
 * При SSR рендерится пустая строка (избегаем hydration mismatch), после
 * гидрации — локальное время.
 */
import { useEffect, useState } from 'react';

interface LocalTimeProps {
  /** ISO-строка или объект Date */
  date: Date | string;
  className?: string;
}

export function LocalTime({ date, className }: LocalTimeProps) {
  const [formatted, setFormatted] = useState<string>('');

  useEffect(() => {
    setFormatted(
      new Date(date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, [date]);

  // До гидрации — пустая строка чтобы избежать mismatch
  if (!formatted) return null;

  return <span className={className}>{formatted}</span>;
}
