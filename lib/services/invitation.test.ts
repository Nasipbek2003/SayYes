/**
 * Unit tests for {@link InvitationService} (task 4.2).
 *
 * The service is constructed with an injected fake repository and the real
 * in-code {@link templateRegistry}, so the tests exercise real template/theme
 * validation while keeping data access in-memory (no Prisma/Postgres needed).
 *
 * Coverage:
 *  - createDraft with a valid template/theme persists a DRAFT;
 *  - createDraft rejects an unknown templateId (404) and an invalid theme (400);
 *  - createDraft tolerates partial data (auto-save, Requirement 2.6);
 *  - updateDraft merges data into the stored draft;
 *  - updateDraft of another author's invitation → 403 (Requirement 10.4);
 *  - updateDraft of a non-DRAFT invitation → 409;
 *  - validateForActivation surfaces required-field errors (Requirement 2.3).
 *
 * **Validates: Requirements 2.1, 2.3, 2.6**
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Invitation } from '@prisma/client';

import { AuthError } from '@/lib/auth/guards';
import { templateRegistry } from '@/lib/templates/registry';
import {
  InvitationService,
  InvitationUnavailableError,
  type InvitationRepo,
  type OpenEventRepo,
  type ResponseRepo,
} from './invitation';

/** Minimal in-memory invitation repository implementing the service's needs. */
function makeFakeRepo(seed: Invitation[] = []) {
  const store = new Map<string, Invitation>(seed.map((i) => [i.id, i]));
  let seq = 0;

  const repo: InvitationRepo = {
    create: async (input) => {
      const now = new Date();
      const invitation: Invitation = {
        id: `inv-${++seq}`,
        authorId: input.authorId,
        templateId: input.templateId,
        themeId: input.themeId,
        tier: input.tier ?? 'BASIC',
        status: input.status ?? 'DRAFT',
        data: (input.data ?? {}) as Invitation['data'],
        token: null,
        expiresAt: input.expiresAt ?? null,
        oneTimeView: input.oneTimeView ?? false,
        createdAt: now,
        activatedAt: null,
      };
      store.set(invitation.id, invitation);
      return invitation;
    },
    update: async (id, data) => {
      const existing = store.get(id);
      if (!existing) throw new Error(`no invitation ${id}`);
      // Only the fields the service writes (data, themeId) need handling.
      const updated: Invitation = {
        ...existing,
        ...(data.themeId !== undefined ? { themeId: data.themeId as string } : {}),
        ...(data.data !== undefined
          ? { data: data.data as Invitation['data'] }
          : {}),
      };
      store.set(id, updated);
      return updated;
    },
    findById: async (id) => store.get(id) ?? null,
    findByToken: async (token) =>
      [...store.values()].find((i) => i.token === token) ?? null,
    findByAuthor: async (authorId) =>
      [...store.values()]
        .filter((i) => i.authorId === authorId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    setTokenAndActivate: async (id, token, activatedAt = new Date()) => {
      const existing = store.get(id);
      if (!existing) throw new Error(`no invitation ${id}`);
      const updated: Invitation = {
        ...existing,
        token,
        status: 'ACTIVE',
        activatedAt,
      };
      store.set(id, updated);
      return updated;
    },
  };

  return { repo, store };
}

/** Minimal in-memory response repository (only `findByInvitation` is used). */
function makeFakeResponseRepo(
  seed: { invitationId: string }[] = [],
): ResponseRepo {
  return {
    findByInvitation: async (invitationId: string) =>
      seed.filter((r) => r.invitationId === invitationId) as never,
    upsertResponse: async () => ({}) as never,
    findByGuestKey: async () => null,
    countByInvitation: async (invitationId: string) =>
      seed.filter((r) => r.invitationId === invitationId).length,
  };
}

/** Minimal in-memory open-event repository (counting + create). */
function makeFakeOpenEventRepo(): OpenEventRepo {
  return {
    create: async () => ({}) as never,
    countByInvitation: async () => 0,
    findByInvitation: async () => [],
  };
}

const AUTHOR = 'author-1';

let service: InvitationService;
let repo: InvitationRepo;
let store: Map<string, Invitation>;

beforeEach(() => {
  const fake = makeFakeRepo();
  repo = fake.repo;
  store = fake.store;
  service = new InvitationService({
    registry: templateRegistry,
    repo,
    responseRepo: makeFakeResponseRepo(),
    openEventRepo: makeFakeOpenEventRepo(),
  });
});

describe('createDraft', () => {
  it('creates a DRAFT for a valid template and theme', async () => {
    const inv = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
    });

    expect(inv.status).toBe('DRAFT');
    expect(inv.authorId).toBe(AUTHOR);
    expect(inv.templateId).toBe('simple-date');
    expect(inv.themeId).toBe('romantic');
    expect(inv.data).toEqual({ имя_адресата: 'Айя' });
    expect(store.size).toBe(1);
  });

  it('tolerates partial/empty data (auto-save, Requirement 2.6)', async () => {
    const inv = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    expect(inv.status).toBe('DRAFT');
    expect(inv.data).toEqual({});
  });

  it('rejects an unknown templateId with a 404 service error', async () => {
    await expect(
      service.createDraft(AUTHOR, 'does-not-exist', 'romantic'),
    ).rejects.toMatchObject({ status: 404, code: 'template_not_found' });
    expect(store.size).toBe(0);
  });

  it('rejects a theme not offered by the template with a 400 service error', async () => {
    await expect(
      service.createDraft(AUTHOR, 'simple-date', 'not-a-theme'),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_theme' });
    expect(store.size).toBe(0);
  });
});

