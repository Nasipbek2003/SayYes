/**
 * Payment domain service.
 *
 * Два тарифа (см. `lib/pricing.ts`):
 *  - `single`  — 100 сом за одно приглашение;
 *  - `monthly` — 300 сом за 30 дней, внутри которых приглашения публикуются
 *    без отдельной оплаты.
 *
 * `startCheckout` — точка входа для автора (`POST /api/invitations/:id/checkout`):
 *  1. загружает приглашение, проверяет существование (404) и владельца (403);
 *  2. требует статус DRAFT (409) — оплаченное приглашение не оплачивают дважды;
 *  3. если у автора уже активна подписка — публикует сразу, без платежа;
 *  4. иначе открывает checkout у провайдера, пишет PENDING-платёж с
 *     `sessionId` (основа идемпотентности, Property 2) и переводит приглашение
 *     в `PENDING_PAYMENT`.
 *
 * `handleWebhook` применяет подтверждённое событие: успех → платёж SUCCEEDED,
 * подписка продлевается (для `monthly`), приглашение активируется; неуспех →
 * платёж FAILED, приглашение возвращается в DRAFT.
 */
import { assertOwnership } from '@/lib/auth/guards';
import {
  invitationRepo as defaultInvitationRepo,
  paymentRepo as defaultPaymentRepo,
  subscriptionRepo as defaultSubscriptionRepo,
} from '@/lib/repositories';
import { getPaymentProvider } from '@/lib/payments/provider';
import type { PaymentEvent, PaymentProvider } from '@/lib/payments/provider';
import { invitationService as defaultInvitationService } from '@/lib/services/invitation';
import type { ActivationResult } from '@/lib/services/invitation';
import { env } from '@/lib/env';
import { planIdFromPrisma, type Plan, type PlanId } from '@/lib/pricing';
import { getPlans } from '@/lib/settings/appConfig';
import type { Tier } from '@prisma/client';


export type { PlanId } from '@/lib/pricing';

/**
 * Tier активированного приглашения. Цена больше не зависит от набора функций —
 * любое оплаченное приглашение получает полный набор (PREMIUM).
 */
const PAID_TIER: Tier = 'PREMIUM';



/** Error carrying the HTTP status the handler should return for domain failures. */
export class PaymentServiceError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

/** Результат {@link PaymentService.startCheckout}. */
export type CheckoutStart =
  /** Нужна оплата — ведём автора на страницу провайдера. */
  | { kind: 'checkout'; checkoutUrl: string; sessionId: string }
  /** Подписка активна — приглашение опубликовано сразу, без платежа. */
  | { kind: 'activated'; invitationId: string; token: string; url: string };

/**
 * Outcome of {@link PaymentService.handleWebhook}. The webhook handler returns a
 * description of what it did rather than throwing, so the Route Handler can
 * always acknowledge the provider (and avoid retry storms) while still logging
 * the result.
 */
export type WebhookResult =
  /** Payment succeeded and the invitation was activated. */
  | {
      status: 'activated';
      invitationId: string;
      token: string;
      url: string;
      subscriptionUntil?: string;
    }
  /** Оплата подписки прошла, но приглашения к платежу не привязано. */
  | { status: 'subscribed'; subscriptionUntil: string }
  /** Payment failed/cancelled; the invitation was kept as a draft. */
  | { status: 'failed'; invitationId: string | null }
  /** Event already processed (idempotent re-delivery, Property 2). */
  | { status: 'duplicate'; paymentStatus: 'SUCCEEDED' | 'FAILED' | 'PENDING' }
  /** No payment matched the session id — nothing to do. */
  | { status: 'ignored'; reason: 'unknown_session' };

/** Invitation repository surface the service depends on. */
export interface PaymentInvitationRepo {
  findById: typeof defaultInvitationRepo.findById;
  update: typeof defaultInvitationRepo.update;
}

/** Payment repository surface the service depends on. */
export interface PaymentServicePaymentRepo {
  create: typeof defaultPaymentRepo.create;
  findBySessionId: typeof defaultPaymentRepo.findBySessionId;
  updateStatus: typeof defaultPaymentRepo.updateStatus;
}

/** Subscription repository surface the service depends on. */
export interface PaymentSubscriptionRepo {
  findActiveByAuthor: typeof defaultSubscriptionRepo.findActiveByAuthor;
  extend: typeof defaultSubscriptionRepo.extend;
}

/** Invitation service surface the webhook handler depends on (activation). */
export interface PaymentActivationService {
  activate(invitationId: string): Promise<ActivationResult>;
}

