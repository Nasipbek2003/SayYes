/**
 * Tests for {@link InvitationService.recordOpen} / `recordResponse` (task 7.4).
 *
 * These exercise the *domain* behaviour with an injected in-memory repository
 * and the real in-code {@link templateRegistry}, so real template validation
 * runs without Prisma/Postgres:
 *
 *  - **recordOpen**: appends an open event and reports `firstOpen` only on the
 *    very first open (Requirement 9.1); unavailable links surface as
 *    {@link InvitationUnavailableError} (Requirement 4.4).
 *  - **recordResponse**: rejects schema-invalid answers before persisting
 *    (Property 5 / Requirement 5.5) and upserts idempotently by
 *    `(invitationId, guestKey)` (Property 3 / Requirement 8.5) — a repeat answer
 *    updates the single stored row instead of duplicating it.
 *
 * A property-based test (fast-check) asserts the idempotency invariant across
 * arbitrary sequences of answers for the same guest key.
 *
 * **Validates: Requirements 5.5, 5.7, 8.5**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type { Invitation, OpenEvent, Response as ResponseRow } from '@prisma/client';

import { templateRegistry } from '@/lib/templates/registry';
import { SINGLE_GUEST_KEY } from '@/lib/repositories/responses';
import {
  InvitationService,
  InvitationUnavailableError,
  ResponseValidationError,
  type DomainEvent,
  type InvitationRepo,
  type OpenEventRepo,
  type ResponseRepo,
} from './invitation';

const AUTHOR = 'author-1';
const TOKEN = 'tok123456789';

/** In-memory invitation repo seeded with a single ACTIVE invitation. */
function makeInvitationRepo(invitation: Invitation): InvitationRepo {
  const store = new Map<string, Invitation>([[invitation.id, invitation]]);
  return {
    create: async () => {
      throw new Error('not used');
    },
    update: async (id, data) => {
      const existing = store.get(id)!;
      const updated = { ...existing, ...(data as Partial<Invitation>) };
      store.set(id, updated);
      return updated;
    },
    findById: async (id) => store.get(id) ?? null,
    findByToken: async (token) =>
      [...store.values()].find((i) => i.token === token) ?? null,
    findByAuthor: async (authorId) =>
      [...store.values()].filter((i) => i.authorId === authorId),
    setTokenAndActivate: async (id, token) => {
      const existing = store.get(id)!;
      const updated = { ...existing, token, status: 'ACTIVE' as const };
      store.set(id, updated);
      return updated;
    },
  };
}

/**
 * In-memory response repo faithfully reproducing the `(invitationId, guestKey)`
 * upsert semantics (null guestKey folds to the single-guest sentinel).
 */
function makeResponseRepo() {
  const store = new Map<string, ResponseRow>();
  let seq = 0;
  const keyOf = (invitationId: string, guestKey?: string | null) =>
    `${invitationId}::${guestKey == null || guestKey === '' ? SINGLE_GUEST_KEY : guestKey}`;

  const repo: ResponseRepo = {
    findByInvitation: async (invitationId) =>
      [...store.values()].filter((r) => r.invitationId === invitationId),
    findByGuestKey: async (invitationId, guestKey) =>
      store.get(keyOf(invitationId, guestKey)) ?? null,
    countByInvitation: async (invitationId) =>
      [...store.values()].filter((r) => r.invitationId === invitationId).length,
    upsertResponse: async (input) => {
      const k = keyOf(input.invitationId, input.guestKey);
      const existing = store.get(k);
      const row = {
        id: existing?.id ?? `r${++seq}`,
        invitationId: input.invitationId,
        guestName: input.guestName ?? null,
        guestKey:
          input.guestKey == null || input.guestKey === ''
            ? SINGLE_GUEST_KEY
            : input.guestKey,
        outcome: input.outcome,
        createdAt: existing?.createdAt ?? new Date(),
      } as ResponseRow;
      store.set(k, row);
      return row;
    },
  };
  return { repo, store };
}

/** In-memory open-event repo. */
function makeOpenEventRepo() {
  const events: OpenEvent[] = [];
  let seq = 0;
  const repo: OpenEventRepo = {
    create: async (input) => {
      const ev = {
        id: `o${++seq}`,
        invitationId: input.invitationId,
        userAgent: input.userAgent ?? null,
        openedAt: new Date(),
      } as OpenEvent;
      events.push(ev);
      return ev;
    },
    countByInvitation: async (invitationId) =>
      events.filter((e) => e.invitationId === invitationId).length,
    findByInvitation: async (invitationId) =>
      events.filter((e) => e.invitationId === invitationId),
  };
  return { repo, events };
}

function activeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    authorId: AUTHOR,
    templateId: 'story-fork',
    themeId: 'romantic',
    tier: 'BASIC',
    status: 'ACTIVE',
    data: { список_мест: [{ название: 'Парк' }, { название: 'Кафе' }] },
    token: TOKEN,
    expiresAt: null,
    oneTimeView: false,
    createdAt: new Date(),
    activatedAt: new Date(),
    ...overrides,
  } as Invitation;
}

