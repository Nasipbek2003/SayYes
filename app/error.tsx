'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 400 }}>
          Что-то пошло не так
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Произошла непредвиденная ошибка. Попробуйте обновить страницу.
        </p>
        <button
          onClick={reset}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--text-on-cta)',
            padding: '12px 24px',
            borderRadius: 'var(--radius-btn)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            alignSelf: 'center',
          }}
        >
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
