/**
 * Author cabinet — invitation list (`/me/invitations`, task 10.3,
 * Requirements 10.1, 10.4).
 *
 * Server component: it gates on an author session (Requirement 10.4 — only the
 * author sees their cabinet) and renders the author's invitations with a status
 * badge ("черновик / активно / отвечено"), the public link once active and the
 * open/response counts (Requirement 10.1). An unauthenticated visitor is
 * redirected to `/login` with a `redirect` back here.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAuthorId } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';
import type { CabinetStatus } from '@/lib/services/invitation';

import { DeleteInvitationButton, DeleteAccountButton } from './DeleteActions';
import styles from './cabinet.module.css';

export const dynamic = 'force-dynamic';

/** Russian label for each derived cabinet status (Requirement 10.1). */
const STATUS_LABEL: Record<CabinetStatus, string> = {
  draft: 'Черновик',
  active: 'Активно',
  responded: 'Отвечено',
  expired: 'Недоступно',
};

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
      </header>

      {invitations.length === 0 ? (
        <section className={styles.empty} role="status">
          <span aria-hidden="true" style={{ fontSize: 40 }}>
            💌
          </span>
          <h2 className={styles.emptyTitle}>Пока нет приглашений</h2>
          <p className={styles.emptyText}>
            Создай первое приглашение — выбери шаблон в галерее.
          </p>
          <Link href="/" className={styles.cta}>
            К галерее шаблонов
          </Link>
        </section>
      ) : (
        <ul className={styles.list}>
          {invitations.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemMain}>
                <Link
                  href={`/me/invitations/${encodeURIComponent(item.id)}`}
                  className={styles.itemName}
                >
                  {item.templateName}
                </Link>
                <span className={styles.itemMeta}>
                  Открытий: {item.opens} · Ответов: {item.responses}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className={`${styles.badge} ${styles[`badge--${item.cabinetStatus}`]}`}
                >
                  {STATUS_LABEL[item.cabinetStatus]}
                </span>
                <DeleteInvitationButton invitationId={item.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Danger zone */}
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
