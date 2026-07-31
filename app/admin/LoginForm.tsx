'use client';

/**
 * Форма входа в админку. Отправляет JSON на `/api/admin/login`; при успехе
 * делает `router.refresh()` — cookie уже установлена, серверный компонент
 * `/admin` увидит сессию и отдаст редирект на дашборд.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogIn } from 'lucide-react';

import styles from './admin.module.css';

export function LoginForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Не удалось войти');
        setBusy(false);
        return;
      }
      router.replace('/admin/dashboard');
      router.refresh();
    } catch {
      setError('Сеть недоступна. Попробуйте ещё раз.');
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {error ? (
        <p className={styles.authError} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="admin-login">
          Логин или email
        </label>
        <input
          id="admin-login"
          className={`${styles.input} ${styles.authInput}`}
          type="text"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          disabled={disabled || busy}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="admin-password">
          Пароль
        </label>
        <input
          id="admin-password"
          className={`${styles.input} ${styles.authInput}`}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={disabled || busy}
        />
      </div>

      <button type="submit" className={`${styles.btn} ${styles.submit}`} disabled={disabled || busy}>
        <LogIn size={16} aria-hidden="true" />
        {busy ? 'Проверяем…' : 'Войти в панель'}
      </button>
    </form>
  );
}
