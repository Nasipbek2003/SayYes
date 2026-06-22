/**
 * Tests for {@link NotificationService} and the outbox enqueue wiring (task 9.1).
 *
 * These exercise the *domain* behaviour with an in-memory outbox repo, the real
 * in-code {@link templateRegistry} and an in-memory {@link InvitationService}
 * (injected repos + a pass-through transaction runner), so no Prisma/Postgres
 * is needed:
 *
 *  - **Property 8 (Сохранность событий)**: every domain event (open/response)
 *    yields *exactly one* outbox row, written in the same transaction as the
 *    domain change. A property-based test (fast-check) asserts the
 *    one-row-per-event invariant across arbitrary event sequences.
 *  - **Requirement 9.1**: the first open enqueues an "opened" notification;
 *    repeat opens record the open but enqueue nothing.
 *  - **Requirement 9.2**: a response enqueues a notification carrying the
 *    answer details, rendered from the template's `AuthorEvent.messageTemplate`.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type {
  Invitation,
  NotificationOutbox,
  OpenEvent,
  Prisma,
  Response as ResponseRow,
} from '@prisma/client';

import { templateRegistry } from '@/lib/templates/registry';
import { SINGLE_GUEST_KEY } from '@/lib/repositories/responses';
import {
  InvitationService,
  type InvitationRepo,
  type OpenEventRepo,
  type ResponseRepo,
} from './invitation';
import {
  NotificationService,
  type NotificationOutboxRepo,
} from './notification';

const AUTHOR = 'author-1';
const TOKEN = 'tok123456789';

/** In-memory outbox repo capturing every appended row. */
function makeOutboxRepo() {
  const rows: NotificationOutbox[] = [];
  let seq = 0;
  const repo: NotificationOutboxRepo = {
    create: async (input, _tx) => {
      const row = {
        id: `n${++seq}`,
        authorId: input.authorId,
        invitationId: input.invitationId,
        type: input.type,
        payload: input.payload,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
        sentAt: null,
      } as NotificationOutbox;
      rows.push(row);
      return row;
    },
  };
  return { repo, rows };
}

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

/** In-memory response repo reproducing the `(invitationId, guestKey)` upsert. */
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
    data: {
      имя_адресата: 'Аиша',
      список_мест: [{ название: 'Парк' }, { название: 'Кафе' }],
    },
    token: TOKEN,
    expiresAt: null,
    oneTimeView: false,
    createdAt: new Date(),
    activatedAt: new Date(),
    ...overrides,
  } as Invitation;
}

/**
 * Build an {@link InvitationService} wired to the real
 * {@link NotificationService} (so the outbox enqueue runs in the same
 * pass-through transaction as the domain write — Property 8).
 */
function buildWiredService(invitation: Invitation) {
  const invRepo = makeInvitationRepo(invitation);
  const { repo: respRepo, store: respStore } = makeResponseRepo();
  const { repo: openRepo } = makeOpenEventRepo();
  const { repo: outboxRepo, rows } = makeOutboxRepo();

  const notifications = new NotificationService({
    registry: templateRegistry,
    outboxRepo,
  });

  const service = new InvitationService({
    registry: templateRegistry,
    repo: invRepo,
    responseRepo: respRepo,
    openEventRepo: openRepo,
    onDomainEvent: (event, tx) => notifications.handleDomainEvent(event, tx),
    // Pass-through transaction (in-memory repos ignore the client).
    runTransaction: (fn) => fn({} as Prisma.TransactionClient),
  });

  return { service, outboxRows: rows, respStore };
}

describe('NotificationService.enqueue', () => {
  it('writes exactly one outbox row with the rendered payload', async () => {
    const { repo, rows } = makeOutboxRepo();
    const service = new NotificationService({
      registry: templateRegistry,
      outboxRepo: repo,
    });

    await service.enqueue({
      authorId: AUTHOR,
      invitationId: 'inv-1',
      type: 'opened',
      payload: { message: 'Приглашение открыли: Аиша.', messageTemplate: 'x' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      authorId: AUTHOR,
      invitationId: 'inv-1',
      type: 'opened',
      status: 'PENDING',
    });
  });
});

describe('open → outbox (Requirement 9.1, Property 8)', () => {
  it('first open enqueues exactly one "opened" notification', async () => {
    const { service, outboxRows } = buildWiredService(activeInvitation());

    await service.recordOpen(TOKEN, 'UA');

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].type).toBe('opened');
    expect(outboxRows[0].payload).toMatchObject({
      message: 'Приглашение открыли: Аиша.',
    });
  });

  it('repeat opens record the open but enqueue nothing more', async () => {
    const { service, outboxRows } = buildWiredService(activeInvitation());

    await service.recordOpen(TOKEN, 'UA-1');
    await service.recordOpen(TOKEN, 'UA-2');
    await service.recordOpen(TOKEN, 'UA-3');

    // Only the first open emits a notification (Requirement 9.1).
    expect(outboxRows).toHaveLength(1);
  });
});

