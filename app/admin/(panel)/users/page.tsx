/**
 * Пользователи (модель `Author`): регистрация, число приглашений и платежей,
 * суммарные траты, статус подписки. Сегменты — быстрые фильтры по типовым
 * вопросам поддержки («кто платит», «у кого привязан Telegram»).
 */
import Link from 'next/link';
import { Search } from 'lucide-react';

import { requireAdmin } from '@/lib/admin/guard';
import { listUsers } from '@/lib/admin/queries';

import styles from '../../admin.module.css';
import { Pager, dateTime, money, num, shortId } from '../../ui';

export const dynamic = 'force-dynamic';

type Segment = 'all' | 'admins' | 'subscribers' | 'paying' | 'telegram';

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'admins', label: 'Администраторы' },
  { id: 'subscribers', label: 'С активной подпиской' },
  { id: 'paying', label: 'Платившие' },
  { id: 'telegram', label: 'С Telegram' },
];

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const raw = single(sp.segment);
  const segment: Segment = SEGMENTS.some((s) => s.id === raw) ? (raw as Segment) : 'all';
  const q = single(sp.q);
  const page = Number(single(sp.page) ?? '1') || 1;

  const result = await listUsers({ q, segment, page });
  const now = Date.now();

  const segmentHref = (id: Segment) => {
    const params = new URLSearchParams();
    if (id !== 'all') params.set('segment', id);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : '/admin/users';
  };

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Пользователи</h1>
        <p className={styles.pageSubtitle}>Всего в выборке: {num(result.total)}</p>
      </div>

      <form className={styles.filters} method="get">
        <input
          className={`${styles.input} ${styles.searchInput}`}
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Логин, email или id пользователя"
          aria-label="Поиск по пользователям"
        />
        <input type="hidden" name="segment" value={segment} />
        <button type="submit" className={styles.btn}>
          <Search size={15} aria-hidden="true" />
          Найти
        </button>
        <div className={styles.chipRow}>
          {SEGMENTS.map((s) => (
            <Link
              key={s.id}
              href={segmentHref(s.id)}
              className={`${styles.chip} ${segment === s.id ? styles.chipActive : ''}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </form>

      <section className={styles.tableCard}>
        {result.items.length === 0 ? (
          <p className={styles.empty}>Ничего не найдено</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Роль</th>
                    <th>Вход</th>
                    <th>Telegram</th>
                    <th className={styles.numeric}>Приглашений</th>
                    <th className={styles.numeric}>Платежей</th>
                    <th className={styles.numeric}>Оплатил</th>
                    <th>Подписка</th>
                    <th>Регистрация</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((u) => {
                    const active = u.subscriptionUntil
                      ? u.subscriptionUntil.getTime() > now
                      : false;
                    return (
                      <tr key={u.id}>
                        <td>
                          <Link href={`/admin/users/${u.id}`} className={styles.rowLink}>
                            {u.login ?? u.email ?? '(без email)'}
                          </Link>
                          <br />
                          <span className={`${styles.mono} ${styles.muted}`}>
                            {u.login && u.email ? u.email : shortId(u.id)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              u.role === 'ADMIN' ? styles.badgePrimary : styles.badgeNeutral
                            }`}
                          >
                            {u.role === 'ADMIN' ? 'админ' : 'пользователь'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              u.hasPassword ? styles.badgeNeutral : styles.badgeInfo
                            }`}
                          >
                            {u.hasPassword ? 'пароль' : 'magic-link'}
                          </span>
                        </td>
                        <td className={styles.muted}>
                          {u.telegramChatId ? (
                            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                              привязан
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={styles.numeric}>{num(u.invitations)}</td>
                        <td className={styles.numeric}>{num(u.payments)}</td>
                        <td className={`${styles.numeric} ${styles.strong}`}>
                          {money(u.spent)}
                        </td>
                        <td>
                          {u.subscriptionUntil ? (
                            <span
                              className={`${styles.badge} ${
                                active ? styles.badgeSuccess : styles.badgeDanger
                              }`}
                            >
                              {active ? 'до ' : 'истекла '}
                              {dateTime(u.subscriptionUntil).slice(0, 8)}
                            </span>
                          ) : (
                            <span className={styles.muted}>нет</span>
                          )}
                        </td>
                        <td className={styles.muted}>{dateTime(u.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager
              page={result.page}
              pages={result.pages}
              total={result.total}
              basePath="/admin/users"
              params={{ q, segment: segment === 'all' ? undefined : segment }}
            />
          </>
        )}
      </section>
    </>
  );
}
