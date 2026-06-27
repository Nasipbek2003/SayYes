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
 *  - the selected tier ('basic' | 'premium') is recorded on both the invitation
 *    and the payment with the right amount (Requirement 3.1);
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
import type { Invitation, Payment } from '@prisma/client';

import { AuthError } from '@/lib/auth/guards';
import type { CheckoutResult, PaymentProvider } from '@/lib/payments/provider';
import {
  PaymentService,
  PaymentServiceError,
  TIER_AMOUNTS,
  type PaymentActivationService,
  type PaymentInvitationRepo,
  type PaymentServicePaymentRepo,
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
        invitationId: input.invitationId,
        provider: input.provider,
        sessionId: input.sessionId,
        status: input.status ?? 'PENDING',
        amount: input.amount,
        tier: input.tier,
        createdAt: new Date(),
      };
      created.push(payment);
      store.set(payment.sessionId, payment);
      return payment;
    },
    findBySessionId: async (sessionId) => store.get(sessionId) ?? null,
    updateStatus: async (sessionId, status) => {
      const existing = store.get(sessionId);
      if (!existing) throw new Error(`no payment ${sessionId}`);
      const updated: Payment = { ...existing, status };
      store.set(sessionId, updated);
      return updated;
    },
  };
  return { repo, created, store };
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
  invitationService?: PaymentActivationService;
}): PaymentService {
  return new PaymentService({
    provider: deps.provider,
    invitationRepo: deps.invitationRepo,
    paymentRepo: deps.paymentRepo,
    invitationService:
      deps.invitationService ?? makeFakeActivationService().service,
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

    const url = await service.startCheckout('inv-1', AUTHOR, 'basic');

    expect(url).toBe('https://pay.example/sess_1');
    expect(createCheckout).toHaveBeenCalledWith({
      invitationId: 'inv-1',
      tier: 'BASIC',
      amount: TIER_AMOUNTS.basic,
    });

    // PENDING payment persisted with the provider session id.
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      invitationId: 'inv-1',
      provider: 'mock',
      sessionId: 'sess_1',
      status: 'PENDING',
      amount: TIER_AMOUNTS.basic,
      tier: 'BASIC',
    });

    // Invitation moved to PENDING_PAYMENT with the chosen tier.
    const updated = store.get('inv-1')!;
    expect(updated.status).toBe('PENDING_PAYMENT');
    expect(updated.tier).toBe('BASIC');
  });

  it('records the premium tier and its amount when premium is selected', async () => {
    const { repo: invRepo, store } = makeFakeInvitationRepo([makeInvitation()]);
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

    await service.startCheckout('inv-1', AUTHOR, 'premium');

    expect(created[0]).toMatchObject({
      tier: 'PREMIUM',
      amount: TIER_AMOUNTS.premium,
    });
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

    await expect(service.startCheckout('missing', AUTHOR, 'basic')).rejects.toMatchObject(
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

    await expect(service.startCheckout('inv-1', AUTHOR, 'basic')).rejects.toBeInstanceOf(
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

    await expect(service.startCheckout('inv-1', AUTHOR, 'basic')).rejects.toMatchObject({
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
    provider: 'mock',
    sessionId: 'sess_1',
    status: 'PENDING',
    amount: TIER_AMOUNTS.basic,
    tier: 'BASIC',
    createdAt: new Date(),
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
