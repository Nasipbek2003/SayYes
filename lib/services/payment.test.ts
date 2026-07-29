/**
 * Unit tests for {@link PaymentService.startCheckout} (task 5.1).
 *
 * The service is constructed with an injected fake provider and in-memory
 * invitation/payment repositories, so the tests exercise the real checkout
 * orchestration without Prisma/Postgres or an external acquirer.
 *
 * Coverage:
 *  - startCheckout opens a session, persists a PENDING payment with the
 *    provider sessionId and the chosen tier, moves the invitation to
 *    PENDING_PAYMENT and returns the checkoutUrl (Requirement 3.1/3.2);
 *  - the selected plan ('single' — 100 сом | 'monthly' — 300 сом) is recorded on
 *    the payment with the right amount, а приглашение получает полный tier;
 *  - активная подписка публикует приглашение без нового платежа;
 *  - unknown invitation → 404; another author's invitation → 403
 *    (Requirement 10.4); a non-DRAFT invitation → 409.
 *
 * **Validates: Requirements 3.1, 3.2**
 *
 * ## Webhook handling (task 5.2)
 *
 * `handleWebhook` is covered below with example-based unit tests and two
 * property-based tests (fast-check):
 *  - Property 1: an invitation is only activated after a SUCCEEDED payment;
 *  - Property 2: idempotency — re-delivering the same `sessionId` never
 *    activates twice nor creates/flips a second payment.
 * Plus draft preservation on a failed/cancelled payment (Requirement 3.4).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type { Invitation, Payment, Subscription } from '@prisma/client';

import { AuthError } from '@/lib/auth/guards';
import type { CheckoutResult, PaymentProvider } from '@/lib/payments/provider';
import { PLAN_AMOUNTS } from '@/lib/pricing';
import {
  PaymentService,
  PaymentServiceError,
  type PaymentActivationService,
  type PaymentInvitationRepo,
  type PaymentServicePaymentRepo,
  type PaymentSubscriptionRepo,
} from './payment';

const AUTHOR = 'author-1';

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    authorId: AUTHOR,
    templateId: 'simple-date',
    themeId: 'romantic',
    tier: 'BASIC',
    status: 'DRAFT',
    data: {} as Invitation['data'],
    token: null,
    expiresAt: null,
    oneTimeView: false,
    createdAt: new Date(),
    activatedAt: null,
    notifyTelegram: null,
    ...overrides,
  };
}

function makeFakeInvitationRepo(seed: Invitation[]) {
  const store = new Map<string, Invitation>(seed.map((i) => [i.id, i]));
  const repo: PaymentInvitationRepo = {
    findById: async (id) => store.get(id) ?? null,
    update: async (id, data) => {
      const existing = store.get(id);
      if (!existing) throw new Error(`no invitation ${id}`);
      const updated: Invitation = {
        ...existing,
        ...(data.tier !== undefined ? { tier: data.tier as Invitation['tier'] } : {}),
        ...(data.status !== undefined
          ? { status: data.status as Invitation['status'] }
          : {}),
      };
      store.set(id, updated);
      return updated;
    },
  };
  return { repo, store };
}

function makeFakePaymentRepo(seed: Payment[] = []) {
  const created: Payment[] = [...seed];
  const store = new Map<string, Payment>(seed.map((p) => [p.sessionId, p]));
  const repo: PaymentServicePaymentRepo = {
    create: async (input) => {
      const payment: Payment = {
        id: `pay-${created.length + 1}`,
        invitationId: input.invitationId ?? null,
        authorId: input.authorId,
        plan: input.plan,
        provider: input.provider,
        sessionId: input.sessionId,
        externalId: input.externalId ?? null,
        status: input.status ?? 'PENDING',
        amount: input.amount,
        currency: input.currency ?? 'KGS',
        tier: input.tier,
        createdAt: new Date(),
        paidAt: null,
      };
      created.push(payment);
      store.set(payment.sessionId, payment);
      return payment;
    },
    findBySessionId: async (sessionId) => store.get(sessionId) ?? null,
    updateStatus: async (sessionId, status, extra = {}) => {
      const existing = store.get(sessionId);
      if (!existing) throw new Error(`no payment ${sessionId}`);
      const updated: Payment = {
        ...existing,
        status,
        paidAt: status === 'SUCCEEDED' ? new Date() : existing.paidAt,
        externalId: extra.externalId ?? existing.externalId,
      };
      store.set(sessionId, updated);
      return updated;
    },
  };
  return { repo, created, store };
}

/**
 * In-memory подписки: `active` — заранее выданная активная подписка,
 * `extended` — журнал продлений, чтобы проверять оплату плана monthly.
 */
