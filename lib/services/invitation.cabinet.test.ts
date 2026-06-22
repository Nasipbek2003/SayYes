/**
 * Tests for the author-cabinet reads on {@link InvitationService} (task 10.3):
 *   - listForAuthor      (Requirements 10.1, 10.4)
 *   - getDetailForAuthor (Requirements 10.2, 10.3, 8.6, 10.4)
 *
 * The service is constructed with injected in-memory repositories and the real
 * in-code {@link templateRegistry}, so template-name resolution and the RSVP
 * aggregation run for real without Prisma/Postgres.
 *
 * Coverage:
 *  - the list contains ONLY the requesting author's invitations (Requirement
 *    10.4) with the derived status badge and open/response counts (Req 10.1);
 *  - the detail surfaces the link, opens and responses (Requirement 10.2);
 *  - the event template's detail carries the aggregated RSVP dashboard (Req 8.6);
 *  - reading another author's invitation throws 403, an unknown id throws 404
 *    (Requirement 10.4).
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 8.6**
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Invitation,
  OpenEvent,
  Response as ResponseRow,
} from '@prisma/client';

import { AuthError } from '@/lib/auth/guards';
import { templateRegistry } from '@/lib/templates/registry';
import {
  InvitationService,
  InvitationServiceError,
  type InvitationRepo,
  type OpenEventRepo,
  type ResponseRepo,
} from './invitation';

const AUTHOR = 'author-1';
const OTHER = 'author-2';

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    authorId: AUTHOR,
    templateId: 'simple-date',
    themeId: 'romantic',
    tier: 'BASIC',
    status: 'DRAFT',
    data: {},
    token: null,
    expiresAt: null,
    oneTimeView: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    activatedAt: null,
    ...overrides,
  } as Invitation;
}

function makeInvitationRepo(seed: Invitation[]): InvitationRepo {
  const store = new Map<string, Invitation>(seed.map((i) => [i.id, i]));
  return {
    create: async () => {
      throw new Error('not used');
    },
    update: async () => {
      throw new Error('not used');
    },
    findById: async (id) => store.get(id) ?? null,
    findByToken: async (token) =>
      [...store.values()].find((i) => i.token === token) ?? null,
    findByAuthor: async (authorId) =>
      [...store.values()]
        .filter((i) => i.authorId === authorId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    setTokenAndActivate: async () => {
      throw new Error('not used');
    },
  };
}

function makeResponseRepo(rows: Partial<ResponseRow>[]): ResponseRepo {
  const full = rows.map(
    (r, i) =>
      ({
        id: r.id ?? `r${i}`,
        invitationId: r.invitationId ?? 'inv-1',
        guestName: r.guestName ?? null,
        guestKey: r.guestKey ?? '__single__',
        outcome: r.outcome ?? {},
        createdAt: r.createdAt ?? new Date(),
      }) as ResponseRow,
  );
  return {
    findByInvitation: async (invitationId) =>
      full.filter((r) => r.invitationId === invitationId),
    upsertResponse: async () => ({}) as never,
    findByGuestKey: async () => null,
    countByInvitation: async (invitationId) =>
      full.filter((r) => r.invitationId === invitationId).length,
  };
}

function makeOpenEventRepo(rows: Partial<OpenEvent>[]): OpenEventRepo {
  const full = rows.map(
    (r, i) =>
      ({
        id: r.id ?? `o${i}`,
        invitationId: r.invitationId ?? 'inv-1',
        userAgent: r.userAgent ?? null,
        openedAt: r.openedAt ?? new Date(),
      }) as OpenEvent,
  );
  return {
    create: async () => ({}) as never,
    countByInvitation: async (invitationId) =>
      full.filter((e) => e.invitationId === invitationId).length,
    findByInvitation: async (invitationId) =>
      full.filter((e) => e.invitationId === invitationId),
  };
}

function makeService(deps: {
  invitations: Invitation[];
  responses?: Partial<ResponseRow>[];
  opens?: Partial<OpenEvent>[];
}): InvitationService {
  return new InvitationService({
    registry: templateRegistry,
    repo: makeInvitationRepo(deps.invitations),
    responseRepo: makeResponseRepo(deps.responses ?? []),
    openEventRepo: makeOpenEventRepo(deps.opens ?? []),
  });
}

describe('listForAuthor (Requirements 10.1, 10.4)', () => {
  it('returns only the requesting author\u2019s invitations', async () => {
    const service = makeService({
      invitations: [
        makeInvitation({ id: 'mine-1', authorId: AUTHOR }),
        makeInvitation({ id: 'theirs-1', authorId: OTHER }),
        makeInvitation({ id: 'mine-2', authorId: AUTHOR }),
      ],
    });

    const list = await service.listForAuthor(AUTHOR);

    expect(list.map((i) => i.id).sort()).toEqual(['mine-1', 'mine-2']);
  });

  it('derives the status badge and includes the URL for active invitations', async () => {
    const service = makeService({
      invitations: [
        makeInvitation({ id: 'draft', status: 'DRAFT' }),
        makeInvitation({
          id: 'active',
          status: 'ACTIVE',
          token: 'tok123456789',
        }),
        makeInvitation({
          id: 'answered',
          status: 'ACTIVE',
          token: 'tok987654321',
        }),
      ],
      responses: [{ invitationId: 'answered' }],
    });

    const list = await service.listForAuthor(AUTHOR);
    const byId = Object.fromEntries(list.map((i) => [i.id, i]));

    expect(byId['draft'].cabinetStatus).toBe('draft');
    expect(byId['draft'].url).toBeNull();
    expect(byId['active'].cabinetStatus).toBe('active');
    expect(byId['active'].url).toContain('/i/tok123456789');
    expect(byId['answered'].cabinetStatus).toBe('responded');
    expect(byId['answered'].responses).toBe(1);
  });

  it('marks an expired invitation as expired', async () => {
    const service = makeService({
      invitations: [
        makeInvitation({
          id: 'old',
          status: 'ACTIVE',
          token: 'tokexpired12',
          expiresAt: new Date('2000-01-01T00:00:00Z'),
        }),
      ],
    });

    const [item] = await service.listForAuthor(AUTHOR);
    expect(item.cabinetStatus).toBe('expired');
  });
});

describe('getDetailForAuthor (Requirements 10.2, 10.3, 8.6, 10.4)', () => {
  it('surfaces link, opens and responses for a date template', async () => {
    const service = makeService({
      invitations: [
        makeInvitation({
          id: 'inv-1',
          templateId: 'simple-date',
          status: 'ACTIVE',
          token: 'tok111111111',
        }),
      ],
      opens: [{ invitationId: 'inv-1' }, { invitationId: 'inv-1' }],
      responses: [
        { id: 'r1', invitationId: 'inv-1', outcome: { type: 'accepted' } },
      ],
    });

    const detail = await service.getDetailForAuthor('inv-1', AUTHOR);

    expect(detail.url).toContain('/i/tok111111111');
    expect(detail.openCount).toBe(2);
    expect(detail.responses).toHaveLength(1);
    expect(detail.responses[0].outcome).toMatchObject({ type: 'accepted' });
    // No RSVP dashboard for a non-event template.
    expect(detail.rsvp).toBeNull();
  });

  it('builds the RSVP dashboard for the event template (Req 8.6)', async () => {
    const service = makeService({
      invitations: [
        makeInvitation({
          id: 'evt',
          templateId: 'event-rsvp',
          status: 'ACTIVE',
          token: 'tokevent1234',
        }),
      ],
      responses: [
        {
          id: 'r1',
          invitationId: 'evt',
          guestName: 'Аиша',
          outcome: { type: 'rsvp', rsvp: 'yes', guests: 2 },
        },
        {
          id: 'r2',
          invitationId: 'evt',
          guestName: 'Бек',
          outcome: { type: 'rsvp', rsvp: 'no' },
        },
        {
          id: 'r3',
          invitationId: 'evt',
          guestName: 'Дана',
          outcome: { type: 'rsvp', rsvp: 'yes' },
        },
      ],
    });

    const detail = await service.getDetailForAuthor('evt', AUTHOR);

    expect(detail.rsvp).not.toBeNull();
    expect(detail.rsvp).toMatchObject({
      coming: 2,
      notComing: 1,
      totalPeople: 3,
      totalResponses: 3,
    });
    expect(detail.rsvp!.guests).toHaveLength(3);
  });

  it('throws 403 when reading another author\u2019s invitation (Req 10.4)', async () => {
    const service = makeService({
      invitations: [makeInvitation({ id: 'inv-1', authorId: OTHER })],
    });

    await expect(service.getDetailForAuthor('inv-1', AUTHOR)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('throws 404 for an unknown invitation', async () => {
    const service = makeService({ invitations: [] });

    await expect(
      service.getDetailForAuthor('missing', AUTHOR),
    ).rejects.toMatchObject({
      constructor: InvitationServiceError,
      status: 404,
    });
  });
});
