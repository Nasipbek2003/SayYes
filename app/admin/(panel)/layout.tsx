/**
 * Каркас админ-панели: сайдбар + топбар + область контента.
 *
 * Лежит в route-группе `(panel)`, чтобы страница входа `/admin` осталась без
 * этого каркаса (группа не влияет на URL). Гейт стоит и здесь, и в каждой
 * странице: layout и page в App Router рендерятся параллельно, поэтому одна
 * проверка в layout не гарантирует, что данные страницы не будут запрошены.
 */
import type { Metadata } from 'next';
import { LogOut, ShieldCheck } from 'lucide-react';

import { requireAdmin } from '@/lib/admin/guard';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

import { AdminNav } from '../AdminNav';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SayYes — админ-панель',
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await requireAdmin();
  const outboxAlerts = await prisma.notificationOutbox.count({
    where: { status: 'FAILED' },
  });

  const isProd = env.nodeEnv === 'production';

  return (
    <div className={styles.shell}>
      <AdminNav outboxAlerts={outboxAlerts} />

      <div className={styles.main}>
        <header className={styles.topbar}>
          <p className={styles.topbarTitle}>Панель управления сервисом</p>

          <div className={styles.topbarRight}>
            <span className={styles.envChip}>
              <ShieldCheck size={13} aria-hidden="true" />
              {isProd ? 'production' : env.nodeEnv} · платежи:{' '}
              {env.payment.provider}
            </span>

            <div className={styles.userChip}>
              <span className={styles.userAvatar} aria-hidden="true">
                {email.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <span className={styles.userName}>{email}</span>
                <span className={styles.userRole}>Администратор</span>
              </span>
            </div>

            <form action="/api/admin/logout" method="post">
              <button type="submit" className={styles.logoutBtn}>
                <LogOut size={15} aria-hidden="true" />
                Выйти
              </button>
            </form>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
