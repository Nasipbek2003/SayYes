/**
 * Транзакции: все платежи сервиса с фильтрами по статусу/тарифу/провайдеру и
 * поиском по email, sessionId, externalId или id платежа.
 *
 * Фильтры — обычная GET-форма: состояние живёт в URL, работает без JS и
 * ссылку можно передать коллеге.
 */
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { PaymentPlan, PaymentStatus } from '@prisma/client';

import { requireAdmin } from '@/lib/admin/guard';
import { listPaymentProviders, listPayments } from '@/lib/admin/queries';

import { StyledSelect } from '@/app/components/StyledSelect';

import styles from '../../admin.module.css';
import {
  PaymentStatusBadge,
  Pager,
  PlanBadge,
  TierBadge,
  dateTime,
  money,
  num,
  shortId,
} from '../../ui';

export const dynamic = 'force-dynamic';

const STATUSES: PaymentStatus[] = ['SUCCEEDED', 'PENDING', 'FAILED'];
const PLANS_FILTER: PaymentPlan[] = ['SINGLE', 'MONTHLY'];

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const status = STATUSES.includes(single(sp.status) as PaymentStatus)
    ? (single(sp.status) as PaymentStatus)
    : undefined;
  const plan = PLANS_FILTER.includes(single(sp.plan) as PaymentPlan)
    ? (single(sp.plan) as PaymentPlan)
    : undefined;
  const provider = single(sp.provider);
  const q = single(sp.q);
  const page = Number(single(sp.page) ?? '1') || 1;

  const [result, providers] = await Promise.all([
    listPayments({ status, plan, provider, q, page }),
    listPaymentProviders(),
  ]);

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Транзакции</h1>
        <p className={styles.pageSubtitle}>
          Найдено {num(result.total)} платежей · оплачено на{' '}
          {money(result.sumSucceeded)}
        </p>
      </div>

      <form className={styles.filters} method="get">
        <input
          className={`${styles.input} ${styles.searchInput}`}
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Email, sessionId, externalId или id платежа"
          aria-label="Поиск по транзакциям"
        />
        <StyledSelect
          name="status"
          label="Статус"
          variant="dark"
          className={styles.filterSelect}
          value={status ?? ''}
          options={[
            { value: '', label: 'Все статусы' },
            { value: 'SUCCEEDED', label: 'Оплачен' },
            { value: 'PENDING', label: 'Ожидает' },
            { value: 'FAILED', label: 'Ошибка' },
          ]}
        />
        <StyledSelect
          name="plan"
          label="Тариф"
          variant="dark"
          className={styles.filterSelect}
          value={plan ?? ''}
          options={[
            { value: '', label: 'Все тарифы' },
            { value: 'SINGLE', label: 'Разовый' },
            { value: 'MONTHLY', label: 'Подписка' },
          ]}
        />
        <StyledSelect
          name="provider"
          label="Провайдер"
          variant="dark"
          className={styles.filterSelect}
          value={provider ?? ''}
          options={[
            { value: '', label: 'Все провайдеры' },
            ...providers.map((p) => ({ value: p, label: p })),
          ]}
        />
        <button type="submit" className={styles.btn}>
          <Search size={15} aria-hidden="true" />
          Применить
        </button>
        <Link href="/admin/transactions" className={`${styles.btn} ${styles.btnGhost}`}>
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
                    <th>Сессия / транзакция</th>
                    <th>Пользователь</th>
                    <th>Тариф</th>
                    <th>Уровень</th>
                    <th>Статус</th>
                    <th className={styles.numeric}>Сумма</th>
                    <th>Провайдер</th>
                    <th>Создан</th>
                    <th>Оплачен</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className={`${styles.mono} ${styles.strong}`}>
                          {shortId(p.sessionId)}
                        </span>
                        <br />
                        <span className={`${styles.mono} ${styles.muted}`}>
                          {p.externalId ? shortId(p.externalId) : 'без externalId'}
                        </span>
                      </td>
                      <td>
                        <Link href={`/admin/users/${p.authorId}`} className={styles.rowLink}>
                          {p.email ?? shortId(p.authorId)}
                        </Link>
                      </td>
                      <td>
                        <PlanBadge plan={p.plan} />
                      </td>
                      <td>
                        <TierBadge tier={p.tier} />
                      </td>
                      <td>
                        <PaymentStatusBadge status={p.status} />
                      </td>
                      <td className={`${styles.numeric} ${styles.strong}`}>
                        {money(p.amount, p.currency)}
                      </td>
                      <td className={styles.muted}>{p.provider}</td>
                      <td className={styles.muted}>{dateTime(p.createdAt)}</td>
                      <td className={styles.muted}>{dateTime(p.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={result.page}
              pages={result.pages}
              total={result.total}
              basePath="/admin/transactions"
              params={{ q, status, plan, provider }}
            />
          </>
        )}
      </section>
    </>
  );
}