/** Injectable dependencies (kept explicit so the service is unit-testable). */
export interface PaymentServiceDeps {
  provider: PaymentProvider;
  invitationRepo: PaymentInvitationRepo;
  paymentRepo: PaymentServicePaymentRepo;
  subscriptionRepo: PaymentSubscriptionRepo;
  invitationService: PaymentActivationService;
  /** Базовый URL приложения — из него строится RedirectUrl провайдера. */
  appUrl?: string;
  /**
   * Загрузчик действующих тарифов. По умолчанию читает их из таблицы `Setting`
   * (администратор меняет цены из панели); в тестах подставляются статические
   * значения, чтобы не ходить в БД.
   */
  loadPlans?: () => Promise<Record<PlanId, Plan>>;
}

/**
 * Domain service for starting a checkout. Construct with explicit dependencies
 * in tests; the default {@link paymentService} singleton wires the configured
 * provider and the real repositories.
 */
export class PaymentService {
  private readonly provider: PaymentProvider;
  private readonly invitationRepo: PaymentInvitationRepo;
  private readonly paymentRepo: PaymentServicePaymentRepo;
  private readonly subscriptionRepo: PaymentSubscriptionRepo;
  private readonly invitationService: PaymentActivationService;
  private readonly appUrl: string;
  private readonly loadPlans: () => Promise<Record<PlanId, Plan>>;

  constructor(deps: PaymentServiceDeps) {
    this.provider = deps.provider;
    this.invitationRepo = deps.invitationRepo;
    this.paymentRepo = deps.paymentRepo;
    this.subscriptionRepo = deps.subscriptionRepo;
    this.invitationService = deps.invitationService;
    this.appUrl = (deps.appUrl ?? env.appUrl).replace(/\/$/, '');
    this.loadPlans = deps.loadPlans ?? getPlans;
  }

  /**
   * Открывает оплату приглашения `invitationId` по плану `plan` для `authorId`.
   *
   * Enforces existence (404), ownership (403, Requirement 10.4) and DRAFT
   * status (409). При активной подписке платёж не создаётся — приглашение
   * публикуется сразу.
   */
  async startCheckout(
    invitationId: string,
    authorId: string,
    plan: PlanId,
  ): Promise<CheckoutStart> {
    const invitation = await this.invitationRepo.findById(invitationId);
    if (!invitation) {
      throw new PaymentServiceError(404, 'Invitation not found.', 'not_found');
    }
    // Throws AuthError(403) when the author doesn't own it (Requirement 10.4).
    assertOwnership(authorId, invitation.authorId);

    if (invitation.status !== 'DRAFT') {
      throw new PaymentServiceError(
        409,
        'Only draft invitations can be checked out.',
        'not_draft',
      );
    }

    // Активная подписка покрывает публикацию — платить второй раз не нужно.
    const subscription = await this.subscriptionRepo.findActiveByAuthor(authorId);
    if (subscription) {
      await this.invitationRepo.update(invitationId, {
        tier: PAID_TIER,
        status: 'PENDING_PAYMENT',
      });
      const activation = await this.invitationService.activate(invitationId);
      return {
        kind: 'activated',
        invitationId,
        token: activation.token,
        url: activation.url,
      };
    }

    // Цену берём в момент оплаты: администратор мог изменить её в панели.
    const plans = await this.loadPlans();
    const { amount, currency, description } = plans[plan];

    // Persist the resolved tier on the invitation (drives runtime features).
    await this.invitationRepo.update(invitationId, { tier: PAID_TIER });

    const { checkoutUrl, sessionId } = await this.provider.createCheckout({
      invitationId,
      authorId,
      plan,
      tier: PAID_TIER,
      amount,
      currency,
      description: `SayYes — ${description}`,
      successUrl: `${this.appUrl}/payment/callback`,
    });

    // Record the pending payment carrying the provider session id (Property 2).
    await this.paymentRepo.create({
      invitationId,
      authorId,
      plan: plans[plan].prismaPlan,
      provider: this.provider.name,
      sessionId,
      amount,
      currency,
      tier: PAID_TIER,
      status: 'PENDING',
    });

    // Move the invitation into the awaiting-payment state (Requirement 3.2).
    await this.invitationRepo.update(invitationId, { status: 'PENDING_PAYMENT' });

    return { kind: 'checkout', checkoutUrl, sessionId };
  }

