/**
 * Карточка пользователя: профиль, подписки, приглашения и платежи в одном
 * месте — типовой сценарий разбора обращения в поддержку.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CreditCard, MailOpen, Repeat, Wallet } from 'lucide-react';

import { requireAdmin } from '@/lib/admin/guard';
import { getUserDetail } from '@/lib/admin/queries';

import styles from '../../../admin.module.css';
import {
  InvitationStatusBadge,
  PaymentStatusBadge,
  PlanBadge,
  StatCard,
  TierBadge,
  dateTime,
  money,
  num,
  shortId,
} from '../../../ui';

export const dynamic = 'force-dynamic';

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { author, spent } = detail;
  const now = Date.now();
  const activeSub = author.subscriptions.find((s) => s.expiresAt.getTime() > now);

  return (
    <>
      <Link href="/admin/users" className={styles.backLink}>
        <ArrowLeft size={14} aria-hidden="true" />
        К списку пользователей
      </Link>

      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>{author.email ?? '(без email)'}</h1>
        <p className={styles.pageSubtitle}>
          <span className={styles.mono}>{author.id}</span> · регистрация{' '}
          {dateTime(author.createdAt)}
        </p>
      </div>

      <section className={styles.statsGrid}>
        <StatCard
          icon={<Wallet size={20} />}
          label="Оплатил всего"
          value={money(spent)}
          tone="success"
        />
        <StatCard
          icon={<CreditCard size={20} />}
          label="Платежей"
          value={num(author._count.payments)}
          tone="primary"
        />
        <StatCard
          icon={<MailOpen size={20} />}
          label="Приглашений"
          value={num(author._count.invitations)}
          tone="info"
        />
        <StatCard
          icon={<Repeat size={20} />}
          label="Подписка"
          value={activeSub ? 'активна' : 'нет'}
          hint={activeSub ? `до ${dateTime(activeSub.expiresAt)}` : undefined}
          tone={activeSub ? 'success' : 'warning'}
        />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <p className={styles.cardTitle}>Профиль</p>
        </div>
        <div className={styles.kvGrid}>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Email</span>
            <span className={styles.kvValue}>{author.email ?? '—'}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Логин</span>
            <span className={styles.kvValue}>{author.login ?? '—'}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Роль</span>
            <span className={styles.kvValue}>
              <span
                className={`${styles.badge} ${
                  author.role === 'ADMIN' ? styles.badgePrimary : styles.badgeNeutral
                }`}
              >
                {author.role === 'ADMIN' ? 'администратор' : 'пользователь'}
              </span>
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Способ входа</span>
            <span className={styles.kvValue}>
              {author.passwordHash ? 'пароль' : 'magic-link'}
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Telegram chat id</span>
            <span className={`${styles.kvValue} ${styles.mono}`}>
              {author.telegramChatId ?? '—'}
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Magic-link токенов</span>
            <span className={styles.kvValue}>{num(author._count.magicLinks)}</span>
          </div>
        </div>
      </section>

      <h2 className={styles.sectionTitle}>Подписки</h2>
      <section className={styles.tableCard}>
        {author.subscriptions.length === 0 ? (
          <p className={styles.empty}>Подписок не было</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Начало</th>
                  <th>Действует до</th>
                  <th>Статус</th>
                  <th>Обновлена</th>
                </tr>
              </thead>
              <tbody>
                {author.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>{dateTime(s.startedAt)}</td>
                    <td className={styles.strong}>{dateTime(s.expiresAt)}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          s.expiresAt.getTime() > now ? styles.badgeSuccess : styles.badgeNeutral
                        }`}
                      >
                        {s.expiresAt.getTime() > now ? 'активна' : 'истекла'}
                      </span>
                    </td>
                    <td className={styles.muted}>{dateTime(s.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className={styles.sectionTitle}>Платежи (последние 30)</h2>
      <section className={styles.tableCard}>
        {author.payments.length === 0 ? (
          <p className={styles.empty}>Платежей не было</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Сессия</th>
                  <th>Тариф</th>
                  <th>Статус</th>
                  <th className={styles.numeric}>Сумма</th>
                  <th>Провайдер</th>
                  <th>Создан</th>
                  <th>Оплачен</th>
                </tr>
              </thead>
              <tbody>
                {author.payments.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.mono}>{shortId(p.sessionId)}</td>
                    <td>
                      <PlanBadge plan={p.plan} />
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
        )}
      </section>

      <h2 className={styles.sectionTitle}>Приглашения (последние 30)</h2>
      <section className={styles.tableCard}>
        {author.invitations.length === 0 ? (
          <p className={styles.empty}>Приглашений нет</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Шаблон</th>
                  <th>Уровень</th>
                  <th>Статус</th>
                  <th className={styles.numeric}>Открытий</th>
                  <th className={styles.numeric}>Ответов</th>
                  <th>Создано</th>
                  <th>Истекает</th>
                </tr>
              </thead>
              <tbody>
                {author.invitations.map((i) => (
                  <tr key={i.id}>
                    <td className={styles.strong}>
                      {i.templateId}
                      <br />
                      <span className={`${styles.mono} ${styles.muted}`}>{shortId(i.id)}</span>
                    </td>
                    <td>
                      <TierBadge tier={i.tier} />
                    </td>
                    <td>
                      <InvitationStatusBadge status={i.status} />
                    </td>
                    <td className={styles.numeric}>{num(i._count.opens)}</td>
                    <td className={styles.numeric}>{num(i._count.responses)}</td>
                    <td className={styles.muted}>{dateTime(i.createdAt)}</td>
                    <td className={styles.muted}>{dateTime(i.expiresAt)}</td>
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
