import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError } from '@/lib/auth/guards';
import { getCurrentAuthorId } from '@/lib/auth/nextCookies';
import {
  InvitationServiceError,
  invitationService,
} from '@/lib/services/invitation';
import type {
  CabinetDetail,
  CabinetStatus,
} from '@/lib/services/invitation';

import { CopyLinkButton } from '../CabinetActions';
import { LocalTime } from '@/app/components/LocalTime';
import styles from '../cabinet.module.css';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<CabinetStatus, string> = {
  draft: 'Черновик',
  active: 'Активно',
  responded: 'Отвечено',
  expired: 'Недоступно',
};

const RSVP_LABEL: Record<'yes' | 'no' | 'unknown', string> = {
  yes: 'Приду',
  no: 'Не смогу',
  unknown: '—',
};

export default async function CabinetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authorId = await getCurrentAuthorId();
  if (!authorId) {
    redirect(`/login?redirect=${encodeURIComponent(`/me/invitations/${id}`)}`);
  }

  let detail: CabinetDetail;
  try {
    detail = await invitationService.getDetailForAuthor(id, authorId);
  } catch (error) {
    if (
      error instanceof AuthError ||
      (error instanceof InvitationServiceError && error.status === 404)
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <main className={styles.page}>
      <Link href="/me/invitations" className={styles.back}>
        ← Все приглашения
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>{detail.templateName}</h1>
        <span className={`${styles.badge} ${styles[`badge--${detail.cabinetStatus}`]}`}>
          {STATUS_LABEL[detail.cabinetStatus]}
        </span>
      </header>

      {/* Ссылка с кнопкой копирования */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Ссылка приглашения</h2>
        {detail.url ? (
          <div className={styles.linkBlock}>
            <a href={detail.url} className={styles.linkUrl} target="_blank" rel="noreferrer">
              {detail.url}
            </a>
            <CopyLinkButton url={detail.url} />
          </div>
        ) : (
          <p className={styles.muted}>Ссылка появится после создания приглашения.</p>
        )}

        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{detail.openCount}</span>
            <span className={styles.statLabel}>Открытий</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNum}>{detail.responses.length}</span>
            <span className={styles.statLabel}>Ответов</span>
          </div>
        </div>
      </section>

      {/* Открытия */}
      {detail.opens.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Кто открыл ссылку</h2>
          <div className={styles.eventList}>
            {detail.opens.map((open, i) => (
              <div key={i} className={styles.eventCard}>
                <span className={styles.eventEmoji}>👁</span>
                <div>
                  <p className={styles.eventMain}>Ссылку открыли</p>
                  <p className={styles.eventMeta}><LocalTime date={open.openedAt} /></p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RSVP-дашборд */}
      {detail.rsvp ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ответы гостей</h2>
          <div className={styles.totals}>
            <div className={styles.totalCard}>
              <div className={styles.totalNum}>{detail.rsvp.coming}</div>
              <div className={styles.totalLabel}>Придёт</div>
            </div>
            <div className={styles.totalCard}>
              <div className={styles.totalNum}>{detail.rsvp.notComing}</div>
              <div className={styles.totalLabel}>Не придёт</div>
            </div>
            <div className={styles.totalCard}>
              <div className={styles.totalNum}>{detail.rsvp.totalPeople}</div>
              <div className={styles.totalLabel}>Всего человек</div>
            </div>
          </div>
          {detail.rsvp.guests.length === 0 ? (
            <p className={styles.muted}>Пока никто не ответил.</p>
          ) : (
            <div className={styles.eventList}>
              {detail.rsvp.guests.map((guest, i) => (
                <div key={i} className={styles.eventCard}>
                  <span className={styles.eventEmoji}>{guest.decision === 'yes' ? '✅' : '❌'}</span>
                  <div>
                    <p className={styles.eventMain}>
                      <strong>{guest.guestName ?? 'Без имени'}</strong> — {RSVP_LABEL[guest.decision]}
                      {guest.decision === 'yes' && guest.people > 1 ? ` (${guest.people} чел.)` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ответы</h2>
          {detail.responses.length === 0 ? (
            <p className={styles.muted}>Пока никто не ответил. Отправь ссылку адресату!</p>
          ) : (
            <div className={styles.eventList}>
              {detail.responses.map((response) => (
                <div key={response.id} className={styles.eventCard}>
                  <span className={styles.eventEmoji}>{outcomeEmoji(response.outcome)}</span>
                  <div>
                    <p className={styles.eventMain}>
                      {describeOutcome(response.outcome)}
                    </p>
                    <p className={styles.eventMeta}><LocalTime date={response.createdAt} /></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function outcomeEmoji(outcome: unknown): string {
  if (!outcome || typeof outcome !== 'object') return '💬';
  const r = outcome as Record<string, unknown>;
  if (r['type'] === 'accepted') return '💚';
  if (r['type'] === 'declined') return '💔';
  return '💬';
}

function describeOutcome(outcome: unknown): string {
  if (!outcome || typeof outcome !== 'object') return 'Ответ получен';
  const r = outcome as Record<string, unknown>;
  const parts: string[] = [];

  if (r['type'] === 'accepted') parts.push('Согласился(ась)!');
  else if (r['type'] === 'declined') parts.push('Отказался(ась)');
  else parts.push('Ответ получен');

  if (typeof r['place'] === 'string' && r['place'].trim()) {
    parts.push(`Место: ${r['place']}`);
  }
  if (typeof r['time'] === 'string' && r['time'].trim()) {
    parts.push(`Время: ${r['time']}`);
  }

  return parts.join(' · ');
}