  /**
   * Handle a verified payment {@link PaymentEvent} from a provider webhook.
   * Идемпотентно по `sessionId` (Property 2): повторная доставка того же
   * события не активирует приглашение дважды и не переводит платёж из
   * терминального состояния.
   *
   * Outcomes:
   *  - **succeeded** → платёж SUCCEEDED; для плана `monthly` подписка автора
   *    продлевается на 30 дней; привязанное приглашение активируется (токен +
   *    ссылка, статус ACTIVE). Активация строго после успешной оплаты
   *    (Property 1 / Requirement 3.3).
   *  - **failed** → платёж FAILED, приглашение из `PENDING_PAYMENT` возвращается
   *    в `DRAFT`, чтобы автор мог повторить оплату (Requirement 3.4).
   *
   * Неизвестный `sessionId` — не ошибка, а no-op (`ignored`): доставку
   * провайдера нельзя ронять.
   */
  async handleWebhook(event: PaymentEvent): Promise<WebhookResult> {
    const payment = await this.paymentRepo.findBySessionId(event.sessionId);
    if (!payment) {
      // Unknown session — nothing to do. Don't error the provider's delivery.
      return { status: 'ignored', reason: 'unknown_session' };
    }

    // Idempotency (Property 2): a payment already in a terminal state means this
    // event (or an equivalent one) was already processed. Don't reprocess.
    if (payment.status !== 'PENDING') {
      return { status: 'duplicate', paymentStatus: payment.status };
    }

    if (event.status === 'succeeded') {
      // Record the successful payment first (Property 1: activation strictly
      // follows a SUCCEEDED payment), then grant access.
      await this.paymentRepo.updateStatus(event.sessionId, 'SUCCEEDED', {
        externalId: event.externalId ?? null,
      });

      // Подписка: продлеваем срок доступа автора.
      let subscriptionUntil: string | undefined;
      if (planIdFromPrisma(payment.plan) === 'monthly') {
        const days = (await this.loadPlans()).monthly.periodDays ?? 30;
        const subscription = await this.subscriptionRepo.extend(payment.authorId, days);
        subscriptionUntil = subscription.expiresAt.toISOString();
      }

      if (!payment.invitationId) {
        return {
          status: 'subscribed',
          subscriptionUntil: subscriptionUntil ?? new Date().toISOString(),
        };
      }

      const activation = await this.invitationService.activate(payment.invitationId);
      return {
        status: 'activated',
        invitationId: payment.invitationId,
        token: activation.token,
        url: activation.url,
        ...(subscriptionUntil ? { subscriptionUntil } : {}),
      };
    }

    // Failed/cancelled: mark the payment FAILED and keep the draft so the author
    // can retry the checkout (Requirement 3.4).
    await this.paymentRepo.updateStatus(event.sessionId, 'FAILED');
    if (!payment.invitationId) {
      return { status: 'failed', invitationId: null };
    }
    const invitation = await this.invitationRepo.findById(payment.invitationId);
    if (invitation && invitation.status === 'PENDING_PAYMENT') {
      await this.invitationRepo.update(payment.invitationId, { status: 'DRAFT' });
    }
    return { status: 'failed', invitationId: payment.invitationId };
  }

  /**
   * Статус платежа по `sessionId` — для страницы возврата с оплаты, которая
   * ждёт вебхук. Ссылку отдаём только владельцу платежа.
   */
  async getSessionStatus(
    sessionId: string,
    authorId: string,
  ): Promise<{
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
    plan: PlanId;
    invitationId: string | null;
    url: string | null;
  }> {
    const payment = await this.paymentRepo.findBySessionId(sessionId);
    if (!payment) {
      throw new PaymentServiceError(404, 'Payment not found.', 'not_found');
    }
    assertOwnership(authorId, payment.authorId);

    let url: string | null = null;
    if (payment.status === 'SUCCEEDED' && payment.invitationId) {
      const invitation = await this.invitationRepo.findById(payment.invitationId);
      url =
        invitation?.token
          ? `${this.appUrl}/i/${encodeURIComponent(invitation.token)}`
          : null;
    }

    return {
      status: payment.status,
      plan: planIdFromPrisma(payment.plan),
      invitationId: payment.invitationId ?? null,
      url,
    };
  }
}

/** Default service wired with the configured provider and real repositories. */
export const paymentService = new PaymentService({
  provider: getPaymentProvider(),
  invitationRepo: defaultInvitationRepo,
  paymentRepo: defaultPaymentRepo,
  subscriptionRepo: defaultSubscriptionRepo,
  invitationService: defaultInvitationService,
});
