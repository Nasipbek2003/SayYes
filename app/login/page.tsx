'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Heart } from 'lucide-react';
import styles from './login.module.css';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Введите корректный email.',
  invalid_credentials: 'Неверный email или пароль.',
  weak_password: 'Пароль должен быть минимум 6 символов.',
  email_taken: 'Этот email уже зарегистрирован. Войдите.',
};

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const redirectTo = searchParams.get('redirect') ?? '/';
  const initialTab = searchParams.get('tab') === 'register' ? 'register' : 'login';
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);

  const errorMessage = error ? ERROR_MESSAGES[error] ?? 'Произошла ошибка. Попробуйте снова.' : null;

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Heart fill="#E8625A" color="#E8625A" size={26} strokeWidth={0} />
          <span className={styles.brandName}>SayYes</span>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => setTab('login')}
          >
            Вход
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => setTab('register')}
          >
            Регистрация
          </button>
        </div>

        {errorMessage && (
          <div className={styles.errorBox} role="alert">
            {errorMessage}
          </div>
        )}

        {tab === 'login' ? (
          <>
            <h1 className={styles.heading}>Войти в аккаунт</h1>
            <form
              method="post"
              action="/api/auth/login"
              className={styles.form}
            >
              <input type="hidden" name="redirect" value={redirectTo} />
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="твой@email.com"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-password">Пароль</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Минимум 6 символов"
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.submitBtn}>
                Войти
              </button>
            </form>
            <p className={styles.footer}>
              Нет аккаунта?{' '}
              <button
                type="button"
                className={styles.footerLink}
                onClick={() => setTab('register')}
              >
                Зарегистрироваться
              </button>
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.heading}>Создать аккаунт</h1>
            <form
              method="post"
              action="/api/auth/register"
              className={styles.form}
            >
              <input type="hidden" name="redirect" value={redirectTo} />
              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="твой@email.com"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-password">Пароль</label>
                <input
                  id="reg-password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Минимум 6 символов"
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.submitBtn}>
                Зарегистрироваться
              </button>
            </form>
            <p className={styles.footer}>
              Уже есть аккаунт?{' '}
              <button
                type="button"
                className={styles.footerLink}
                onClick={() => setTab('login')}
              >
                Войти
              </button>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
