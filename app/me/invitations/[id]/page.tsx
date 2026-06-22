/**
 * Author cabinet — invitation detail (`/me/invitations/[id]`, task 10.3,
 * Requirements 10.2, 10.3, 8.6, 10.4).
 *
 * Server component: gates on an author session and loads the detail via
 * {@link InvitationService.getDetailForAuthor}, which enforces ownership
 * (Requirement 10.4). A request for an invitation the author does not own (403)
 * or that does not exist (404) renders Next's `notFound()` so an author can
 * never see another author's data — we deliberately collapse 403 and 404 to the
 * same "not found" screen so the existence of someone else's invitation is not
 * revealed.
 *
 * The page shows the public link, recorded opens and the guest responses
 * (Requirement 10.2). For the event template it additionally renders the RSVP
 * dashboard with the guest list and the headline totals — придёт / не придёт /
 * всего человек (Requirements 8.6, 10.3).
 */
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
    redirect(
      `/login?redirect=${encodeURIComponent(`/me/invitations/${id}`)}`,
    );
  }

  let detail: CabinetDetail;
  try {
    detail = await invitationService.getDetailForAuthor(id, authorId);
  } catch (error) {
    // Collapse "not found" (404) and "forbidden" (403) to the same screen so we
    // don't reveal that another author's invitation exists (Requirement 10.4).
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
        <span
          className={`${styles.badge} ${styles[`badge--${detail.cabinetStatus}`]}`}
        >
          {STATUS_LABEL[detail.cabinetStatus]}
        </span>
      </header>

      {/* Link + open stats (Requirement 10.2) */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Ссылка</h2>
        {detail.url ? (
          <div className={styles.linkRow}>
            <a
              href={detail.url}
              className={styles.itemLink}
              target="_blank"
              rel="noreferrer"
            >
              {detail.url}
            </a>
          </div>
        ) : (
          <p className={styles.muted}>
            Ссылка появится после оплаты и активации приглашения.
          </p>
        )}

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{detail.openCount}</span>
            <span className={styles.statLabel}>Открытий</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>{detail.responses.length}</span>
            <span className={styles.statLabel}>Ответов</span>
          </div>
        </div>
      </section>

      {/* RSVP dashboard for the event template (Requirements 8.6, 10.3) */}
      {detail.rsvp ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>RSVP-дашборд</h2>
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
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Гость</th>
                  <th>Статус</th>
                  <th>Человек</th>
                </tr>
              </thead>
              <tbody>
                {detail.rsvp.guests.map((guest, index) => (
                  <tr key={index}>
                    <td>{guest.guestName ?? <span className={styles.muted}>Без имени</span>}</td>
                    <td>{RSVP_LABEL[guest.decision]}</td>
                    <td>{guest.decision === 'yes' ? guest.people : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        /* Generic response list for the date templates (Requirement 10.2) */
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ответы</h2>
          {detail.responses.length === 0 ? (
            <p className={styles.muted}>Пока нет ответов.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Гость</th>
                  <th>Ответ</th>
                </tr>
              </thead>
              <tbody>
                {detail.responses.map((response) => (
                  <tr key={response.id}>
                    <td>
                      {response.guestName ?? (
                        <span className={styles.muted}>Без имени</span>
                      )}
                    </td>
                    <td>{describeOutcome(response.outcome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

/**
 * Render a short, human-readable summary of a stored response outcome for the
 * non-RSVP templates (согласие/отказ + выбранное место/время). Tolerant of an
 * arbitrary JSON shape.
 */
function describeOutcome(outcome: unknown): string {
  if (!outcome || typeof outcome !== 'object') return '—';
  const record = outcome as Record<string, unknown>;
  const parts: string[] = [];

  const type = record['type'];
  if (type === 'accepted') parts.push('Согласие');
  else if (type === 'declined') parts.push('Отказ');
  else if (type === 'rsvp') {
    parts.push(record['rsvp'] === 'yes' ? 'Приду' : 'Не смогу');
  }

  if (typeof record['place'] === 'string' && record['place'].trim() !== '') {
    parts.push(`место: ${record['place']}`);
  }
  if (typeof record['time'] === 'string' && record['time'].trim() !== '') {
    parts.push(`время: ${record['time']}`);
  }

  return parts.length > 0 ? parts.join(', ') : '—';
}