function makeFakeSubscriptionRepo(active: Subscription | null = null) {
  const extended: Array<{ authorId: string; days: number }> = [];
  let current = active;

  const repo: PaymentSubscriptionRepo = {
    findActiveByAuthor: async (authorId) =>
      current && current.authorId === authorId ? current : null,
    extend: async (authorId, days, now = new Date()) => {
      extended.push({ authorId, days });
      const from = current ? current.expiresAt : now;
      current = {
        id: 'sub-1',
        authorId,
        startedAt: current?.startedAt ?? now,
        expiresAt: new Date(from.getTime() + days * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      };
      return current;
    },
  };

  return { repo, extended, get current() { return current; } };
}

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  const now = new Date();
  return {
    id: 'sub-1',
    authorId: AUTHOR,
    startedAt: now,
    expiresAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Fake activation service recording the invitation ids it was asked to activate. */
function makeFakeActivationService() {
  const activated: string[] = [];
  const service: PaymentActivationService = {
    activate: async (invitationId) => {
      activated.push(invitationId);
      return {
        token: `tok-${invitationId}`,
        url: `http://localhost:3000/i/tok-${invitationId}`,
      };
    },
  };
  return { service, activated };
}

function makeFakeProvider(result: CheckoutResult): {
  provider: PaymentProvider;
  createCheckout: ReturnType<typeof vi.fn>;
} {
  const createCheckout = vi.fn().mockResolvedValue(result);
  const provider: PaymentProvider = {
    name: 'mock',
    createCheckout: (...args: unknown[]) => createCheckout(...args),
    verifyWebhook: vi.fn(),
  };
  return { provider, createCheckout };
}

/**
 * Build a {@link PaymentService} wired with the supplied fakes. A no-op
 * activation service is injected by default so checkout tests don't need to
 * care about it; webhook tests pass their own.
 */
function buildService(deps: {
  provider: PaymentProvider;
  invitationRepo: PaymentInvitationRepo;
  paymentRepo: PaymentServicePaymentRepo;
  subscriptionRepo?: PaymentSubscriptionRepo;
  invitationService?: PaymentActivationService;
}): PaymentService {
  return new PaymentService({
    provider: deps.provider,
    invitationRepo: deps.invitationRepo,
    paymentRepo: deps.paymentRepo,
    subscriptionRepo: deps.subscriptionRepo ?? makeFakeSubscriptionRepo().repo,
    invitationService:
      deps.invitationService ?? makeFakeActivationService().service,
    appUrl: 'http://localhost:3000',
  });
}

describe('PaymentService.startCheckout', () => {
  it('opens a session, records a PENDING payment and moves the invitation to PENDING_PAYMENT', async () => {
    const { repo: invRepo, store } = makeFakeInvitationRepo([makeInvitation()]);
    const { repo: payRepo, created } = makeFakePaymentRepo();
    const { provider, createCheckout } = makeFakeProvider({
      checkoutUrl: 'https://pay.example/sess_1',
      sessionId: 'sess_1',
    });

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
    });

    const result = await service.startCheckout('inv-1', AUTHOR, 'single');

    expect(result).toEqual({
      kind: 'checkout',
      checkoutUrl: 'https://pay.example/sess_1',
      sessionId: 'sess_1',
    });
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationId: 'inv-1',
        authorId: AUTHOR,
        plan: 'single',
        tier: 'PREMIUM',
        amount: PLAN_AMOUNTS.single,
        currency: 'KGS',
      }),
    );

    // PENDING payment persisted with the provider session id.
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      invitationId: 'inv-1',
      authorId: AUTHOR,
      plan: 'SINGLE',
      provider: 'mock',
      sessionId: 'sess_1',
      status: 'PENDING',
      amount: PLAN_AMOUNTS.single,
      currency: 'KGS',
    });

    // Invitation moved to PENDING_PAYMENT.
    const updated = store.get('inv-1')!;
    expect(updated.status).toBe('PENDING_PAYMENT');
    expect(updated.tier).toBe('PREMIUM');
  });

  it('charges the monthly amount and records the MONTHLY plan for a subscription', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([makeInvitation()]);
    const { repo: payRepo, created } = makeFakePaymentRepo();
    const { provider } = makeFakeProvider({
      checkoutUrl: 'https://pay.example/sess_2',
      sessionId: 'sess_2',
    });

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
    });

    await service.startCheckout('inv-1', AUTHOR, 'monthly');

    expect(created[0]).toMatchObject({
      plan: 'MONTHLY',
      amount: PLAN_AMOUNTS.monthly,
    });
  });

  it('activates without a payment when the author already has an active subscription', async () => {
    const { repo: invRepo, store } = makeFakeInvitationRepo([makeInvitation()]);
    const { repo: payRepo, created } = makeFakePaymentRepo();
    const { provider, createCheckout } = makeFakeProvider({
      checkoutUrl: 'x',
      sessionId: 'x',
    });
    const { service: activation, activated } = makeFakeActivationService();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      subscriptionRepo: makeFakeSubscriptionRepo(makeSubscription()).repo,
      invitationService: activation,
    });

    const result = await service.startCheckout('inv-1', AUTHOR, 'single');

    expect(result).toMatchObject({ kind: 'activated', invitationId: 'inv-1' });
    // Никаких платежей и обращений к провайдеру.
    expect(createCheckout).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(activated).toEqual(['inv-1']);
    expect(store.get('inv-1')!.tier).toBe('PREMIUM');
  });

  it('throws 404 for an unknown invitation', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([]);
    const { repo: payRepo } = makeFakePaymentRepo();
    const { provider } = makeFakeProvider({
      checkoutUrl: 'x',
      sessionId: 'x',
    });
    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
    });

    await expect(service.startCheckout('missing', AUTHOR, 'single')).rejects.toMatchObject(
      { name: 'PaymentServiceError', status: 404 },
    );
  });

  it("throws 403 for another author's invitation", async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([
      makeInvitation({ authorId: 'someone-else' }),
    ]);
    const { repo: payRepo, created } = makeFakePaymentRepo();
    const { provider, createCheckout } = makeFakeProvider({
      checkoutUrl: 'x',
      sessionId: 'x',
    });
    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
    });

    await expect(service.startCheckout('inv-1', AUTHOR, 'single')).rejects.toBeInstanceOf(
      AuthError,
    );
    // No side effects on failure.
    expect(createCheckout).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it('throws 409 when the invitation is not a DRAFT', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([
      makeInvitation({ status: 'ACTIVE' }),
    ]);
    const { repo: payRepo, created } = makeFakePaymentRepo();
    const { provider, createCheckout } = makeFakeProvider({
      checkoutUrl: 'x',
      sessionId: 'x',
    });
    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
    });

    await expect(service.startCheckout('inv-1', AUTHOR, 'single')).rejects.toMatchObject({
      name: 'PaymentServiceError',
      status: 409,
      code: 'not_draft',
    });
    expect(createCheckout).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
});