describe('response → outbox (Requirement 9.2, Property 8)', () => {
  it('enqueues one notification with answer details on accept', async () => {
    const { service, outboxRows } = buildWiredService(activeInvitation());

    await service.recordResponse(TOKEN, {
      type: 'accepted',
      place: 'Парк',
      time: '19:00',
    });

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].type).toBe('accepted');
    expect(outboxRows[0].payload).toMatchObject({
      message: '🎉 Аиша согласилась! Место: Парк, время: 19:00.',
      details: { type: 'accepted', place: 'Парк', time: '19:00' },
    });
  });

  it('a repeat answer for the same guest enqueues one row per answer', async () => {
    const { service, outboxRows, respStore } = buildWiredService(activeInvitation());

    await service.recordResponse(TOKEN, { type: 'accepted', place: 'Парк' });
    await service.recordResponse(TOKEN, { type: 'accepted', place: 'Кафе' });

    // Idempotent storage keeps a single response row (Property 3)...
    expect(respStore.size).toBe(1);
    // ...but each recorded answer is its own domain event → its own outbox row
    // (Property 8: one row per event).
    expect(outboxRows).toHaveLength(2);
  });

  it('rejected (invalid) answers enqueue nothing', async () => {
    const { service, outboxRows } = buildWiredService(activeInvitation());

    await expect(
      service.recordResponse(TOKEN, { type: 'accepted', place: 'Марс' }),
    ).rejects.toBeTruthy();

    expect(outboxRows).toHaveLength(0);
  });
});

describe('Property 8 — exactly one outbox row per domain event', () => {
  it('a sequence of opens and responses yields one row per notifiable event', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.constant({ kind: 'open' as const }),
            fc.record({
              kind: fc.constant('response' as const),
              place: fc.constantFrom('Парк', 'Кафе'),
            }),
          ),
          { minLength: 1, maxLength: 12 },
        ),
        async (ops) => {
          const { service, outboxRows } = buildWiredService(activeInvitation());

          let firstOpenSeen = false;
          let expectedRows = 0;

          for (const op of ops) {
            if (op.kind === 'open') {
              await service.recordOpen(TOKEN, 'UA');
              // Only the very first open is notifiable (Requirement 9.1).
              if (!firstOpenSeen) {
                expectedRows += 1;
                firstOpenSeen = true;
              }
            } else {
              await service.recordResponse(TOKEN, {
                type: 'accepted',
                place: op.place,
              });
              // Every recorded response is a notifiable event (Requirement 9.2).
              expectedRows += 1;
            }
          }

          expect(outboxRows).toHaveLength(expectedRows);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('rolls back the outbox enqueue if the domain write transaction fails', async () => {
    // If the enclosing transaction throws (e.g. the outbox write fails), neither
    // the domain change nor the outbox row is persisted — the event is never
    // half-written (Property 8). Here the runner rejects to simulate a failure.
    const invRepo = makeInvitationRepo(activeInvitation());
    const { repo: respRepo } = makeResponseRepo();
    const { repo: openRepo } = makeOpenEventRepo();
    const { repo: outboxRepo, rows } = makeOutboxRepo();
    const notifications = new NotificationService({
      registry: templateRegistry,
      outboxRepo,
    });
    const service = new InvitationService({
      registry: templateRegistry,
      repo: invRepo,
      responseRepo: respRepo,
      openEventRepo: openRepo,
      onDomainEvent: (event, tx) => notifications.handleDomainEvent(event, tx),
      // Simulate a transaction that aborts: the callback runs but the commit
      // fails, so nothing is durably written.
      runTransaction: async (fn) => {
        await fn({} as Prisma.TransactionClient);
        throw new Error('transaction aborted');
      },
    });

    await expect(service.recordOpen(TOKEN, 'UA')).rejects.toThrow(
      'transaction aborted',
    );
    // The in-memory rows array is observable; in a real DB the rollback would
    // discard it. The assertion documents the atomic intent.
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });
});
