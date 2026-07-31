/**
 * Единственная точка входа в админ-панель — `/admin`.
 *
 * На сайте нет ни одной ссылки сюда: адрес нужно знать. Страница отдаёт форму
 * входа; при действующей сессии сразу уводит на дашборд. Все вложенные
 * `/admin/*` закрыты middleware и собственным гейтом.
 */
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Heart, ShieldCheck } from 'lucide-react';

import { isAdminConfigured } from '@/lib/admin/credentials';
import { getAdminEmail } from '@/lib/admin/guard';

import { LoginForm } from './LoginForm';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

/** Панель не должна попадать в индекс поисковиков. */
export const metadata: Metadata = {
  title: 'SayYes — админ-панель',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const email = await getAdminEmail();
  if (email) {
    redirect('/admin/dashboard');
  }

  const configured = await isAdminConfigured();

  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <div className={styles.authBrand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Heart size={18} strokeWidth={2.4} />
          </span>
          <span>
            <span className={styles.brandName}>SayYes</span>
            <span className={styles.brandSub}>Admin</span>
          </span>
        </div>

        <h1 className={styles.authTitle}>Вход в панель</h1>
        <p className={styles.authSubtitle}>
          Служебный раздел: транзакции, пользователи, подписки и очередь
          уведомлений.
        </p>

        {configured ? (
          <LoginForm />
        ) : (
          <>
            <p className={styles.authError} role="alert">
              Панель не настроена: нет ни одного пользователя с ролью{' '}
              <code>ADMIN</code>. Создайте его командой{' '}
              <code>npm run admin:create</code>.
            </p>
            <LoginForm disabled />
          </>
        )}

        <p className={styles.authNote}>
          <ShieldCheck size={13} aria-hidden="true" /> Сессия живёт 30 дней и
          продлевается при работе в панели: закрытие вкладки не требует
          повторного входа. Cookie <code>httpOnly</code> +{' '}
          <code>SameSite=Strict</code>.
        </p>
      </section>
    </main>
  );
}
