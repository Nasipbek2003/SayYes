/**
 * Презентационные примитивы админ-панели: KPI-карточки, бейджи статусов,
 * графики на чистом SVG/CSS, пагинация, форматтеры.
 *
 * Всё серверное (без `use client`): панель — это чтение данных, интерактив
 * нужен только форме входа и фильтрам.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  InvitationStatus,
  OutboxStatus,
  PaymentPlan,
  PaymentStatus,
  Tier,
} from '@prisma/client';

import type { DailyPoint } from '@/lib/admin/queries';

import styles from './admin.module.css';

/* ============================================================
   Форматирование
   ============================================================ */

const numberFmt = new Intl.NumberFormat('ru-RU');

export function num(value: number): string {
  return numberFmt.format(value);
}

/** Сумма в сомах. Суммы в базе хранятся целыми, дробей не бывает. */
export function money(value: number, currency = 'KGS'): string {
  return `${numberFmt.format(value)} ${currency === 'KGS' ? 'сом' : currency}`;
}

export function dateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Короткий id для таблиц: cuid целиком нечитаем. */
export function shortId(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/* ============================================================
   KPI-карточка
   ============================================================ */

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

const iconTone: Record<Tone, string> = {
  primary: styles.iconPrimary,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
  danger: styles.iconDanger,
  info: styles.iconInfo,
};

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'primary',
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  trend?: 'up' | 'down';
}) {
  return (
    <article className={styles.statCard}>
      <span className={`${styles.statIcon} ${iconTone[tone]}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className={styles.statValue}>{value}</p>
        <p className={styles.statLabel}>{label}</p>
      </div>
      {hint ? (
        <p
          className={`${styles.statDelta} ${
            trend === 'up' ? styles.deltaUp : trend === 'down' ? styles.deltaDown : ''
          }`}
        >
          {hint}
        </p>
      ) : null}
    </article>
  );
}

/* ============================================================
   Бейджи статусов
   ============================================================ */

function Badge({ tone, children }: { tone: Tone | 'neutral'; children: ReactNode }) {
  const map: Record<Tone | 'neutral', string> = {
    primary: styles.badgePrimary,
    success: styles.badgeSuccess,
    warning: styles.badgeWarning,
    danger: styles.badgeDanger,
    info: styles.badgeInfo,
    neutral: styles.badgeNeutral,
  };
  return <span className={`${styles.badge} ${map[tone]}`}>{children}</span>;
}

const paymentStatusLabel: Record<PaymentStatus, [Tone | 'neutral', string]> = {
  SUCCEEDED: ['success', 'Оплачен'],
  PENDING: ['warning', 'Ожидает'],
  FAILED: ['danger', 'Ошибка'],
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const [tone, label] = paymentStatusLabel[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const invitationStatusLabel: Record<InvitationStatus, [Tone | 'neutral', string]> = {
  ACTIVE: ['success', 'Активно'],
  PENDING_PAYMENT: ['warning', 'Ждёт оплаты'],
  DRAFT: ['neutral', 'Черновик'],
  EXPIRED: ['danger', 'Истекло'],
};

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const [tone, label] = invitationStatusLabel[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const outboxStatusLabel: Record<OutboxStatus, [Tone | 'neutral', string]> = {
  SENT: ['success', 'Отправлено'],
  PENDING: ['warning', 'В очереди'],
  FAILED: ['danger', 'Ошибка'],
};

export function OutboxStatusBadge({ status }: { status: OutboxStatus }) {
  const [tone, label] = outboxStatusLabel[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PlanBadge({ plan }: { plan: PaymentPlan }) {
  return (
    <Badge tone={plan === 'MONTHLY' ? 'primary' : 'info'}>
      {plan === 'MONTHLY' ? 'Подписка' : 'Разовый'}
    </Badge>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <Badge tone={tier === 'PREMIUM' ? 'warning' : 'neutral'}>
      {tier === 'PREMIUM' ? 'Premium' : 'Basic'}
    </Badge>
  );
}

/* ============================================================
   Графики
   ============================================================ */

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });

/**
 * Столбчатый график по дням. Высоты считаются от максимума ряда, поэтому
 * пустой ряд не делит на ноль.
 */
export function BarChart({
  data,
  valueKey = 'amount',
}: {
  data: DailyPoint[];
  valueKey?: 'amount' | 'count';
}) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const peak = data.reduce(
    (acc, d, i) => (d[valueKey] > data[acc][valueKey] ? i : acc),
    0,
  );

  return (
    <div className={styles.bars} role="img" aria-label="График по дням">
      {data.map((point, index) => (
        <div key={point.day} className={styles.barCol}>
          <span className={styles.barTrack}>
            <span
              className={`${styles.barFill} ${
                index === peak && point[valueKey] > 0 ? styles.barFillPeak : ''
              }`}
              style={{ height: `${Math.round((point[valueKey] / max) * 100)}%` }}
              title={`${dayLabel(point.day)}: ${num(point[valueKey])}`}
            />
          </span>
          <span className={styles.barLabel}>{dayLabel(point.day).slice(0, 5)}</span>
        </div>
      ))}
    </div>
  );
}

/** Area-спарклайн: точки ряда нормируются в viewBox 100×40. */
export function Sparkline({ data }: { data: DailyPoint[] }) {
  const values = data.map((d) => d.count);
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 100 / (values.length - 1) : 100;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(40 - (v / max) * 34).toFixed(2)}`);
  const line = points.join(' ');
  const area = `0,40 ${line} 100,40`;

  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label="Динамика создания приглашений"
    >
      <defs>
        <linearGradient id="adm-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7367F0" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7367F0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#adm-spark)" />
      <polyline
        points={line}
        fill="none"
        stroke="#9E95F5"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Кольцевая диаграмма на одном круге: доли рисуются через stroke-dasharray,
 * так не нужна библиотека графиков.
 */
export function Donut({
  slices,
  centerValue,
  centerLabel,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 176 176" width="176" height="176" role="img" aria-label={centerLabel}>
          <g transform="translate(88 88) rotate(-90)">
            <circle
              r={radius}
              fill="none"
              stroke="#383D5B"
              strokeWidth="16"
            />
            {total > 0
              ? slices.map((slice) => {
                  const length = (slice.value / total) * circumference;
                  const dash = `${length} ${circumference - length}`;
                  const element = (
                    <circle
                      key={slice.label}
                      r={radius}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="16"
                      strokeDasharray={dash}
                      strokeDashoffset={-offset}
                      strokeLinecap="butt"
                    />
                  );
                  offset += length;
                  return element;
                })
              : null}
          </g>
        </svg>
        <div className={styles.donutCenter}>
          <p className={styles.donutValue}>{centerValue}</p>
          <p className={styles.donutLabel}>{centerLabel}</p>
        </div>
      </div>
      <ul className={styles.legend}>
        {slices.map((slice) => (
          <li key={slice.label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: slice.color }} />
            {slice.label}
            <span className={styles.legendValue}>{num(slice.value)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Список полосок «название — значение — доля». */
export function ProgressList({
  rows,
}: {
  rows: { name: string; value: string; ratio: number; tone?: Tone }[];
}) {
  const fillTone: Partial<Record<Tone, string>> = {
    success: styles.fillSuccess,
    warning: styles.fillWarning,
    info: styles.fillInfo,
  };
  return (
    <div className={styles.progressList}>
      {rows.map((row) => (
        <div key={row.name} className={styles.progressRow}>
          <div className={styles.progressTop}>
            <span className={styles.progressName}>{row.name}</span>
            <span className={styles.progressValue}>{row.value}</span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={`${styles.progressFill} ${
                row.tone ? (fillTone[row.tone] ?? '') : ''
              }`}
              style={{ width: `${Math.min(100, Math.max(2, Math.round(row.ratio * 100)))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Пагинация
   ============================================================ */

/**
 * Ссылочная пагинация: состояние живёт в query-параметрах, поэтому страницу
 * можно скопировать/обновить без потери фильтров.
 */
export function Pager({
  page,
  pages,
  total,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const href = (target: number) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) sp.set(key, value);
    }
    if (target > 1) sp.set('page', String(target));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className={styles.pager}>
      <span>
        Всего {num(total)} · страница {page} из {pages}
      </span>
      <div className={styles.pagerBtns}>
        <Link
          href={href(Math.max(1, page - 1))}
          className={`${styles.pagerBtn} ${page <= 1 ? styles.pagerBtnDisabled : ''}`}
          aria-disabled={page <= 1}
        >
          Назад
        </Link>
        <Link
          href={href(Math.min(pages, page + 1))}
          className={`${styles.pagerBtn} ${page >= pages ? styles.pagerBtnDisabled : ''}`}
          aria-disabled={page >= pages}
        >
          Вперёд
        </Link>
      </div>
    </div>
  );
}
