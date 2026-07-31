/**
 * Запросы админ-панели: агрегаты для дашборда и постраничные выборки для
 * разделов «Транзакции», «Пользователи», «Подписки», «Приглашения»,
 * «Уведомления».
 *
 * Живёт отдельно от `lib/repositories/*` намеренно: репозитории обслуживают
 * продуктовые сценарии (owner-scoped выборки), а здесь — сквозные по всей базе
 * запросы, доступные только администратору. Всё только на чтение; наружу
 * отдаются простые сериализуемые объекты, без Decimal/BigInt, чтобы их можно
 * было передавать в клиентские компоненты.
 */
import type {
  InvitationStatus,
  OutboxStatus,
  PaymentPlan,
  PaymentStatus,
  Prisma,
  Role,
  Tier,
} from '@prisma/client';

import { prisma } from '@/lib/prisma';

/** Размер страницы во всех табличных разделах. */
export const PAGE_SIZE = 20;

/** Точка отсчёта: начало дня (UTC) `daysAgo` дней назад. */
function startOfDay(daysAgo: number): Date {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

/** `YYYY-MM-DD` для оси дат графиков. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DailyPoint {
  day: string;
  amount: number;
  count: number;
}

/**
 * Разложить результат группировки по дням в непрерывный ряд длиной `days`
 * (дни без данных — нули), иначе график «сжимается» и врёт по оси X.
 */
function fillSeries(
  rows: { day: string; amount: number; count: number }[],
  days: number,
): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(startOfDay(i));
    const row = byDay.get(key);
    out.push({ day: key, amount: Number(row?.amount ?? 0), count: Number(row?.count ?? 0) });
  }
  return out;
}

/* ============================================================
   Дашборд
   ============================================================ */

export interface Overview {
  authors: { total: number; new7: number; new30: number };
  invitations: {
    total: number;
    byStatus: Record<InvitationStatus, number>;
    new7: number;
    premium: number;
  };
  payments: {
    succeeded: number;
    pending: number;
    failed: number;
    revenue: number;
    revenue30: number;
    avgTicket: number;
    singleRevenue: number;
    monthlyRevenue: number;
  };
  subscriptions: { active: number; expired: number; expiringIn7: number };
  engagement: { opens: number; responses: number };
  outbox: { pending: number; failed: number; sent: number };
}

