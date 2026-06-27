import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAuthor } from '@/lib/auth/nextCookies';
import { invitationService } from '@/lib/services/invitation';

import { LocalTime } from '@/app/components/LocalTime';
import { DeleteAccountButton } from '../invitations/CabinetActions';
import styles from './profile.module.css';

export const dynamic = 'force-dynamic';

/**
 * Страница профиля автора — `/me/profile`.
 *
 * Показывает все данные аккаунта: контактные (email, способ входа, статус
 * Telegram), дату регистрации и сводную статистику по приглашениям (сколько
 * создано, открытий и ответов собрано). Доступна только авторизованному автору.
 */
export default async function ProfilePage() {
  const author = await getCurrentAuthor();
  if (!author) {
    redirect(`/login?redirect=${encodeURIComponent('/me/profile')}`);
  }

  const invitations = await invitationService.listForAuthor(author.id);
  const totals = invitations.reduce(
    (acc, item) => {
      acc.opens += item.opens;
      acc.responses += item.responses;
      if (item.cabinetStatus === 'active' || item.cabinetStatus === 'responded') {
        acc.active += 1;
      }
      return acc;
    },
    { opens: 0, responses: 0, active: 0 },
  );

  const signInMethod = author.passwordHash ? 'Email и пароль' : 'Вход по ссылке (magic link)';
  const initial = (author.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">{initial}</div>
        <div>
          <h1 className={styles.title}>{author.email ?? 'Мой профиль'}</h1>
          <p className={styles.subtitle}>
            На платформе с <LocalTime date={author.createdAt} />
          </p>
        </div>
        <Link href="/me/invitations" className={styles.navLink}>
          Мои приглашения →
        </Link>
      </header>

      {/* Аккаунт */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Аккаунт</h2>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>Email</dt>
            <dd className={styles.rowValue}>{author.email ?? '—'}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>Способ входа</dt>
            <dd className={styles.rowValue}>{signInMethod}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>Telegram</dt>
            <dd className={styles.rowValue}>
              {author.telegramChatId ? (
                <span className={styles.ok}>Подключён</span>
              ) : (
                <span className={styles.muted}>Не подключён</span>
              )}
            </dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>Дата регистрации</dt>
            <dd className={styles.rowValue}><LocalTime date={author.createdAt} /></dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>ID аккаунта</dt>
            <dd className={`${styles.rowValue} ${styles.mono}`}>{author.id}</dd>
          </div>
        </dl>
      </section>

      {/* Статистика */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Статистика</h2>
        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{invitations.length}</span>
            <span className={styles.statLabel}>Приглашений</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{totals.active}</span>
            <span className={styles.statLabel}>Активных</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{totals.opens}</span>
            <span className={styles.statLabel}>Открытий</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{totals.responses}</span>
            <span className={styles.statLabel}>Ответов</span>
          </div>
        </div>
      </section>

      {/* Удаление аккаунта */}
      <section className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Удаление аккаунта</h2>
        <p className={styles.dangerDesc}>
          Все приглашения, ответы гостей и данные аккаунта будут удалены навсегда.
          Это действие необратимо.
        </p>
        <DeleteAccountButton />
      </section>
    </main>
  );
}
