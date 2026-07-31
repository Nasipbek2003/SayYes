/**
 * Очередь уведомлений (`NotificationOutbox`): что не доехало до Telegram и
 * почему. Здесь же единственное изменяющее действие панели — вернуть запись в
 * очередь: воркер `/api/cron/process-outbox` заберёт её на следующем проходе.
 */
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, UserX } from 'lucide-react';
import type { OutboxStatus } from '@prisma/client';

import { requireAdmin } from '@/lib/admin/guard';
import { countUndeliverablePending, listOutbox } from '@/lib/admin/queries';
import { getTelegramWebhookStatus } from '@/lib/notifications/telegramDiagnostics';

import styles from '../../admin.module.css';
import { OutboxStatusBadge, Pager, StatCard, dateTime, num, shortId } from '../../ui';
import { RetryButton } from './RetryButton';

export const dynamic = 'force-dynamic';

const STATUSES: OutboxStatus[] = ['PENDING', 'SENT', 'FAILED'];

const STATE_TABS: { id: string; label: string }[] = [
  { id: '', label: 'Все' },
  { id: 'FAILED', label: 'С ошибкой' },
  { id: 'PENDING', label: 'В очереди' },
  { id: 'SENT', label: 'Отправленные' },
];

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const raw = single(sp.status);
  const status = STATUSES.includes(raw as OutboxStatus) ? (raw as OutboxStatus) : undefined;
  const page = Number(single(sp.page) ?? '1') || 1;

  const [result, undeliverable, telegram] = await Promise.all([
    listOutbox({ status, page }),
    countUndeliverablePending(),
    getTelegramWebhookStatus(),
  ]);

  const tabHref = (id: string) =>
    id ? `/admin/notifications?status=${id}` : '/admin/notifications';

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Уведомления</h1>
        <p className={styles.pageSubtitle}>
          Исходящая очередь Telegram-уведомлений автору: открытия, согласия,
          отказы, RSVP.
        </p>
      </div>

      <section className={styles.statsGrid}>
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="Отправлено"
          value={num(result.sent)}
          tone="success"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="В очереди"
          value={num(result.pending)}
          tone="warning"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="С ошибкой"
          value={num(result.failed)}
          tone={result.failed > 0 ? 'danger' : 'success'}
        />
        <StatCard
          icon={<UserX size={20} />}
          label="Некому доставить"
          value={num(undeliverable)}
          hint="нет привязки Telegram у получателя"
          tone={undeliverable > 0 ? 'warning' : 'success'}
        />
      </section>

      {!telegram.healthy ? (
        <section className={styles.card} style={{ marginBottom: 16 }}>
          <p className={`${styles.badge} ${styles.badgeDanger}`}>
            <AlertTriangle size={12} aria-hidden="true" />
            Бот не получает апдейты от Telegram
          </p>
          <p className={styles.pageSubtitle} style={{ marginTop: 10 }}>
            {telegram.url
              ? `Вебхук зарегистрирован на ${telegram.url}, но Telegram сообщает об ошибке доставки: ${telegram.lastError ?? '—'}.`
              : 'Вебхук не зарегистрирован.'}{' '}
            Пока это не исправлено, никто не сможет привязать Telegram, а события
            будут копиться в очереди. Подробности и команда перенастройки — в
            разделе <Link href="/admin/settings" className={styles.rowLink}>Настройки</Link>.
          </p>
        </section>
      ) : null}

      <div className={styles.filters}>
        <div className={styles.chipRow}>
          {STATE_TABS.map((tab) => (
            <Link
              key={tab.id || 'all'}
              href={tabHref(tab.id)}
              className={`${styles.chip} ${
                (status ?? '') === tab.id ? styles.chipActive : ''
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <section className={styles.tableCard}>
        {result.items.length === 0 ? (
          <p className={styles.empty}>Записей нет</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Автор</th>
                    <th>Приглашение</th>
                    <th>Статус</th>
                    <th className={styles.numeric}>Попыток</th>
                    <th>Ошибка</th>
                    <th>Создано</th>
                    <th>Отправлено</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((o) => (
                    <tr key={o.id}>
                      <td className={styles.strong}>{o.type}</td>
                      <td>
                        <Link href={`/admin/users/${o.authorId}`} className={styles.rowLink}>
                          {shortId(o.authorId)}
                        </Link>
                      </td>
                      <td className={styles.mono}>{shortId(o.invitationId)}</td>
                      <td>
                        <OutboxStatusBadge status={o.status} />
                      </td>
                      <td className={styles.numeric}>{num(o.attempts)}</td>
                      <td className={o.lastError ? styles.errorText : styles.muted}>
                        {o.lastError ?? '—'}
                      </td>
                      <td className={styles.muted}>{dateTime(o.createdAt)}</td>
                      <td className={styles.muted}>{dateTime(o.sentAt)}</td>
                      <td>
                        {o.status === 'FAILED' ? <RetryButton id={o.id} /> : null}
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
              basePath="/admin/notifications"
              params={{ status }}
            />
          </>
        )}
      </section>
    </>
  );
}