export async function getOverview(): Promise<Overview> {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const d7 = startOfDay(7);
  const d30 = startOfDay(30);

  const [
    authorsTotal,
    authorsNew7,
    authorsNew30,
    invitationsTotal,
    invitationGroups,
    invitationsNew7,
    premiumCount,
    paymentGroups,
    revenueAgg,
    revenue30Agg,
    planRevenue,
    subsActive,
    subsExpired,
    subsExpiring,
    opens,
    responses,
    outboxGroups,
  ] = await Promise.all([
    prisma.author.count(),
    prisma.author.count({ where: { createdAt: { gte: d7 } } }),
    prisma.author.count({ where: { createdAt: { gte: d30 } } }),
    prisma.invitation.count(),
    prisma.invitation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.invitation.count({ where: { createdAt: { gte: d7 } } }),
    prisma.invitation.count({ where: { tier: 'PREMIUM' } }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
      _avg: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', paidAt: { gte: d30 } },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['plan'],
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
    prisma.subscription.count({ where: { expiresAt: { gt: now } } }),
    prisma.subscription.count({ where: { expiresAt: { lte: now } } }),
    prisma.subscription.count({ where: { expiresAt: { gt: now, lte: in7 } } }),
    prisma.openEvent.count(),
    prisma.response.count(),
    prisma.notificationOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const invByStatus = {
    DRAFT: 0,
    PENDING_PAYMENT: 0,
    ACTIVE: 0,
    EXPIRED: 0,
  } as Record<InvitationStatus, number>;
  for (const g of invitationGroups) {
    invByStatus[g.status] = g._count._all;
  }

  const payByStatus = { PENDING: 0, SUCCEEDED: 0, FAILED: 0 } as Record<
    PaymentStatus,
    number
  >;
  for (const g of paymentGroups) {
    payByStatus[g.status] = g._count._all;
  }

  const outByStatus = { PENDING: 0, SENT: 0, FAILED: 0 } as Record<
    OutboxStatus,
    number
  >;
  for (const g of outboxGroups) {
    outByStatus[g.status] = g._count._all;
  }

  const planMap = new Map(planRevenue.map((g) => [g.plan, g._sum.amount ?? 0]));

  return {
    authors: { total: authorsTotal, new7: authorsNew7, new30: authorsNew30 },
    invitations: {
      total: invitationsTotal,
      byStatus: invByStatus,
      new7: invitationsNew7,
      premium: premiumCount,
    },
    payments: {
      succeeded: payByStatus.SUCCEEDED,
      pending: payByStatus.PENDING,
      failed: payByStatus.FAILED,
      revenue: revenueAgg._sum.amount ?? 0,
      revenue30: revenue30Agg._sum.amount ?? 0,
      avgTicket: Math.round(revenueAgg._avg.amount ?? 0),
      singleRevenue: planMap.get('SINGLE') ?? 0,
      monthlyRevenue: planMap.get('MONTHLY') ?? 0,
    },
    subscriptions: {
      active: subsActive,
      expired: subsExpired,
      expiringIn7: subsExpiring,
    },
    engagement: { opens, responses },
    outbox: {
      pending: outByStatus.PENDING,
      failed: outByStatus.FAILED,
      sent: outByStatus.SENT,
    },
  };
}

/** Выручка и число успешных платежей по дням (для столбчатого графика). */
export async function getRevenueByDay(days = 14): Promise<DailyPoint[]> {
  const from = startOfDay(days - 1);
  const rows = await prisma.$queryRaw<
    { day: string; amount: number; count: number }[]
  >`
    SELECT to_char(date_trunc('day', "paidAt"), 'YYYY-MM-DD') AS day,
           COALESCE(SUM("amount"), 0)::int AS amount,
           COUNT(*)::int AS count
    FROM "Payment"
    WHERE "status" = 'SUCCEEDED' AND "paidAt" >= ${from}
    GROUP BY 1
    ORDER BY 1
  `;
  return fillSeries(rows, days);
}

/** Созданные приглашения по дням (для area-графика). */
export async function getInvitationsByDay(days = 14): Promise<DailyPoint[]> {
  const from = startOfDay(days - 1);
  const rows = await prisma.$queryRaw<
    { day: string; amount: number; count: number }[]
  >`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
           0::int AS amount,
           COUNT(*)::int AS count
    FROM "Invitation"
    WHERE "createdAt" >= ${from}
    GROUP BY 1
    ORDER BY 1
  `;
  return fillSeries(rows, days);
}

export interface TemplateStat {
  templateId: string;
  count: number;
  active: number;
}

/** Топ шаблонов по числу созданных приглашений. */
export async function getTopTemplates(limit = 6): Promise<TemplateStat[]> {
  const [groups, activeGroups] = await Promise.all([
    prisma.invitation.groupBy({
      by: ['templateId'],
      _count: { _all: true },
      orderBy: { _count: { templateId: 'desc' } },
      take: limit,
    }),
    prisma.invitation.groupBy({
      by: ['templateId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    }),
  ]);
  const activeMap = new Map(activeGroups.map((g) => [g.templateId, g._count._all]));
  return groups.map((g) => ({
    templateId: g.templateId,
    count: g._count._all,
    active: activeMap.get(g.templateId) ?? 0,
  }));
}

export interface RecentPaymentRow {
  id: string;
  sessionId: string;
  email: string | null;
  plan: PaymentPlan;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider: string;
  createdAt: Date;
}

/** Последние платежи для виджета на дашборде. */
export async function getRecentPayments(limit = 8): Promise<RecentPaymentRow[]> {
  const rows = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { author: { select: { email: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    sessionId: p.sessionId,
    email: p.author?.email ?? null,
    plan: p.plan,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    provider: p.provider,
    createdAt: p.createdAt,
  }));
}

/* ============================================================
   Постраничные выборки
   ============================================================ */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

function paging(page: number): { skip: number; take: number } {
  const safe = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  return { skip: (safe - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

function toPage<T>(items: T[], total: number, page: number): Page<T> {
  return {
    items,
    total,
    page: Math.max(1, Math.floor(page) || 1),
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/* ---------- Транзакции ---------- */

export interface PaymentFilters {
  status?: PaymentStatus;
  plan?: PaymentPlan;
  provider?: string;
  /** Поиск по email автора, sessionId, externalId или id платежа. */
  q?: string;
  page?: number;
}

export interface PaymentRow extends RecentPaymentRow {
  authorId: string;
  invitationId: string | null;
  externalId: string | null;
  tier: Tier;
  paidAt: Date | null;
}

export async function listPayments(
  filters: PaymentFilters = {},
): Promise<Page<PaymentRow> & { sumSucceeded: number }> {
  const page = filters.page ?? 1;
  const { skip, take } = paging(page);
  const q = filters.q?.trim();

  const where: Prisma.PaymentWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.plan ? { plan: filters.plan } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { sessionId: { contains: q, mode: 'insensitive' } },
            { externalId: { contains: q, mode: 'insensitive' } },
            { author: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total, sum] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { author: { select: { email: true } } },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where: { ...where, status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
  ]);

  const items: PaymentRow[] = rows.map((p) => ({
    id: p.id,
    sessionId: p.sessionId,
    email: p.author?.email ?? null,
    authorId: p.authorId,
    invitationId: p.invitationId,
    externalId: p.externalId,
    plan: p.plan,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    provider: p.provider,
    tier: p.tier,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
  }));

  return { ...toPage(items, total, page), sumSucceeded: sum._sum.amount ?? 0 };
}

/** Список провайдеров, встречающихся в платежах (для фильтра). */
export async function listPaymentProviders(): Promise<string[]> {
  const groups = await prisma.payment.groupBy({ by: ['provider'] });
  return groups.map((g) => g.provider).sort();
}

/* ---------- Пользователи ---------- */

export interface UserRow {
  id: string;
  email: string | null;
  login: string | null;
  role: Role;
  telegramChatId: string | null;
  createdAt: Date;
  invitations: number;
  payments: number;
  spent: number;
  hasPassword: boolean;
  subscriptionUntil: Date | null;
}

export interface UserFilters {
  q?: string;
  /**
   * `subscribers` — только с активной подпиской, `paying` — с успешной оплатой,
   * `admins` — пользователи с ролью ADMIN.
   */
  segment?: 'all' | 'admins' | 'subscribers' | 'paying' | 'telegram';
  page?: number;
}

export async function listUsers(filters: UserFilters = {}): Promise<Page<UserRow>> {
  const page = filters.page ?? 1;
  const { skip, take } = paging(page);
  const q = filters.q?.trim();
  const now = new Date();

  const where: Prisma.AuthorWhereInput = {
    ...(q
      ? {
          OR: [
            { id: q },
            { email: { contains: q, mode: 'insensitive' } },
            { login: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(filters.segment === 'admins' ? { role: 'ADMIN' } : {}),
    ...(filters.segment === 'subscribers'
      ? { subscriptions: { some: { expiresAt: { gt: now } } } }
      : {}),
    ...(filters.segment === 'paying'
      ? { payments: { some: { status: 'SUCCEEDED' } } }
      : {}),
    ...(filters.segment === 'telegram' ? { telegramChatId: { not: null } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.author.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { _count: { select: { invitations: true, payments: true } } },
    }),
    prisma.author.count({ where }),
  ]);

  const ids = rows.map((a) => a.id);
  const [spend, subs] = await Promise.all([
    prisma.payment.groupBy({
      by: ['authorId'],
      where: { authorId: { in: ids }, status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
    prisma.subscription.findMany({
      where: { authorId: { in: ids } },
      orderBy: { expiresAt: 'desc' },
      select: { authorId: true, expiresAt: true },
    }),
  ]);

  const spendMap = new Map(spend.map((g) => [g.authorId, g._sum.amount ?? 0]));
  const subMap = new Map<string, Date>();
  for (const s of subs) {
    if (!subMap.has(s.authorId)) subMap.set(s.authorId, s.expiresAt);
  }

  const items: UserRow[] = rows.map((a) => ({
    id: a.id,
    email: a.email,
    login: a.login,
    role: a.role,
    telegramChatId: a.telegramChatId,
    createdAt: a.createdAt,
    invitations: a._count.invitations,
    payments: a._count.payments,
    spent: spendMap.get(a.id) ?? 0,
    hasPassword: Boolean(a.passwordHash),
    subscriptionUntil: subMap.get(a.id) ?? null,
  }));

  return toPage(items, total, page);
}

export async function getUserDetail(id: string) {
  const author = await prisma.author.findUnique({
    where: { id },
    include: {
      _count: { select: { invitations: true, payments: true, magicLinks: true } },
      invitations: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { _count: { select: { opens: true, responses: true } } },
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 30 },
      subscriptions: { orderBy: { expiresAt: 'desc' } },
    },
  });
  if (!author) return null;

  const spend = await prisma.payment.aggregate({
    where: { authorId: id, status: 'SUCCEEDED' },
    _sum: { amount: true },
  });

  return { author, spent: spend._sum.amount ?? 0 };
}

/* ---------- Подписки ---------- */

export interface SubscriptionRow {
  id: string;
  authorId: string;
  email: string | null;
  startedAt: Date;
  expiresAt: Date;
  active: boolean;
  daysLeft: number;
}

export async function listSubscriptions(filters: {
  state?: 'all' | 'active' | 'expired' | 'expiring';
  q?: string;
  page?: number;
} = {}): Promise<Page<SubscriptionRow> & { active: number; expired: number }> {
  const page = filters.page ?? 1;
  const { skip, take } = paging(page);
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const q = filters.q?.trim();

  const where: Prisma.SubscriptionWhereInput = {
    ...(filters.state === 'active' ? { expiresAt: { gt: now } } : {}),
    ...(filters.state === 'expired' ? { expiresAt: { lte: now } } : {}),
    ...(filters.state === 'expiring' ? { expiresAt: { gt: now, lte: in7 } } : {}),
    ...(q
      ? {
          OR: [
            { authorId: q },
            { author: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total, active, expired] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { expiresAt: 'desc' },
      skip,
      take,
      include: { author: { select: { email: true } } },
    }),
    prisma.subscription.count({ where }),
    prisma.subscription.count({ where: { expiresAt: { gt: now } } }),
    prisma.subscription.count({ where: { expiresAt: { lte: now } } }),
  ]);

  const items: SubscriptionRow[] = rows.map((s) => ({
    id: s.id,
    authorId: s.authorId,
    email: s.author?.email ?? null,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
    active: s.expiresAt > now,
    daysLeft: Math.ceil((s.expiresAt.getTime() - now.getTime()) / 86_400_000),
  }));

  return { ...toPage(items, total, page), active, expired };
}

/* ---------- Приглашения ---------- */

export interface InvitationRow {
  id: string;
  authorId: string;
  email: string | null;
  templateId: string;
  themeId: string;
  tier: Tier;
  status: InvitationStatus;
  token: string | null;
  oneTimeView: boolean;
  notifyTelegram: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  expiresAt: Date | null;
  opens: number;
  responses: number;
}

export async function listInvitations(filters: {
  status?: InvitationStatus;
  tier?: Tier;
  q?: string;
  page?: number;
} = {}): Promise<Page<InvitationRow>> {
  const page = filters.page ?? 1;
  const { skip, take } = paging(page);
  const q = filters.q?.trim();

  const where: Prisma.InvitationWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.tier ? { tier: filters.tier } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { token: q },
            { templateId: { contains: q, mode: 'insensitive' } },
            { author: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        author: { select: { email: true } },
        _count: { select: { opens: true, responses: true } },
      },
    }),
    prisma.invitation.count({ where }),
  ]);

  const items: InvitationRow[] = rows.map((i) => ({
    id: i.id,
    authorId: i.authorId,
    email: i.author?.email ?? null,
    templateId: i.templateId,
    themeId: i.themeId,
    tier: i.tier,
    status: i.status,
    token: i.token,
    oneTimeView: i.oneTimeView,
    notifyTelegram: i.notifyTelegram,
    createdAt: i.createdAt,
    activatedAt: i.activatedAt,
    expiresAt: i.expiresAt,
    opens: i._count.opens,
    responses: i._count.responses,
  }));

  return toPage(items, total, page);
}

/* ---------- Уведомления (outbox) ---------- */

export interface OutboxRow {
  id: string;
  authorId: string;
  invitationId: string;
  type: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export async function listOutbox(filters: {
  status?: OutboxStatus;
  page?: number;
} = {}): Promise<Page<OutboxRow> & { pending: number; failed: number; sent: number }> {
  const page = filters.page ?? 1;
  const { skip, take } = paging(page);
  const where: Prisma.NotificationOutboxWhereInput = filters.status
    ? { status: filters.status }
    : {};

  const [rows, total, groups] = await Promise.all([
    prisma.notificationOutbox.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.notificationOutbox.count({ where }),
    prisma.notificationOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const counts = { PENDING: 0, SENT: 0, FAILED: 0 } as Record<OutboxStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;

  const items: OutboxRow[] = rows.map((o) => ({
    id: o.id,
    authorId: o.authorId,
    invitationId: o.invitationId,
    type: o.type,
    status: o.status,
    attempts: o.attempts,
    lastError: o.lastError,
    createdAt: o.createdAt,
    sentAt: o.sentAt,
  }));

  return {
    ...toPage(items, total, page),
    pending: counts.PENDING,
    failed: counts.FAILED,
    sent: counts.SENT,
  };
}

/** Telegram-контакты (@username → chatId), накопленные вебхуком бота. */
export async function listTelegramContacts(limit = 50) {
  return prisma.telegramContact.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

/**
 * Сколько событий в очереди некому доставить: у приглашения не указан
 * `notifyTelegram` (или названный @username ещё не писал боту), и у автора нет
 * привязанного `telegramChatId`.
 *
 * Воркер такие строки не считает ошибкой — он их пропускает и оставляет
 * PENDING до появления получателя. Поэтому в панели их полезно отделять от
 * настоящей очереди: иначе большое число «в очереди» выглядит как сбой
 * доставки, хотя отправлять просто некуда.
 */
export async function countUndeliverablePending(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "NotificationOutbox" o
    LEFT JOIN "Invitation" i ON i."id" = o."invitationId"
    LEFT JOIN "TelegramContact" c ON c."username" = i."notifyTelegram"
    LEFT JOIN "Author" a ON a."id" = o."authorId"
    WHERE o."status" = 'PENDING'
      AND c."chatId" IS NULL
      AND a."telegramChatId" IS NULL
  `;
  return Number(rows[0]?.count ?? 0);
}
