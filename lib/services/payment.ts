/**
 * Payment domain service (task 5.1 — checkout start only).
 *
 * `startCheckout` is the author-facing entry point behind
 * `POST /api/invitations/:id/checkout`. It:
 *  1. loads the invitation and enforces ownership (403) / existence (404);
 *  2. requires the invitation to still be a DRAFT (409) — an already
 *     active/paid invitation cannot be paid for again;
 *  3. records the chosen `tier` on the invitation;
 *  4. opens a checkout session with the configured {@link PaymentProvider};
 *  5. persists a PENDING {@link Payment} row carrying the provider `sessionId`
 *     (later used for idempotent webhook handling, Property 2);
 *  6. transitions the invitation to `PENDING_PAYMENT` and returns the
 *     `checkoutUrl` the author is redirected to.
 *
 * Webhook verification / activation (success → `activate()`, fail → keep draft)
 * is implemented by `handleWebhook` (task 5.2). `startCheckout` above only
 * starts the checkout.
 */
import { assertOwnership } from '@/lib/auth/guards';
import {
  invitationRepo as defaultInvitationRepo,
  paymentRepo as defaultPaymentRepo,
} from '@/lib/repositories';
import { getPaymentProvider } from '@/lib/payments/provider';
import type { PaymentEvent, PaymentProvider } from '@/lib/payments/provider';
import { invitationService as defaultInvitationService } from '@/lib/services/invitation';
import type { ActivationResult } from '@/lib/services/invitation';
import type { Tier } from '@prisma/client';

/** Tier the checkout endpoint accepts (lower-case wire form). */
export type CheckoutTier = 'basic' | 'premium';

/** Amount charged per tier, in the smallest currency unit (MVP fixed pricing). */
export const TIER_AMOUNTS: Record<CheckoutTier, number> = {
  basic: 990,
  premium: 1990,
};

/** Map the wire tier to the Prisma {@link Tier} enum. */
function toPrismaTier(tier: CheckoutTier): Tier {
  return tier === 'premium' ? 'PREMIUM' : 'BASIC';
}

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

/**
 * Outcome of {@link PaymentService.handleWebhook}. The webhook handler returns a
 * description of what it did rather than throwing, so the Route Handler can
 * always acknowledge the provider (and avoid retry storms) while still logging
 * the result.
 */
export type WebhookResult =
  /** Payment succeeded and the invitation was activated. */
  | { status: 'activated'; invitationId: string; token: string; url: string }
  /** Payment failed/cancelled; the invitation was kept as a draft. */
  | { status: 'failed'; invitationId: string }
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

/** Invitation service surface the webhook handler depends on (activation). */
export interface PaymentActivationService {
  activate(invitationId: string): Promise<ActivationResult>;
}

/** Injectable dependencies (kept explicit so the service is unit-testable). */
export interface PaymentServiceDeps {
  provider: PaymentProvider;
  invitationRepo: PaymentInvitationRepo;
  paymentRepo: PaymentServicePaymentRepo;
  invitationService: PaymentActivationService;
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
  private readonly invitationService: PaymentActivationService;

  constructor(deps: PaymentServiceDeps) {
    this.provider = deps.provider;
    this.invitationRepo = deps.invitationRepo;
    this.paymentRepo = deps.paymentRepo;
    this.invitationService = deps.invitationService;
  }

  /**
   * Start a checkout for `invitationId` on the given `tier` for `authorId`.
   * Returns the hosted `checkoutUrl` the author is redirected to.
   *
   * Enforces existence (404), ownership (403, Requirement 10.4) and DRAFT
   * status (409). Creates a PENDING payment with the provider `sessionId` and
   * moves the invitation to `PENDING_PAYMENT` (Requirement 3.1/3.2).
   */
  async startCheckout(
    invitationId: string,
    authorId: string,
    tier: CheckoutTier,
  ): Promise<string> {
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

    const prismaTier = toPrismaTier(tier);
    const amount = TIER_AMOUNTS[tier];

    // Persist the chosen tier on the invitation (Requirement 3.5/3.6 driver).
    await this.invitationRepo.update(invitationId, { tier: prismaTier });

    const { checkoutUrl, sessionId } = await this.provider.createCheckout({
      invitationId,
      tier: prismaTier,
      amount,
    });

    // Record the pending payment carrying the provider session id (Property 2).
    await this.paymentRepo.create({
      invitationId,
      provider: this.provider.name,
      sessionId,
      amount,
      tier: prismaTier,
      status: 'PENDING',
    });

    // Move the invitation into the awaiting-payment state (Requirement 3.2).
    await this.invitationRepo.update(invitationId, { status: 'PENDING_PAYMENT' });

    return checkoutUrl;
  }

  /**
   * Handle a verified payment {@link PaymentEvent} from a provider webhook
   * (task 5.2). Idempotent by the provider `sessionId` (Property 2): re-delivery
   * of the same event neither activates an invitation twice nor flips a payment
   * that has already reached a terminal state.
   *
   * Outcomes:
   *  - **succeeded** → mark the payment SUCCEEDED and activate the invitation
   *    (generate token + URL, status ACTIVE). Activation happens only after a
   *    successful payment (Property 1 / Requirement 3.3).
   *  - **failed** → mark the payment FAILED and keep the invitation as a draft
   *    so the author can retry (Requirement 3.4). A `PENDING_PAYMENT` invitation
   *    is returned to `DRAFT`; an invitation already in another state is left
   *    untouched.
   *
   * An unknown `sessionId` is a no-op (`{ status: 'ignored' }`) rather than an
   * error: webhooks can arrive for sessions we don't track, and we must not
   * fail the provider's delivery.
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
      // follows a SUCCEEDED payment), then activate the invitation.
      await this.paymentRepo.updateStatus(event.sessionId, 'SUCCEEDED');
      const activation = await this.invitationService.activate(payment.invitationId);
      return {
        status: 'activated',
        invitationId: payment.invitationId,
        token: activation.token,
        url: activation.url,
      };
    }

    // Failed/cancelled: mark the payment FAILED and keep the draft so the author
    // can retry the checkout (Requirement 3.4).
    await this.paymentRepo.updateStatus(event.sessionId, 'FAILED');
    const invitation = await this.invitationRepo.findById(payment.invitationId);
    if (invitation && invitation.status === 'PENDING_PAYMENT') {
      await this.invitationRepo.update(payment.invitationId, { status: 'DRAFT' });
    }
    return { status: 'failed', invitationId: payment.invitationId };
  }
}

/** Default service wired with the configured provider and real repositories. */
export const paymentService = new PaymentService({
  provider: getPaymentProvider(),
  invitationRepo: defaultInvitationRepo,
  paymentRepo: defaultPaymentRepo,
  invitationService: defaultInvitationService,
});

/** Validate and coerce an arbitrary value into a {@link CheckoutTier}. */
export function parseTier(value: unknown): CheckoutTier | null {
  return value === 'basic' || value === 'premium' ? value : null;
}
