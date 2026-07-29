import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAuthorId } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';

import { DeleteAccountButton } from './CabinetActions';
import { InvitationsList } from './InvitationsList';
import styles from './cabinet.module.css';

export const dynamic = 'force-dynamic';

export default async function CabinetListPage() {
  const authorId = await getCurrentAuthorId();
  if (!authorId) {
    redirect(`/login?redirect=${encodeURIComponent('/me/invitations')}`);
  }

  const invitations = await invitationService.listForAuthor(authorId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Мои приглашения</h1>
        <p className={styles.subtitle}>
          Отслеживай статусы, открытия и ответы по своим приглашениям.
        </p>
        <Link href="/me/profile" className={styles.profileLink}>
          Профиль →
        </Link>
      </header>

      {invitations.length === 0 ? (
        <section className={styles.empty} role="status">
          <span aria-hidden="true" style={{ fontSize: 40 }}>💌</span>
          <h2 className={styles.emptyTitle}>Пока нет приглашений</h2>
          <p className={styles.emptyText}>Создай первое приглашение — выбери шаблон в галерее.</p>
          <Link href="/" className={styles.cta}>К галерее шаблонов</Link>
        </section>
      ) : (
        <InvitationsList invitations={invitations} />
      )}

      <div className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Удаление аккаунта</h2>
        <p className={styles.dangerDesc}>
          Все приглашения, ответы гостей и данные аккаунта будут удалены навсегда.
          Это действие необратимо.
        </p>
        <DeleteAccountButton />
      </div>
    </main>
  );
}
