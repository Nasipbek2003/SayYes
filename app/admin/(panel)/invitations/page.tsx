/**
 * Приглашения: воронка «черновик → ждёт оплаты → активно → истекло», открытия
 * и ответы гостей. Токен приглашения намеренно не показываем целиком — это
 * capability-ссылка, по которой открывается приглашение.
 */
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { InvitationStatus, Tier } from '@prisma/client';

import { requireAdmin } from '@/lib/admin/guard';
import { listInvitations } from '@/lib/admin/queries';

import { StyledSelect } from '@/app/components/StyledSelect';

import styles from '../../admin.module.css';
import {
  InvitationStatusBadge,
  Pager,
  TierBadge,
  dateTime,
  num,
  shortId,
} from '../../ui';

export const dynamic = 'force-dynamic';

const STATUSES: InvitationStatus[] = ['DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'EXPIRED'];
const TIERS: Tier[] = ['BASIC', 'PREMIUM'];

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const status = STATUSES.includes(single(sp.status) as InvitationStatus)
    ? (single(sp.status) as InvitationStatus)
    : undefined;
  const tier = TIERS.includes(single(sp.tier) as Tier)
    ? (single(sp.tier) as Tier)
    : undefined;
  const q = single(sp.q);
  const page = Number(single(sp.page) ?? '1') || 1;

  const result = await listInvitations({ status, tier, q, page });

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Приглашения</h1>
        <p className={styles.pageSubtitle}>Найдено {num(result.total)} приглашений</p>
      </div>

      <form className={styles.filters} method="get">
        <input
          className={`${styles.input} ${styles.searchInput}`}
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Email автора, id, токен или шаблон"
          aria-label="Поиск по приглашениям"
        />
        <StyledSelect
          name="status"
          label="Статус"
          variant="dark"
          className={styles.filterSelect}
          value={status ?? ''}
          options={[
            { value: '', label: 'Все статусы' },
            { value: 'DRAFT', label: 'Черновик' },
            { value: 'PENDING_PAYMENT', label: 'Ждёт оплаты' },
            { value: 'ACTIVE', label: 'Активно' },
            { value: 'EXPIRED', label: 'Истекло' },
          ]}
        />
        <StyledSelect
          name="tier"
          label="Уровень"
          variant="dark"
          className={styles.filterSelect}
          value={tier ?? ''}
          options={[
            { value: '', label: 'Все уровни' },
            { value: 'BASIC', label: 'Basic' },
            { value: 'PREMIUM', label: 'Premium' },
          ]}
        />
        <button type="submit" className={styles.btn}>
          <Search size={15} aria-hidden="true" />
          Применить
        </button>
        <Link href="/admin/invitations" className={`${styles.btn} ${styles.btnGhost}`}>
          Сбросить
        </Link>
      </form>

      <section className={styles.tableCard}>
        {result.items.length === 0 ? (
          <p className={styles.empty}>Под фильтр ничего не попало</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Шаблон / id</th>
                    <th>Автор</th>
                    <th>Тема</th>
                    <th>Уровень</th>
                    <th>Статус</th>
                    <th className={styles.numeric}>Открытий</th>
                    <th className={styles.numeric}>Ответов</th>
                    <th>Telegram</th>
                    <th>Создано</th>
                    <th>Истекает</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className={styles.strong}>{i.templateId}</span>
                        <br />
                        <span className={`${styles.mono} ${styles.muted}`}>{shortId(i.id)}</span>
                      </td>
                      <td>
                        <Link href={`/admin/users/${i.authorId}`} className={styles.rowLink}>
                          {i.email ?? shortId(i.authorId)}
                        </Link>
                      </td>
                      <td className={styles.muted}>{i.themeId}</td>
                      <td>
                        <TierBadge tier={i.tier} />
                      </td>
                      <td>
                        <InvitationStatusBadge status={i.status} />
                        {i.oneTimeView ? (
                          <>
                            {' '}
                            <span className={`${styles.badge} ${styles.badgeInfo}`}>1 просмотр</span>
                          </>
                        ) : null}
                      </td>
                      <td className={styles.numeric}>{num(i.opens)}</td>
                      <td className={styles.numeric}>{num(i.responses)}</td>
                      <td className={styles.muted}>
                        {i.notifyTelegram ? `@${i.notifyTelegram}` : '—'}
                      </td>
                      <td className={styles.muted}>{dateTime(i.createdAt)}</td>
                      <td className={styles.muted}>{dateTime(i.expiresAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={result.page}
              pages={result.pages}
              total={result.total}
              basePath="/admin/invitations"
              params={{ q, status, tier }}
            />
          </>
        )}
      </section>
    </>
  );
}
