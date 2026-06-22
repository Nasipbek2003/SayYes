import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 400 }}>
          Страница не найдена
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Проверьте адрес или вернитесь на главную.
        </p>
        <Link
          href="/"
          style={{
            background: 'var(--accent)',
            color: 'var(--text-on-cta)',
            padding: '12px 24px',
            borderRadius: 'var(--radius-btn)',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            alignSelf: 'center',
          }}
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
