/**
 * Дашборд: сводка по деньгам, пользователям, приглашениям и очереди
 * уведомлений. Все графики — собственные SVG/CSS-компоненты из `../../ui`,
 * внешних чарт-библиотек в проекте нет.
 */
import Link from 'next/link';
import {
  AlertTriangle,
  CreditCard,
  Eye,
  MailOpen,
  MessageSquareHeart,
  Repeat,
  Users,
  Wallet,
} from 'lucide-react';

import { requireAdmin } from '@/lib/admin/guard';
import {
  getInvitationsByDay,
  getOverview,
  getRecentPayments,
  getRevenueByDay,
  getTopTemplates,
} from '@/lib/admin/queries';
import { getPlans } from '@/lib/settings/appConfig';

import styles from '../../admin.module.css';
import {
  BarChart,
  Donut,
  PaymentStatusBadge,
  PlanBadge,
  ProgressList,
  Sparkline,
  StatCard,
  dateTime,
  money,
  num,
  shortId,
} from '../../ui';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [overview, revenue, invitations, templates, recent, plans] = await Promise.all([
    getOverview(),
    getRevenueByDay(14),
    getInvitationsByDay(14),
    getTopTemplates(6),
    getRecentPayments(8),
    getPlans(),
  ]);

  const attempts =
    overview.payments.succeeded + overview.payments.pending + overview.payments.failed;
  const conversion = attempts > 0 ? (overview.payments.succeeded / attempts) * 100 : 0;
  const revenue14 = revenue.reduce((sum, d) => sum + d.amount, 0);
  const topTemplateMax = Math.max(1, ...templates.map((t) => t.count));

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Дашборд</h1>
        <p className={styles.pageSubtitle}>
          Сводка по сервису на {dateTime(new Date())}
        </p>
      </div>

      <section className={styles.chartGrid}>
        <div className={styles.hero}>
          <h2 className={styles.heroTitle}>Всё под контролем</h2>
          <p className={styles.heroText}>
            За последние 14 дней сервис заработал {money(revenue14)} и получил{' '}
            {num(invitations.reduce((s, d) => s + d.count, 0))} новых приглашений.
            Конверсия платежей — {conversion.toFixed(1)}%.
          </p>
          <div className={styles.heroStats}>
            <span className={styles.heroStat}>
              <span className={styles.heroStatValue}>{money(overview.payments.revenue)}</span>
              выручка всего
            </span>
            <span className={styles.heroStat}>
              <span className={styles.heroStatValue}>{num(overview.authors.total)}</span>
              пользователей
            </span>
            <span className={styles.heroStat}>
              <span className={styles.heroStatValue}>{num(overview.subscriptions.active)}</span>
              активных подписок
            </span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>Новые приглашения</p>
              <p className={styles.cardMeta}>14 дней</p>
            </div>
            <span className={`${styles.statIcon} ${styles.iconInfo}`} aria-hidden="true">
              <MailOpen size={18} />
            </span>
          </div>
          <p className={styles.statValue}>{num(overview.invitations.new7)}</p>
          <p className={styles.statLabel}>за последние 7 дней</p>
          <Sparkline data={invitations} />
        </div>
      </section>

      <section className={styles.statsGrid}>
        <StatCard
          icon={<Wallet size={20} />}
          label="Выручка за 30 дней"
          value={money(overview.payments.revenue30)}
          hint={`средний чек ${money(overview.payments.avgTicket)}`}
          tone="success"
        />
        <StatCard
          icon={<CreditCard size={20} />}
          label="Успешных платежей"
          value={num(overview.payments.succeeded)}
          hint={`конверсия ${conversion.toFixed(1)}%`}
          tone="primary"
          trend={conversion >= 50 ? 'up' : 'down'}
        />
        <StatCard
          icon={<Users size={20} />}
          label="Пользователей"
          value={num(overview.authors.total)}
          hint={`+${num(overview.authors.new7)} за 7 дней`}
          tone="info"
          trend={overview.authors.new7 > 0 ? 'up' : undefined}
        />
        <StatCard
          icon={<Repeat size={20} />}
          label="Активных подписок"
          value={num(overview.subscriptions.active)}
          hint={`${num(overview.subscriptions.expiringIn7)} истекают за 7 дней`}
          tone="warning"
        />
      </section>

      <section className={styles.statsGrid}>
        <StatCard
          icon={<MailOpen size={20} />}
          label="Приглашений всего"
          value={num(overview.invitations.total)}
          hint={`${num(overview.invitations.byStatus.ACTIVE)} активных`}
          tone="primary"
        />
        <StatCard
          icon={<Eye size={20} />}
          label="Открытий приглашений"
          value={num(overview.engagement.opens)}
          tone="info"
        />
        <StatCard
          icon={<MessageSquareHeart size={20} />}
          label="Ответов гостей"
          value={num(overview.engagement.responses)}
          tone="success"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Уведомления с ошибкой"
          value={num(overview.outbox.failed)}
          hint={`${num(overview.outbox.pending)} в очереди`}
          tone={overview.outbox.failed > 0 ? 'danger' : 'success'}
          trend={overview.outbox.failed > 0 ? 'down' : undefined}
        />
      </section>

      <section className={styles.chartGrid}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>Выручка по дням</p>
              <p className={styles.cardMeta}>
                последние 14 дней · {money(revenue14)}
              </p>
            </div>
          </div>
          <BarChart data={revenue} valueKey="amount" />
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>Статусы приглашений</p>
              <p className={styles.cardMeta}>всего {num(overview.invitations.total)}</p>
            </div>
          </div>
          <Donut
            centerValue={`${
              overview.invitations.total > 0
                ? Math.round(
                    (overview.invitations.byStatus.ACTIVE / overview.invitations.total) * 100,
                  )
                : 0
            }%`}
            centerLabel="активных"
            slices={[
              { label: 'Активные', value: overview.invitations.byStatus.ACTIVE, color: '#28C76F' },
              { label: 'Черновики', value: overview.invitations.byStatus.DRAFT, color: '#7367F0' },
              {
                label: 'Ждут оплаты',
                value: overview.invitations.byStatus.PENDING_PAYMENT,
                color: '#FF9F43',
              },
              { label: 'Истекли', value: overview.invitations.byStatus.EXPIRED, color: '#EA5455' },
            ]}
          />
        </div>
      </section>

      <section className={styles.splitGrid}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>Выручка по тарифам</p>
              <p className={styles.cardMeta}>
                разово {money(plans.single.amount)} · подписка{' '}
                {money(plans.monthly.amount)}
              </p>
            </div>
          </div>
          <ProgressList
            rows={[
              {
                name: 'Разовая оплата',
                value: money(overview.payments.singleRevenue),
                ratio:
                  overview.payments.revenue > 0
                    ? overview.payments.singleRevenue / overview.payments.revenue
                    : 0,
                tone: 'info',
              },
              {
                name: 'Подписка на месяц',
                value: money(overview.payments.monthlyRevenue),
                ratio:
                  overview.payments.revenue > 0
                    ? overview.payments.monthlyRevenue / overview.payments.revenue
                    : 0,
              },
              {
                name: 'Premium-приглашения',
                value: `${num(overview.invitations.premium)} шт`,
                ratio:
                  overview.invitations.total > 0
                    ? overview.invitations.premium / overview.invitations.total
                    : 0,
                tone: 'warning',
              },
            ]}
          />
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>Популярные шаблоны</p>
              <p className={styles.cardMeta}>по числу созданных приглашений</p>
            </div>
          </div>
          {templates.length === 0 ? (
            <p className={styles.empty}>Пока нет данных</p>
          ) : (
            <ProgressList
              rows={templates.map((t) => ({
                name: t.templateId,
                value: `${num(t.count)} · ${num(t.active)} активных`,
                ratio: t.count / topTemplateMax,
                tone: 'success',
              }))}
            />
          )}
        </div>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHead}>
          <div>
            <p className={styles.cardTitle}>Последние транзакции</p>
            <p className={styles.cardMeta}>8 свежих платежей</p>
          </div>
          <Link href="/admin/transactions" className={styles.rowLink}>
            Все транзакции →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className={styles.empty}>Платежей ещё не было</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Сессия</th>
                  <th>Пользователь</th>
                  <th>Тариф</th>
                  <th>Статус</th>
                  <th className={styles.numeric}>Сумма</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.mono}>{shortId(p.sessionId)}</td>
                    <td className={styles.strong}>{p.email ?? '—'}</td>
                    <td>
                      <PlanBadge plan={p.plan} />
                    </td>
                    <td>
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className={`${styles.numeric} ${styles.strong}`}>
                      {money(p.amount, p.currency)}
                    </td>
                    <td className={styles.muted}>{dateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
