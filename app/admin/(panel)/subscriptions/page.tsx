/**
 * Подписки: у автора активна одна (продление сдвигает `expiresAt`), поэтому
 * ключевые срезы — активные, истекающие в ближайшую неделю и истёкшие.
 */
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Repeat, Search } from 'lucide-react';

import { requireAdmin } from '@/lib/admin/guard';
import { listSubscriptions } from '@/lib/admin/queries';
import { getPlans } from '@/lib/settings/appConfig';

import styles from '../../admin.module.css';
import { Pager, StatCard, dateTime, money, num, shortId } from '../../ui';

export const dynamic = 'force-dynamic';

type State = 'all' | 'active' | 'expiring' | 'expired';

const STATES: { id: State; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'expiring', label: 'Истекают за 7 дней' },
  { id: 'expired', label: 'Истёкшие' },
];

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const raw = single(sp.state);
  const state: State = STATES.some((s) => s.id === raw) ? (raw as State) : 'all';
  const q = single(sp.q);
  const page = Number(single(sp.page) ?? '1') || 1;

  const [result, plans] = await Promise.all([
    listSubscriptions({ state, q, page }),
    getPlans(),
  ]);

  const stateHref = (id: State) => {
    const params = new URLSearchParams();
    if (id !== 'all') params.set('state', id);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `/admin/subscriptions?${qs}` : '/admin/subscriptions';
  };

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Подписки</h1>
        <p className={styles.pageSubtitle}>
          Тариф «{plans.monthly.title}» — {money(plans.monthly.amount)} за{' '}
          {plans.monthly.periodDays} дней. Продление ручное: Finik Web SDK не
          умеет автосписания.
        </p>
      </div>

      <section className={styles.statsGrid}>
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="Активные подписки"
          value={num(result.active)}
          tone="success"
        />
        <StatCard
          icon={<AlertCircle size={20} />}
          label="Истёкшие"
          value={num(result.expired)}
          tone="danger"
        />
        <StatCard
          icon={<Repeat size={20} />}
          label="Потенциальный MRR"
          value={money(result.active * plans.monthly.amount)}
          hint="активные × цена месяца"
          tone="primary"
        />
      </section>

      <form className={styles.filters} method="get">
        <input
          className={`${styles.input} ${styles.searchInput}`}
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Email или id автора"
          aria-label="Поиск по подпискам"
        />
        <input type="hidden" name="state" value={state} />
        <button type="submit" className={styles.btn}>
          <Search size={15} aria-hidden="true" />
          Найти
        </button>
        <div className={styles.chipRow}>
          {STATES.map((s) => (
            <Link
              key={s.id}
              href={stateHref(s.id)}
              className={`${styles.chip} ${state === s.id ? styles.chipActive : ''}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </form>

      <section className={styles.tableCard}>
        {result.items.length === 0 ? (
          <p className={styles.empty}>Подписок в этом срезе нет</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Начало</th>
                    <th>Действует до</th>
                    <th className={styles.numeric}>Осталось дней</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/admin/users/${s.authorId}`} className={styles.rowLink}>
                          {s.email ?? shortId(s.authorId)}
                        </Link>
                      </td>
                      <td className={styles.muted}>{dateTime(s.startedAt)}</td>
                      <td className={styles.strong}>{dateTime(s.expiresAt)}</td>
                      <td className={styles.numeric}>
                        {s.active ? num(Math.max(0, s.daysLeft)) : '—'}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            s.active
                              ? s.daysLeft <= 7
                                ? styles.badgeWarning
                                : styles.badgeSuccess
                              : styles.badgeDanger
                          }`}
                        >
                          {s.active ? (s.daysLeft <= 7 ? 'истекает' : 'активна') : 'истекла'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={result.page}
              pages={result.pages}
              total={result.total}
              basePath="/admin/subscriptions"
              params={{ q, state: state === 'all' ? undefined : state }}
            />
          </>
        )}
      </section>
    </>
  );
}
