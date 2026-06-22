/**
 * Payment provider abstraction (task 5.1).
 *
 * The domain layer talks to payments through the {@link PaymentProvider}
 * interface only, so the concrete acquirer (Stripe, a local acquirer, …) can be
 * swapped without touching {@link PaymentService} or the Route Handlers. For the
 * MVP we ship a configurable {@link MockPaymentProvider} that fabricates a
 * checkout session locally; real providers plug in later via environment keys
 * (`PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`).
 *
 * Two responsibilities live behind the interface:
 *  - `createCheckout` — start a hosted checkout session and hand back the URL
 *    the author is redirected to, plus the provider `sessionId` we persist on
 *    the `Payment` row (used later for idempotent webhook handling, Property 2).
 *  - `verifyWebhook` — verify the provider's signed callback and normalise it
 *    into a {@link PaymentEvent}. Implemented here so the abstraction is
 *    complete; the activation flow that consumes it is task 5.2.
 */
import { randomUUID } from 'node:crypto';

import type { Tier } from '@prisma/client';

import { env } from '@/lib/env';

/** Parameters required to open a hosted checkout session. */
export interface CheckoutParams {
  /** Invitation the payment is for (echoed back in the webhook metadata). */
  invitationId: string;
  /** Selected tier — drives the amount and the activated invitation's features. */
  tier: Tier;
  /** Charge amount in the smallest currency unit (e.g. tiyin/cents). */
  amount: number;
  /** ISO-4217 currency code. Defaults to the provider's configured currency. */
  currency?: string;
  /** Where the provider sends the author after a successful payment. */
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
}

/**
 * The contract every payment adapter implements. Kept intentionally small: the
 * domain only needs to start a checkout and verify webhooks.
 */
export interface PaymentProvider {
  /** Provider identifier persisted on the `Payment` row (e.g. "mock", "stripe"). */
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
 * Configurable in-memory provider for the MVP and tests.
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
    const checkoutUrl = `${base}/mock-checkout/${sessionId}`;
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
 * Resolve the configured {@link PaymentProvider}. Defaults to the mock provider
 * for the MVP; real providers are added here keyed by `PAYMENT_PROVIDER` once
 * their credentials are wired through the environment.
 */
export function getPaymentProvider(): PaymentProvider {
  switch (env.payment.provider) {
    case 'mock':
    default:
      return new MockPaymentProvider();
  }
}