/** Build a PENDING payment row for an invitation awaiting payment. */
function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    invitationId: 'inv-1',
    authorId: AUTHOR,
    plan: 'SINGLE',
    provider: 'mock',
    sessionId: 'sess_1',
    externalId: null,
    status: 'PENDING',
    amount: PLAN_AMOUNTS.single,
    currency: 'KGS',
    tier: 'PREMIUM',
    createdAt: new Date(),
    paidAt: null,
    ...overrides,
  };
}

describe('PaymentService.handleWebhook', () => {
  it('activates the invitation and marks the payment SUCCEEDED on success (Property 1)', async () => {
    const { repo: invRepo, store } = makeFakeInvitationRepo([
      makeInvitation({ status: 'PENDING_PAYMENT' }),
    ]);
    const { repo: payRepo, store: payStore } = makeFakePaymentRepo([makePayment()]);
    const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
    const { service: activation, activated } = makeFakeActivationService();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      invitationService: activation,
    });

    const result = await service.handleWebhook({
      sessionId: 'sess_1',
      status: 'succeeded',
    });

    expect(result).toMatchObject({
      status: 'activated',
      invitationId: 'inv-1',
      token: 'tok-inv-1',
    });
    // Payment recorded SUCCEEDED, invitation activated exactly once.
    expect(payStore.get('sess_1')!.status).toBe('SUCCEEDED');
    expect(activated).toEqual(['inv-1']);
    // The invitation we kept in the store still exists (activation delegated).
    expect(store.get('inv-1')).toBeDefined();
  });

  it('extends the subscription for 30 days when a MONTHLY payment succeeds', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([
      makeInvitation({ status: 'PENDING_PAYMENT' }),
    ]);
    const { repo: payRepo } = makeFakePaymentRepo([makePayment({ plan: 'MONTHLY' })]);
    const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
    const { service: activation, activated } = makeFakeActivationService();
    const subs = makeFakeSubscriptionRepo();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      subscriptionRepo: subs.repo,
      invitationService: activation,
    });

    const result = await service.handleWebhook({
      sessionId: 'sess_1',
      status: 'succeeded',
      externalId: 'trx-1',
    });

    expect(result).toMatchObject({ status: 'activated', invitationId: 'inv-1' });
    expect(subs.extended).toEqual([{ authorId: AUTHOR, days: 30 }]);
    expect(activated).toEqual(['inv-1']);
  });

  it('reports "subscribed" for a subscription payment without an invitation', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([]);
    const { repo: payRepo } = makeFakePaymentRepo([
      makePayment({ plan: 'MONTHLY', invitationId: null }),
    ]);
    const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
    const { service: activation, activated } = makeFakeActivationService();
    const subs = makeFakeSubscriptionRepo();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      subscriptionRepo: subs.repo,
      invitationService: activation,
    });

    const result = await service.handleWebhook({
      sessionId: 'sess_1',
      status: 'succeeded',
    });

    expect(result.status).toBe('subscribed');
    expect(subs.extended).toHaveLength(1);
    expect(activated).toEqual([]);
  });

  it('keeps the draft and marks the payment FAILED on a failed/cancelled payment (Requirement 3.4)', async () => {
    const { repo: invRepo, store } = makeFakeInvitationRepo([
      makeInvitation({ status: 'PENDING_PAYMENT' }),
    ]);
    const { repo: payRepo, store: payStore } = makeFakePaymentRepo([makePayment()]);
    const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
    const { service: activation, activated } = makeFakeActivationService();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      invitationService: activation,
    });

    const result = await service.handleWebhook({
      sessionId: 'sess_1',
      status: 'failed',
    });

    expect(result).toMatchObject({ status: 'failed', invitationId: 'inv-1' });
    expect(payStore.get('sess_1')!.status).toBe('FAILED');
    // Draft preserved so the author can retry; never activated.
    expect(store.get('inv-1')!.status).toBe('DRAFT');
    expect(activated).toEqual([]);
  });

  it('ignores an unknown session id without side effects', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([
      makeInvitation({ status: 'PENDING_PAYMENT' }),
    ]);
    const { repo: payRepo } = makeFakePaymentRepo([]);
    const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
    const { service: activation, activated } = makeFakeActivationService();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      invitationService: activation,
    });

    const result = await service.handleWebhook({
      sessionId: 'never-seen',
      status: 'succeeded',
    });

    expect(result).toEqual({ status: 'ignored', reason: 'unknown_session' });
    expect(activated).toEqual([]);
  });

  it('is idempotent: a re-delivered success event does not activate twice (Property 2)', async () => {
    const { repo: invRepo } = makeFakeInvitationRepo([
      makeInvitation({ status: 'PENDING_PAYMENT' }),
    ]);
    const { repo: payRepo, store: payStore } = makeFakePaymentRepo([makePayment()]);
    const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
    const { service: activation, activated } = makeFakeActivationService();

    const service = buildService({
      provider,
      invitationRepo: invRepo,
      paymentRepo: payRepo,
      invitationService: activation,
    });

    const first = await service.handleWebhook({
      sessionId: 'sess_1',
      status: 'succeeded',
    });
    const second = await service.handleWebhook({
      sessionId: 'sess_1',
      status: 'succeeded',
    });

    expect(first.status).toBe('activated');
    expect(second).toEqual({ status: 'duplicate', paymentStatus: 'SUCCEEDED' });
    // Activated exactly once despite two deliveries.
    expect(activated).toEqual(['inv-1']);
    expect(payStore.get('sess_1')!.status).toBe('SUCCEEDED');
  });
});

