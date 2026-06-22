/**
 * Sign-in page — email magic-link flow.
 *
 * Posts the email to `/api/auth/magic-link/request`; the dev ConsoleMailer
 * prints the sign-in link to the server console.
 */
import Link from 'next/link';
import styles from './login.module.css';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; redirect?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const error = params.error;
  const redirectTo = params.redirect ?? '/';

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        {/* Logo / Brand */}
        <div className={styles.brand}>
          <span className={styles.brandEmoji}>💌</span>
          <span className={styles.brandName}>SayYes</span>
        </div>

        <h1 className={styles.heading}>Войти</h1>
        <p className={styles.subheading}>
          Введи email — мы пришлём тебе ссылку для входа
        </p>

        {error ? (
          <div className={styles.errorBox} role="alert">
            Ссылка недействительна или устарела. Запроси новую.
          </div>
        ) : null}

        <form method="post" action="/api/auth/magic-link/request" className={styles.form}>
          {/* Pass the redirect param through so the API can return the user after login */}
          <input type="hidden" name="redirect" value={redirectTo} />

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="твой@email.com"
              className={styles.input}
            />
          </div>

          <button type="submit" className={styles.submitBtn}>
            Отправить ссылку для входа
          </button>
        </form>

        <p className={styles.footer}>
          Нет аккаунта?{' '}
          <Link href={`/login?redirect=${encodeURIComponent(redirectTo)}`} className={styles.footerLink}>
            Он создастся автоматически при входе
          </Link>
        </p>
      </div>
    </main>
  );
}
