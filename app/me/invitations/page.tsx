import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAuthorId } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';
import type { CabinetStatus } from '@/lib/services/invitation';

import { CopyLinkButton, DeleteInvitationButton, DeleteAccountButton } from './CabinetActions';
import styles from './cabinet.module.css';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<CabinetStatus, string> = {
  draft: 'Черновик',
  active: 'Активно',
  responded: 'Отвечено',
  expired: 'Недоступно',
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
          <span aria-hidden="true" style={{ fontSize: 40 }}>💌</span>
          <h2 className={styles.emptyTitle}>Пока нет приглашений</h2>
          <p className={styles.emptyText}>Создай первое приглашение — выбери шаблон в галерее.</p>
          <Link href="/" className={styles.cta}>К галерее шаблонов</Link>
        </section>
      ) : (
        <div className={styles.cardList}>
          {invitations.map((item) => (
            <div key={item.id} className={styles.card}>
              {/* Заголовок карточки */}
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{item.templateName}</h2>
                  <span className={styles.cardDate}>
                    Создано: {formatDate(item.createdAt)}
                    {item.activatedAt && ` · Активировано: ${formatDate(item.activatedAt)}`}
                  </span>
                </div>
                <span className={`${styles.badge} ${styles[`badge--${item.cabinetStatus}`]}`}>
                  {STATUS_LABEL[item.cabinetStatus]}
                </span>
              </div>

              {/* Ссылка с кнопкой копирования */}
              {item.url ? (
                <div className={styles.linkBlock}>
                  <a href={item.url} className={styles.linkUrl} target="_blank" rel="noreferrer">
                    {item.url}
                  </a>
                  <CopyLinkButton url={item.url} />
                </div>
              ) : (
                <p className={styles.linkDraft}>Ссылка появится после создания приглашения.</p>
              )}

              {/* Статистика */}
              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <span className={styles.statNum}>{item.opens}</span>
                  <span className={styles.statLabel}>Открытий</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statNum}>{item.responses}</span>
                  <span className={styles.statLabel}>Ответов</span>
                </div>
              </div>

              {/* Действия */}
              <div className={styles.cardActions}>
                <Link
                  href={`/me/invitations/${encodeURIComponent(item.id)}`}
                  className={styles.detailLink}
                >
                  Подробнее →
                </Link>
                <DeleteInvitationButton invitationId={item.id} />
              </div>
            </div>
          ))}
        </div>
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