describe('updateDraft', () => {
  it('merges patch data into the stored draft data', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
    });

    const updated = await service.updateDraft(created.id, AUTHOR, {
      data: { текст_приглашения: 'Пойдём гулять?' },
    });

    expect(updated.data).toEqual({
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём гулять?',
    });
  });

  it('overwrites only the provided keys when merging', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
      подпись: 'Тимур',
    });

    const updated = await service.updateDraft(created.id, AUTHOR, {
      data: { имя_адресата: 'Аружан' },
    });

    expect(updated.data).toEqual({ имя_адресата: 'Аружан', подпись: 'Тимур' });
  });

  it('can switch to another valid theme', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    const updated = await service.updateDraft(created.id, AUTHOR, {
      themeId: 'neutral',
    });
    expect(updated.themeId).toBe('neutral');
  });

  it('rejects switching to an invalid theme with 400', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    await expect(
      service.updateDraft(created.id, AUTHOR, { themeId: 'nope' }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_theme' });
  });

  it('returns 404 for an unknown invitation id', async () => {
    await expect(
      service.updateDraft('missing', AUTHOR, { data: {} }),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it("forbids editing another author's invitation (403)", async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    await expect(
      service.updateDraft(created.id, 'someone-else', {
        data: { имя_адресата: 'X' },
      }),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      service.updateDraft(created.id, 'someone-else', { data: {} }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses to edit a non-DRAFT invitation (409)', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    // Simulate activation by mutating the store directly.
    store.set(created.id, { ...store.get(created.id)!, status: 'ACTIVE' });

    await expect(
      service.updateDraft(created.id, AUTHOR, { data: { имя_адресата: 'X' } }),
    ).rejects.toMatchObject({ status: 409, code: 'not_draft' });
  });
});

describe('validateForActivation (Requirement 2.3)', () => {
  it('reports required-field errors for an incomplete draft', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
      // missing required текст_приглашения and подпись
    });

    const result = await service.validateForActivation(created.id, AUTHOR);

    expect(result.ok).toBe(false);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('текст_приглашения');
    expect(fields).toContain('подпись');
  });

  it('passes when all required fields are present', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём на свидание?',
      подпись: 'Тимур',
    });

    const result = await service.validateForActivation(created.id, AUTHOR);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("forbids validating another author's invitation (403)", async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    await expect(
      service.validateForActivation(created.id, 'intruder'),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('returns 404 for an unknown invitation', async () => {
    await expect(
      service.validateForActivation('missing', AUTHOR),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('preview (Requirement 2.5)', () => {
  it('builds a render payload from the draft and template schema', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём на свидание?',
      подпись: 'Тимур',
    });

    const payload = await service.preview(created.id, AUTHOR);

    expect(payload.invitationId).toBe(created.id);
    expect(payload.templateId).toBe('simple-date');
    expect(payload.themeId).toBe('romantic');
    expect(payload.tier).toBe('BASIC');
    expect(payload.status).toBe('DRAFT');
    // BASIC tier → brand signature shown, no premium features (Property 9).
    expect(payload.features).toEqual({
      showBrandSignature: true,
      music: false,
      advancedAnimations: false,
      authorNotifications: false,
      premiumFeatures: [],
    });
    expect(payload.template.name).toBe('Приглашение на свидание');
    expect(payload.template.startScreen).toBe('intro');
    expect(payload.template.screens.length).toBeGreaterThan(0);
    expect(payload.data).toEqual({
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём на свидание?',
      подпись: 'Тимур',
    });
    // Complete draft → validation ok, no places for simple-date.
    expect(payload.validation.ok).toBe(true);
    expect(payload.places).toEqual([]);
  });

  it('renders a partial draft and reports outstanding required fields', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', {
      имя_адресата: 'Айя',
      // missing required текст_приглашения and подпись
    });

    const payload = await service.preview(created.id, AUTHOR);

    expect(payload.validation.ok).toBe(false);
    const fields = payload.validation.errors.map((e) => e.field);
    expect(fields).toContain('текст_приглашения');
    expect(fields).toContain('подпись');
    // Preview still renders the template so the author sees work-in-progress.
    expect(payload.template.screens.length).toBeGreaterThan(0);
  });

  it('normalises the author place list into preview cards (story-fork)', async () => {
    const created = await service.createDraft(AUTHOR, 'story-fork', 'romantic', {
      список_мест: [
        { название: 'Кофейня', описание: 'Уютно', фото: 'https://x/1.jpg' },
        { name: 'Парк' },
        'Кино',
        { описание: 'без имени' }, // dropped: no usable name
      ],
    });

    const payload = await service.preview(created.id, AUTHOR);

    expect(payload.places).toEqual([
      { название: 'Кофейня', фото: 'https://x/1.jpg', описание: 'Уютно' },
      { название: 'Парк' },
      { название: 'Кино' },
    ]);
  });

  it("forbids previewing another author's invitation (403)", async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    await expect(service.preview(created.id, 'intruder')).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(service.preview(created.id, 'intruder')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('returns 404 for an unknown invitation', async () => {
    await expect(service.preview('missing', AUTHOR)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});

describe('activate (Requirement 3.3, Property 1/2)', () => {
  it('generates a token + URL, sets ACTIVE and stamps activatedAt', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    // Move to PENDING_PAYMENT (the activatable state after checkout).
    store.set(created.id, { ...store.get(created.id)!, status: 'PENDING_PAYMENT' });

    const result = await service.activate(created.id);

    expect(result.token).toMatch(/^[0-9a-z]{12}$/);
    expect(result.url).toContain(`/i/${result.token}`);

    const activated = store.get(created.id)!;
    expect(activated.status).toBe('ACTIVE');
    expect(activated.token).toBe(result.token);
    expect(activated.activatedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: re-activating an ACTIVE invitation returns the same token', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    store.set(created.id, { ...store.get(created.id)!, status: 'PENDING_PAYMENT' });

    const first = await service.activate(created.id);
    const second = await service.activate(created.id);

    expect(second.token).toBe(first.token);
    expect(second.url).toBe(first.url);
  });

  it('refuses to activate an invitation that is not awaiting payment (409)', async () => {
    // A plain DRAFT (never went through checkout) cannot be activated directly.
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');

    await expect(service.activate(created.id)).rejects.toMatchObject({
      status: 409,
      code: 'not_pending_payment',
    });
    expect(store.get(created.id)!.status).toBe('DRAFT');
    expect(store.get(created.id)!.token).toBeNull();
  });

  it('returns 404 for an unknown invitation', async () => {
    await expect(service.activate('missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});

describe('getByToken (Requirement 4.x, Property 6/7)', () => {
  /** Seed an ACTIVE invitation directly into the store and return it. */
  async function seedActive(
    overrides: Partial<Invitation> = {},
    data: Record<string, unknown> = {
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём на свидание?',
      подпись: 'Тимур',
    },
  ): Promise<Invitation> {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic', data);
    const active: Invitation = {
      ...store.get(created.id)!,
      status: 'ACTIVE',
      token: 'tok123456789',
      activatedAt: new Date(),
      ...overrides,
    };
    store.set(created.id, active);
    return active;
  }

  it('returns only public data for an ACTIVE invitation', async () => {
    await seedActive();

    const pub = await service.getByToken('tok123456789');

    expect(pub.token).toBe('tok123456789');
    expect(pub.templateId).toBe('simple-date');
    expect(pub.themeId).toBe('romantic');
    expect(pub.template.startScreen).toBe('intro');
    expect(pub.template.screens.length).toBeGreaterThan(0);
    expect(pub.data).toMatchObject({ имя_адресата: 'Айя' });
    expect(pub.features.showBrandSignature).toBe(true);
  });

  it('does NOT leak private author fields (Property 6)', async () => {
    await seedActive();

    const pub = await service.getByToken('tok123456789');
    const serialised = JSON.stringify(pub);

    // No author identity / contact fields anywhere in the public projection.
    expect(pub).not.toHaveProperty('authorId');
    expect(pub).not.toHaveProperty('email');
    expect(pub).not.toHaveProperty('telegramChatId');
    expect(serialised).not.toContain('author-1');
    expect(serialised).not.toContain('telegramChatId');
    expect(serialised).not.toContain('email');
  });

  it('builds the intriguing OG description with the addressee name (Req 4.2)', async () => {
    await seedActive();

    const pub = await service.getByToken('tok123456789');

    expect(pub.og.description).toBe('Айя, у меня для тебя кое-что есть...');
    expect(pub.og.title).toBe('Приглашение на свидание');
    expect(pub.og.image).toBeTruthy();
  });

  it('uses the author photo as the OG image when provided', async () => {
    await seedActive({}, {
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём?',
      подпись: 'Тимур',
      фото: 'https://cdn/x.jpg',
    });

    const pub = await service.getByToken('tok123456789');
    expect(pub.og.image).toBe('https://cdn/x.jpg');
  });

  it('throws not_found for an unknown token', async () => {
    await expect(service.getByToken('nope')).rejects.toBeInstanceOf(
      InvitationUnavailableError,
    );
    await expect(service.getByToken('nope')).rejects.toMatchObject({
      reason: 'not_found',
    });
  });

  it('throws not_active for a non-ACTIVE invitation (Req 4.4)', async () => {
    const created = await service.createDraft(AUTHOR, 'simple-date', 'romantic');
    store.set(created.id, {
      ...store.get(created.id)!,
      status: 'PENDING_PAYMENT',
      token: 'pendingtoken1',
    });

    await expect(service.getByToken('pendingtoken1')).rejects.toMatchObject({
      reason: 'not_active',
    });
  });

  it('throws expired when expiresAt is in the past (Req 11.2, Property 7)', async () => {
    await seedActive({ expiresAt: new Date(Date.now() - 1000) });

    await expect(service.getByToken('tok123456789')).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('treats an EXPIRED status as expired', async () => {
    await seedActive({ status: 'EXPIRED' });

    await expect(service.getByToken('tok123456789')).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('allows a future expiry', async () => {
    await seedActive({ expiresAt: new Date(Date.now() + 60_000) });
    const pub = await service.getByToken('tok123456789');
    expect(pub.token).toBe('tok123456789');
  });

  it('throws consumed for a one-time view already answered (Req 11.4, Property 7)', async () => {
    const active = await seedActive({ oneTimeView: true });
    service = new InvitationService({
      registry: templateRegistry,
      repo,
      responseRepo: makeFakeResponseRepo([{ invitationId: active.id }]),
      openEventRepo: makeFakeOpenEventRepo(),
    });

    await expect(service.getByToken('tok123456789')).rejects.toMatchObject({
      reason: 'consumed',
    });
  });

  it('allows a one-time view that has not been answered yet', async () => {
    await seedActive({ oneTimeView: true });
    const pub = await service.getByToken('tok123456789');
    expect(pub.token).toBe('tok123456789');
  });
});