function buildService(
  invitation: Invitation,
  onDomainEvent?: (e: DomainEvent, tx: unknown) => void | Promise<void>,
) {
  const invRepo = makeInvitationRepo(invitation);
  const { repo: respRepo, store: respStore } = makeResponseRepo();
  const { repo: openRepo, events } = makeOpenEventRepo();
  const service = new InvitationService({
    registry: templateRegistry,
    repo: invRepo,
    responseRepo: respRepo,
    openEventRepo: openRepo,
    onDomainEvent,
    // Pass-through "transaction": hands the in-memory repos a dummy client they
    // ignore, so recordOpen/recordResponse exercise their logic without a real
    // database while keeping the same single-transaction shape (Property 8).
    runTransaction: (fn) => fn({} as never),
  });
  return { service, respStore, events };
}

describe('recordOpen (Requirement 9.1)', () => {
  it('reports firstOpen=true only on the first open', async () => {
    const { service, events } = buildService(activeInvitation());

    const first = await service.recordOpen(TOKEN, 'UA-1');
    const second = await service.recordOpen(TOKEN, 'UA-2');

    expect(first.firstOpen).toBe(true);
    expect(second.firstOpen).toBe(false);
    expect(events).toHaveLength(2);
  });

  it('throws not_found for an unknown token (Req 4.4)', async () => {
    const { service } = buildService(activeInvitation());
    await expect(service.recordOpen('nope')).rejects.toBeInstanceOf(
      InvitationUnavailableError,
    );
  });

  it('throws expired for a past expiry (Req 4.4 / 11.2)', async () => {
    const { service } = buildService(
      activeInvitation({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.recordOpen(TOKEN)).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('fires the domain-event hook on open', async () => {
    const hook = vi.fn();
    const { service } = buildService(activeInvitation(), hook);
    await service.recordOpen(TOKEN);
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'open', firstOpen: true }),
      expect.anything(),
    );
  });
});

describe('recordResponse — server validation (Property 5, Req 5.5)', () => {
  it('rejects a place that is not in the author list without persisting', async () => {
    const { service, respStore } = buildService(activeInvitation());

    await expect(
      service.recordResponse(TOKEN, { type: 'accepted', place: 'Марс' }),
    ).rejects.toBeInstanceOf(ResponseValidationError);

    expect(respStore.size).toBe(0);
  });

  it('rejects an outcome type the template never emits', async () => {
    const { service, respStore } = buildService(activeInvitation());

    await expect(
      service.recordResponse(TOKEN, { type: 'rsvp', guestName: 'X', rsvp: 'yes' }),
    ).rejects.toBeInstanceOf(ResponseValidationError);
    expect(respStore.size).toBe(0);
  });

  it('accepts a valid place from the author list', async () => {
    const { service, respStore } = buildService(activeInvitation());

    const result = await service.recordResponse(TOKEN, {
      type: 'accepted',
      place: 'Парк',
    });

    expect(result.updated).toBe(false);
    expect(respStore.size).toBe(1);
  });
});

describe('recordResponse — idempotency (Property 3, Req 8.5)', () => {
  it('a repeat answer for the same guest updates the single row', async () => {
    const { service, respStore } = buildService(activeInvitation());

    const first = await service.recordResponse(TOKEN, {
      type: 'accepted',
      place: 'Парк',
    });
    const second = await service.recordResponse(TOKEN, {
      type: 'accepted',
      place: 'Кафе',
    });

    expect(first.updated).toBe(false);
    expect(second.updated).toBe(true);
    expect(respStore.size).toBe(1);
    expect(second.response.id).toBe(first.response.id);
    expect(second.response.outcome).toMatchObject({ place: 'Кафе' });
  });

  it('distinct RSVP guests get their own rows', async () => {
    const inv = activeInvitation({
      templateId: 'event-rsvp',
      data: {},
    });
    const { service, respStore } = buildService(inv);

    await service.recordResponse(TOKEN, {
      type: 'rsvp',
      guestName: 'Аиша',
      guestKey: 'guest-a',
      rsvp: 'yes',
    });
    await service.recordResponse(TOKEN, {
      type: 'rsvp',
      guestName: 'Боря',
      guestKey: 'guest-b',
      rsvp: 'no',
    });
    // Same guest again → update, not insert.
    await service.recordResponse(TOKEN, {
      type: 'rsvp',
      guestName: 'Аиша',
      guestKey: 'guest-a',
      rsvp: 'no',
    });

    expect(respStore.size).toBe(2);
  });
});

describe('recordResponse — idempotency property (Property 3)', () => {
  it('any sequence of answers for one guest yields exactly one row', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 1..10 answers, each choosing one of the author's two places.
        fc.array(fc.constantFrom('Парк', 'Кафе'), { minLength: 1, maxLength: 10 }),
        async (places) => {
          const { service, respStore } = buildService(activeInvitation());

          let lastId: string | undefined;
          for (let i = 0; i < places.length; i += 1) {
            const result = await service.recordResponse(TOKEN, {
              type: 'accepted',
              place: places[i],
            });
            // First call creates, every subsequent one updates.
            expect(result.updated).toBe(i > 0);
            if (lastId !== undefined) {
              expect(result.response.id).toBe(lastId);
            }
            lastId = result.response.id;
          }

          // Invariant: at most one row for the single guest key, holding the
          // most recent choice.
          expect(respStore.size).toBe(1);
          const [row] = [...respStore.values()];
          expect(row.outcome).toMatchObject({ place: places[places.length - 1] });
        },
      ),
      { numRuns: 50 },
    );
  });
});