/**
 * Property-based tests for the webhook invariants (fast-check).
 *
 * **Validates: Requirements 3.2, 3.3**
 */
describe('PaymentService.handleWebhook — properties', () => {
  // Property 1: activation only ever follows a SUCCEEDED payment.
  // For any sequence of webhook deliveries, an invitation is activated iff at
  // least one 'succeeded' event was processed; a payment that only ever sees
  // 'failed' events is never activated.
  it('Property 1: activation happens only after a successful payment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<'succeeded' | 'failed'>('succeeded', 'failed'), {
          minLength: 1,
          maxLength: 6,
        }),
        async (statuses) => {
          const { repo: invRepo } = makeFakeInvitationRepo([
            makeInvitation({ status: 'PENDING_PAYMENT' }),
          ]);
          const { repo: payRepo, store: payStore } = makeFakePaymentRepo([
            makePayment(),
          ]);
          const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
          const { service: activation, activated } = makeFakeActivationService();

          const service = buildService({
            provider,
            invitationRepo: invRepo,
            paymentRepo: payRepo,
            invitationService: activation,
          });

          for (const status of statuses) {
            await service.handleWebhook({ sessionId: 'sess_1', status });
          }

          // The first event is the only one that takes effect (payment leaves
          // PENDING after it); subsequent events are idempotent no-ops.
          const firstStatus = statuses[0];
          if (firstStatus === 'succeeded') {
            // Activated exactly once; payment SUCCEEDED.
            expect(activated).toEqual(['inv-1']);
            expect(payStore.get('sess_1')!.status).toBe('SUCCEEDED');
          } else {
            // Never activated; payment FAILED.
            expect(activated).toEqual([]);
            expect(payStore.get('sess_1')!.status).toBe('FAILED');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Property 2: idempotency by sessionId. No matter how many times the same
  // event is re-delivered, the payment reaches exactly one terminal state, the
  // invitation is activated at most once, and no second payment is created.
  it('Property 2: re-delivery with the same sessionId never activates twice or creates a second payment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'succeeded' | 'failed'>('succeeded', 'failed'),
        fc.integer({ min: 1, max: 8 }),
        async (status, deliveries) => {
          const { repo: invRepo } = makeFakeInvitationRepo([
            makeInvitation({ status: 'PENDING_PAYMENT' }),
          ]);
          const { repo: payRepo, store: payStore, created } = makeFakePaymentRepo([
            makePayment(),
          ]);
          const { provider } = makeFakeProvider({ checkoutUrl: 'x', sessionId: 'x' });
          const { service: activation, activated } = makeFakeActivationService();

          const service = buildService({
            provider,
            invitationRepo: invRepo,
            paymentRepo: payRepo,
            invitationService: activation,
          });

          const results = [];
          for (let i = 0; i < deliveries; i += 1) {
            results.push(
              await service.handleWebhook({ sessionId: 'sess_1', status }),
            );
          }

          // Exactly one delivery had a non-idempotent effect; the rest are
          // duplicates.
          const effective = results.filter((r) => r.status !== 'duplicate');
          expect(effective).toHaveLength(1);

          // No second payment row was ever created (still the seeded one).
          expect(created).toHaveLength(1);
          expect([...payStore.values()]).toHaveLength(1);

          // Activation happened at most once, and only for success.
          if (status === 'succeeded') {
            expect(activated).toEqual(['inv-1']);
            expect(payStore.get('sess_1')!.status).toBe('SUCCEEDED');
          } else {
            expect(activated).toEqual([]);
            expect(payStore.get('sess_1')!.status).toBe('FAILED');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
