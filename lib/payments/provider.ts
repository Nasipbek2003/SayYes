/**
 * Payment provider abstraction (task 5.1).
 *
 * The domain layer talks to payments through the {@link PaymentProvider}
 * interface only, so the concrete acquirer can be swapped without touching
 * {@link PaymentService} or the Route Handlers. Two adapters ship today:
 *  - {@link FinikPaymentProvider} — реальный эквайринг Finik (KGS), см.
 *    `lib/payments/finik.ts`;
 *  - {@link MockPaymentProvider} — локальная заглушка для разработки и тестов.
 *
 * Two responsibilities live behind the interface:
 *  - `createCheckout` — start a hosted checkout session and hand back the URL
 *    the author is redirected to, plus the provider `sessionId` we persist on
 *    the `Payment` row (used later for idempotent webhook handling, Property 2).
 *  - `verifyWebhook` — verify the provider's signed callback and normalise it
 *    into a {@link PaymentEvent}.
 */
import { randomUUID } from 'node:crypto';

import type { Tier } from '@prisma/client';

import { env } from '@/lib/env';
import type { PlanId } from '@/lib/pricing';

import { FinikPaymentProvider } from './finik';

/** Parameters required to open a hosted checkout session. */
export interface CheckoutParams {
  /** Invitation the payment is for — отсутствует у «чистой» подписки. */
  invitationId?: string;
  /** Автор-плательщик (попадает в метаданные платежа). */
  authorId: string;
  /** Выбранный тариф: разовая оплата или подписка на месяц. */
  plan: PlanId;
  /** Tier, который получит приглашение после оплаты. */
  tier: Tier;
  /** Сумма списания в целых сомах (Finik принимает `Amount` в сомах). */
  amount: number;
  /** ISO-4217 currency code. Defaults to the provider's configured currency. */
  currency?: string;
  /** Описание платежа, показывается плательщику. */
  description?: string;
  /** Куда провайдер вернёт плательщика после успешной оплаты. */
  successUrl?: string;
  /** Where the provider sends the author after a cancelled payment. */
  cancelUrl?: string;
}

/** Result of opening a checkout session. */
export interface CheckoutResult {
  /** Hosted checkout URL the author is redirected to. */
  checkoutUrl: string;
  /** Provider session id, persisted on the `Payment` row (unique). */
  sessionId: string;
}

/** Normalised payment outcome decoded from a provider webhook. */
export interface PaymentEvent {
  /** Provider session id this event refers to (links back to the `Payment`). */
  sessionId: string;
  /** Outcome of the payment. */
  status: 'succeeded' | 'failed';
  /** Provider event id, when present — supports idempotent processing. */
  eventId?: string;
  /** Идентификатор транзакции у провайдера (пишем в `Payment.externalId`). */
  externalId?: string;
}

/**
 * The contract every payment adapter implements. Kept intentionally small: the
 * domain only needs to start a checkout and verify webhooks.
 */
export interface PaymentProvider {
  /** Provider identifier persisted on the `Payment` row (e.g. "mock", "finik"). */
  readonly name: string;
  /** Open a hosted checkout session for the given parameters. */
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  /** Verify a provider webhook request and normalise it to a {@link PaymentEvent}. */
  verifyWebhook(req: Request): Promise<PaymentEvent>;
}

/** Error raised when a webhook payload cannot be verified/parsed. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Провайдер выбран, но не настроен (нет ключей/счёта). Это не ошибка автора и
 * не баг: приём платежей просто не сконфигурирован, поэтому обработчики
 * отвечают 503, а не 500.
 */
export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigError';
  }
}

/**
 * Configurable in-memory provider for local development and tests.
 *
 * `createCheckout` mints a random session id and returns a local mock checkout
 * URL (under the app's own origin) so the end-to-end flow works without an
 * external acquirer. `verifyWebhook` accepts a simple JSON body
 * `{ sessionId, status }` — and, when a webhook secret is configured, requires a
 * matching `x-webhook-secret` header so the verification path can be exercised.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(
    private readonly options: {
      /** Base URL used to build the mock checkout link. */
      appUrl?: string;
      /** Optional shared secret required on webhook requests. */
      webhookSecret?: string;
    } = {},
  ) {}

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const sessionId = `mock_${randomUUID()}`;
    const base = (this.options.appUrl ?? env.appUrl).replace(/\/$/, '');
    const query = params.successUrl
      ? `?next=${encodeURIComponent(params.successUrl)}`
      : '';
    const checkoutUrl = `${base}/mock-checkout/${sessionId}${query}`;
    return { checkoutUrl, sessionId };
  }

  async verifyWebhook(req: Request): Promise<PaymentEvent> {
    const secret = this.options.webhookSecret ?? env.payment.webhookSecret;
    if (secret) {
      const provided = req.headers.get('x-webhook-secret');
      if (provided !== secret) {
        throw new WebhookVerificationError('Invalid webhook signature');
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new WebhookVerificationError('Invalid webhook body');
    }

    const record = (body ?? {}) as Record<string, unknown>;
    const sessionId = record.sessionId;
    const status = record.status;
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new WebhookVerificationError('Missing sessionId');
    }
    if (status !== 'succeeded' && status !== 'failed') {
      throw new WebhookVerificationError('Unknown payment status');
    }

    return {
      sessionId,
      status,
      ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
    };
  }
}

/**
 * Resolve the configured {@link PaymentProvider}, keyed by `PAYMENT_PROVIDER`.
 * Defaults to the mock provider so local development works without acquirer
 * credentials.
 */
export function getPaymentProvider(): PaymentProvider {
  switch (env.payment.provider) {
    case 'finik':
      return new FinikPaymentProvider();
    case 'mock':
    default:
      return new MockPaymentProvider();
  }
}
