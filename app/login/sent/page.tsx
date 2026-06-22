/**
 * /login/sent — "Check your email" confirmation screen.
 * In development without a real mailer, shows the magic link directly.
 */
import Link from 'next/link';
import styles from '../login.module.css';

export default async function LoginSentPage({
  searchParams,
}: {
  searchParams?: Promise<{ devlink?: string }>;
}) {
  const devlink = (await searchParams)?.devlink;

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandEmoji}>💌</span>
          <span className={styles.brandName}>SayYes</span>
        </div>

        {devlink ? (
          /* Dev mode: show the link directly */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: 'rgba(255, 93, 143, 0.1)',
              border: '1px solid rgba(255, 93, 143, 0.3)',
              borderRadius: '12px',
              padding: '12px 14px',
              fontSize: '13px',
              color: 'var(--accent-soft)',
            }}>
              🛠 Dev-режим: письма не отправляются. Нажми кнопку ниже чтобы войти.
            </div>
            <h1 className={styles.heading}>Ссылка для входа</h1>
            <a
              href={devlink}
              className={styles.submitBtn}
              style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
            >
              Войти →
            </a>
            <p style={{ fontSize: '12px', color: 'var(--muted)', wordBreak: 'break-all' }}>
              {devlink}
            </p>
          </div>
        ) : (
          /* Production: standard "check your email" screen */
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '48px', lineHeight: 1 }}>📬</span>
            <h1 className={styles.heading} style={{ textAlign: 'center' }}>
              Письмо отправлено
            </h1>
            <p className={styles.subheading} style={{ textAlign: 'center' }}>
              Проверь почту — мы прислали ссылку для входа.
              Ссылка действует 15 минут.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              Не нашёл письмо? Загляни в папку «Спам».
            </p>
          </div>
        )}

        <Link href="/login" className={styles.submitBtn}
          style={{ textAlign: 'center', textDecoration: 'none', display: 'block',
            background: 'rgba(255,255,255,0.07)', marginTop: devlink ? '0' : '8px' }}>
          ← Назад
        </Link>
      </div>
    </main>
  );
}
