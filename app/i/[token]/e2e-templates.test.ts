/**
 * Task 11.1 — сквозное (E2E) прохождение всех трёх шаблонов на мобильном
 * вьюпорте (~390px): создание → оплата (mock-вебхук) → прохождение сценария →
 * ответ → уведомление автору (запись в `notification_outbox`).
 *
 * ## Выбор подхода (важно — задокументировано осознанно)
 *
 * Полноценный браузерный E2E (Playwright/Cypress) в проекте **недоступен**: ни
 * Playwright, ни иной браузерный раннер не объявлены в `package.json`/не
 * установлены, а единственный тестовый раннер — vitest в окружении `node`
 * (см. `vitest.config.ts`). Поднимать тяжёлые браузерные зависимости и реальный
 * Postgres ради одного теста на этом этапе нецелесообразно.
 *
 * Поэтому «E2E» здесь реализован как **сквозной интеграционный тест на уровне
 * домена** — он прогоняет весь реальный конвейер через настоящие сервисы и
 * движок, без моков бизнес-логики:
 *
 *   createDraft → checkout (MockPaymentProvider) → webhook(succeeded) →
 *   activate → getByToken → recordOpen → ScenarioEngine идёт по экранам схемы →
 *   buildResponse → recordResponse → запись в notification_outbox.
 *
 * Доступ к данным — те же in-memory репозитории и pass-through-транзакция, что
 * и в остальных сервисных тестах (`lib/services/*.test.ts`), так что
 * транзакционность outbox (Property 8) и идемпотентность соблюдаются без
 * реальной БД. Используются НАСТОЯЩИЕ `InvitationService`, `PaymentService`,
 * `NotificationService`, `ScenarioEngine`, `templateRegistry` и
 * `MockPaymentProvider` — мокируется только инфраструктура хранения.
 *
 * ## Мобильный вьюпорт (~390px) и мессенджеры
 *
 * Визуальная часть mobile-first (анимации переходов, mute по умолчанию,
 * OG-превью во встроенных браузерах Telegram/WhatsApp/Instagram — Требование
 * 5.2) проверяется **вручную** перед запуском, как прямо предписывает
 * design.md → Testing Strategy → «Ручная проверка (обязательно для MVP)». Здесь
 * мы программно покрываем логику, которая определяет мобильное поведение:
 *  - геометрию убегающей кнопки «Нет» в контейнере шириной 390px (RunawayButton),
 *  - корректное прохождение сценария всех трёх шаблонов до финала,
 *  - повторное открытие после ответа → финал «уже отвечено» (Требование 5.7).
 *
 * **Validates: Requirements 5.2** (а также сквозь весь путь: 3.2/3.3, 5.5, 6.2,
 * 6.3, 7.x, 8.x, 9.1/9.2).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Invitation,
  NotificationOutbox,
  OpenEvent,
  Payment,
  PaymentStatus,
  Prisma,
  Response as ResponseRow,
  Tier,
} from '@prisma/client';

import { templateRegistry } from '@/lib/templates/registry';
import { SINGLE_GUEST_KEY } from '@/lib/repositories/responses';
import {
  InvitationService,
  type InvitationRepo,
  type OpenEventRepo,
  type ResponseRepo,
} from '@/lib/services/invitation';
import {
  NotificationService,
  type NotificationOutboxRepo,
} from '@/lib/services/notification';
import {
  PaymentService,
  type PaymentInvitationRepo,
  type PaymentServicePaymentRepo,
} from '@/lib/services/payment';
import { MockPaymentProvider } from '@/lib/payments/provider';
import { ScenarioEngine } from '@/lib/scenario/engine';
import {
  initialRunawayState,
  registerRunawayAttempt,
  RUNAWAY_ATTEMPT_LIMIT,
  type ContainerBox,
  type RunawayState,
} from '@/app/i/[token]/runtime/runaway';
import type { GuestResponse } from '@/templates/types';

const AUTHOR = 'author-e2e';
/** Мобильный вьюпорт мессенджера: типичные ~390px по ширине (iPhone-класс). */
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/* ------------------------------------------------------------------ */
/* In-memory репозитории (тот же паттерн, что в lib/services/*.test.ts) */
/* ------------------------------------------------------------------ */

/** Хранилище приглашений + invitation/payment repo поверх одного Map. */
function makeStores() {
  const invitations = new Map<string, Invitation>();
  const payments = new Map<string, Payment>(); // ключ = sessionId
  let invSeq = 0;
  let paySeq = 0;

  const invitationRepo: InvitationRepo & PaymentInvitationRepo = {
    create: async (input) => {
      const now = new Date();
      const invitation: Invitation = {
        id: `inv-${++invSeq}`,
        authorId: input.authorId,
        templateId: input.templateId,
        themeId: input.themeId,
        tier: (input.tier ?? 'BASIC') as Tier,
        status: input.status ?? 'DRAFT',
        data: (input.data ?? {}) as Invitation['data'],
        token: null,
        expiresAt: input.expiresAt ?? null,
        oneTimeView: input.oneTimeView ?? false,
        createdAt: now,
        activatedAt: null,
      };
      invitations.set(invitation.id, invitation);
      return invitation;
    },
    update: async (id, data) => {
      const existing = invitations.get(id);
      if (!existing) throw new Error(`no invitation ${id}`);
      const updated: Invitation = {
        ...existing,
        ...(data as Partial<Invitation>),
      };
      invitations.set(id, updated);
      return updated;
    },
    findById: async (id) => invitations.get(id) ?? null,
    findByToken: async (token) =>
      [...invitations.values()].find((i) => i.token === token) ?? null,
    findByAuthor: async (authorId) =>
      [...invitations.values()].filter((i) => i.authorId === authorId),
    setTokenAndActivate: async (id, token, activatedAt = new Date()) => {
      const existing = invitations.get(id);
      if (!existing) throw new Error(`no invitation ${id}`);
      const updated: Invitation = {
        ...existing,
        token,
        status: 'ACTIVE',
        activatedAt,
      };
      invitations.set(id, updated);
      return updated;
    },
  };

  const paymentRepo: PaymentServicePaymentRepo = {
    create: async (input) => {
      const payment: Payment = {
        id: `pay-${++paySeq}`,
        invitationId: input.invitationId,
        provider: input.provider,
        sessionId: input.sessionId,
        status: (input.status ?? 'PENDING') as PaymentStatus,
        amount: input.amount,
        tier: input.tier,
        createdAt: new Date(),
      };
      payments.set(payment.sessionId, payment);
      return payment;
    },
    findBySessionId: async (sessionId) => payments.get(sessionId) ?? null,
    updateStatus: async (sessionId, status) => {
      const existing = payments.get(sessionId);
      if (!existing) throw new Error(`no payment ${sessionId}`);
      const updated: Payment = { ...existing, status };
      payments.set(sessionId, updated);
      return updated;
    },
  };

  return { invitations, payments, invitationRepo, paymentRepo };
}

/** In-memory response repo, воспроизводит upsert по (invitationId, guestKey). */
function makeResponseRepo() {
  const store = new Map<string, ResponseRow>();
  let seq = 0;
  const keyOf = (invitationId: string, guestKey?: string | null) =>
    `${invitationId}::${
      guestKey == null || guestKey === '' ? SINGLE_GUEST_KEY : guestKey
    }`;

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

/** In-memory outbox repo, копит все записанные уведомления. */
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

/* ------------------------------------------------------------------ */
/* Сборка полностью «живого» стенда (реальные сервисы + mock-провайдер) */
/* ------------------------------------------------------------------ */

function makeHarness() {
  const { invitations, payments, invitationRepo, paymentRepo } = makeStores();
  const { repo: responseRepo, store: responseStore } = makeResponseRepo();
  const { repo: openEventRepo, events: openEvents } = makeOpenEventRepo();
  const { repo: outboxRepo, rows: outboxRows } = makeOutboxRepo();

  // Настоящий NotificationService (outbox-enqueue) поверх in-memory outbox.
  const notifications = new NotificationService({
    registry: templateRegistry,
    outboxRepo,
  });

  // Настоящий InvitationService: домен-событие пишет outbox в той же
  // pass-through транзакции (Property 8).
  const invitationService = new InvitationService({
    registry: templateRegistry,
    repo: invitationRepo,
    responseRepo,
    openEventRepo,
    onDomainEvent: (event, tx) => notifications.handleDomainEvent(event, tx),
    runTransaction: (fn) => fn({} as Prisma.TransactionClient),
  });

  // Настоящий PaymentService с настоящим MockPaymentProvider (без эквайринга).
  const provider = new MockPaymentProvider({ appUrl: 'http://localhost:3000' });
  const paymentService = new PaymentService({
    provider,
    invitationRepo,
    paymentRepo,
    invitationService,
  });

  return {
    invitations,
    payments,
    responseStore,
    openEvents,
    outboxRows,
    provider,
    invitationService,
    paymentService,
  };
}

type Harness = ReturnType<typeof makeHarness>;

/**
 * Прогон общего «головного» участка пути для любого шаблона: создание черновика
 * → checkout через mock-провайдер → успешный вебхук → активация → публичная
 * выдача по токену → запись первого открытия. Возвращает токен и публичную
 * проекцию для дальнейшего прохождения сценария.
 */
async function createPayActivateOpen(
  h: Harness,
  templateId: string,
  themeId: string,
  data: Record<string, unknown>,
) {
  // 1. Создание черновика автором.
  const draft = await h.invitationService.createDraft(
    AUTHOR,
    templateId,
    themeId,
    data,
  );
  expect(draft.status).toBe('DRAFT');

  // 2. Инициирование оплаты (checkout) — провайдер выдаёт sessionId/URL.
  const checkoutUrl = await h.paymentService.startCheckout(
    draft.id,
    AUTHOR,
    'premium',
  );
  expect(checkoutUrl).toContain('/mock-checkout/');
  const payment = [...h.payments.values()].find(
    (p) => p.invitationId === draft.id,
  )!;
  expect(payment.status).toBe('PENDING');
  expect(h.invitations.get(draft.id)!.status).toBe('PENDING_PAYMENT');

  // 3. Mock-вебхук об успешной оплате → активация (Требование 3.2/3.3).
  const result = await h.paymentService.handleWebhook({
    sessionId: payment.sessionId,
    status: 'succeeded',
  });
  expect(result.status).toBe('activated');
  if (result.status !== 'activated') throw new Error('not activated');
  const token = result.token;
  expect(h.invitations.get(draft.id)!.status).toBe('ACTIVE');

  // 4. Адресат открывает ссылку — публичная проекция (без приватных данных).
  const pub = await h.invitationService.getByToken(token);
  expect(pub.alreadyResponded).toBe(false);

  // 5. Первое открытие фиксируется → уведомление автору «открыли» (Треб. 9.1).
  const open = await h.invitationService.recordOpen(token, 'TelegramBot/Mobile');
  expect(open.firstOpen).toBe(true);

  return { draftId: draft.id, token, pub };
}

let h: Harness;

beforeEach(() => {
  h = makeHarness();
});

describe('E2E (mobile ~390px) — Шаблон 1 «simple-date»', () => {
  it('создание → оплата → согласие через RunawayButton → уведомление', async () => {
    const data = {
      имя_адресата: 'Айя',
      текст_приглашения: 'Пойдём на свидание?',
      подпись: 'Тимур',
    };
    const { token, pub } = await createPayActivateOpen(
      h,
      'simple-date',
      'romantic',
      data,
    );

    // --- Прохождение сценария движком по реальной схеме шаблона. ---
    const engine = new ScenarioEngine(
      templateRegistry.get(pub.templateId),
    );
    expect(engine.current.id).toBe('intro');
    // intro → invite
    expect(engine.dispatch('click:open')).toBe(true);
    expect(engine.current.id).toBe('invite');

    // Кнопка «Нет» убегает в контейнере мобильной ширины (~390px). Проверяем
    // лимит попыток (Требование 6.2/6.3) на той же чистой логике, что и UI.
    const box: ContainerBox = {
      containerWidth: MOBILE_VIEWPORT.width,
      containerHeight: 320,
      buttonWidth: 96,
      buttonHeight: 48,
    };
    let runaway: RunawayState = initialRunawayState();
    let rng = 0;
    for (let i = 0; i < RUNAWAY_ATTEMPT_LIMIT; i += 1) {
      runaway = registerRunawayAttempt(runaway, box, () => (rng += 0.13) % 1);
      // Кнопка не выходит за пределы мобильного контейнера.
      expect(runaway.position.x).toBeLessThanOrEqual(
        box.containerWidth - box.buttonWidth,
      );
      expect(runaway.position.y).toBeLessThanOrEqual(
        box.containerHeight - box.buttonHeight,
      );
    }
    // После лимита «Нет» скрыта, «Да» подросла (Требование 6.3).
    expect(runaway.noHidden).toBe(true);
    expect(runaway.yesScale).toBeGreaterThan(1);

    // Адресат жмёт «Да» → финал согласия.
    expect(engine.dispatch('click:yes')).toBe(true);
    expect(engine.isFinal()).toBe(true);

    const response = engine.buildResponse();
    expect(response.type).toBe('accepted');

    // --- Ответ сохраняется + уведомление автору (Требование 9.2). ---
    const recorded = await h.invitationService.recordResponse(token, response);
    expect(recorded.updated).toBe(false);

    const accepted = h.outboxRows.find((r) => r.type === 'accepted');
    expect(accepted).toBeDefined();
    expect((accepted!.payload as { message: string }).message).toBe(
      '🎉 Айя согласилась!',
    );

    // Open-уведомление тоже записано (ровно одно на первое открытие).
    expect(h.outboxRows.filter((r) => r.type === 'opened')).toHaveLength(1);

    // --- Повторное открытие после ответа → финал «уже отвечено» (Треб. 5.7). ---
    const repeat = await h.invitationService.getByToken(token);
    expect(repeat.alreadyResponded).toBe(true);
  });
});

describe('E2E (mobile ~390px) — Шаблон 2 «story-fork»', () => {
  it('создание → оплата → ветка согласия с выбором места/времени → уведомление', async () => {
    const data = {
      имя_адресата: 'Аиша',
      вступительный_текст: 'У меня есть план на вечер...',
      подпись: 'Дамир',
      список_мест: [
        { название: 'Кофейня', описание: 'Уютно' },
        { название: 'Парк' },
        { название: 'Кино' },
      ],
    };
    const { token, pub } = await createPayActivateOpen(
      h,
      'story-fork',
      'playful',
      data,
    );

    const engine = new ScenarioEngine(templateRegistry.get(pub.templateId));
    expect(engine.current.id).toBe('screen-1');

    // Ветка «передумала»: «Нет, спасибо» → «реально отказала?» → «Нет» → место.
    expect(engine.dispatch('click:no')).toBe(true);
    expect(engine.current.id).toBe('screen-2');
    expect(engine.dispatch('click:no')).toBe(true); // «Нет» — не отказываюсь
    expect(engine.current.id).toBe('screen-4');

    // Выбор места из карточек автора (Требование 7.5).
    expect(engine.dispatch('select:place', { выбранное_место: 'Парк' })).toBe(
      true,
    );
    expect(engine.current.id).toBe('screen-5');

    // Выбор времени (Требование 7.7).
    expect(
      engine.dispatch('select:time', { выбранное_время: 'Суббота, 18:00' }),
    ).toBe(true);
    expect(engine.current.id).toBe('screen-6');
    expect(engine.isFinal()).toBe(true);

    const response = engine.buildResponse();
    expect(response).toMatchObject({
      type: 'accepted',
      place: 'Парк',
      time: 'Суббота, 18:00',
    });

    const recorded = await h.invitationService.recordResponse(token, response);
    expect(recorded.updated).toBe(false);

    const accepted = h.outboxRows.find((r) => r.type === 'accepted');
    expect(accepted).toBeDefined();
    expect((accepted!.payload as { message: string }).message).toBe(
      '🎉 Аиша согласилась! Место: Парк, время: Суббота, 18:00.',
    );

    // Повторное открытие после ответа → финал «уже отвечено».
    const repeat = await h.invitationService.getByToken(token);
    expect(repeat.alreadyResponded).toBe(true);
  });

  it('ветка отказа: подтверждённый отказ → уведомление «пока отказалась»', async () => {
    const data = {
      имя_адресата: 'Аиша',
      вступительный_текст: 'У меня есть план на вечер...',
      подпись: 'Дамир',
      список_мест: [{ название: 'Парк' }],
    };
    const { token, pub } = await createPayActivateOpen(
      h,
      'story-fork',
      'romantic',
      data,
    );

    const engine = new ScenarioEngine(templateRegistry.get(pub.templateId));
    expect(engine.dispatch('click:no')).toBe(true); // screen-1 → screen-2
    expect(engine.dispatch('click:yes')).toBe(true); // подтверждаю отказ → screen-3
    expect(engine.current.id).toBe('screen-3');
    expect(engine.isFinal()).toBe(true);

    const response = engine.buildResponse();
    expect(response.type).toBe('declined');

    await h.invitationService.recordResponse(token, response);
    const declined = h.outboxRows.find((r) => r.type === 'declined');
    expect(declined).toBeDefined();
    expect((declined!.payload as { message: string }).message).toBe(
      'Аиша пока отказалась.',
    );
  });
});

describe('E2E (mobile ~390px) — Шаблон 3 «event-rsvp»', () => {
  it('создание → оплата → RSVP «Приду» (+гости) → уведомление; повторный RSVP обновляет', async () => {
    const data = {
      название_события: 'День рождения',
      дата: '2025-12-31T18:00:00.000Z',
      время: '18:00',
      место: 'Лофт «Небо»',
      адрес: 'ул. Абая 1',
      текст_приглашения: 'Приходи отпраздновать!',
      сбор_числа_гостей: true,
    };
    const { token, pub } = await createPayActivateOpen(
      h,
      'event-rsvp',
      'festive',
      data,
    );

    const engine = new ScenarioEngine(templateRegistry.get(pub.templateId));
    expect(engine.current.id).toBe('screen-1');
    expect(engine.dispatch('click:open')).toBe(true); // → детали
    expect(engine.current.id).toBe('screen-2');
    expect(engine.dispatch('click:rsvp')).toBe(true); // детали → форма RSVP
    expect(engine.current.id).toBe('screen-3');
    // Гость заполняет RSVP и подтверждает (Требование 8.3).
    expect(
      engine.dispatch('submit:rsvp', {
        имя_гостя: 'Мадина',
        статус_rsvp: 'yes',
        число_гостей: 2,
      }),
    ).toBe(true);
    expect(engine.current.id).toBe('screen-4');
    expect(engine.isFinal()).toBe(true);

    // RSVP — многогостевой шаблон: ответ идёт под стабильным per-guest ключом.
    const response: GuestResponse = {
      ...engine.buildResponse(),
      guestName: 'Мадина',
      guestKey: 'guest-madina',
      rsvp: 'yes',
      guests: 2,
    };
    expect(response.type).toBe('rsvp');

    const first = await h.invitationService.recordResponse(token, response);
    expect(first.updated).toBe(false);

    const rsvp = h.outboxRows.find((r) => r.type === 'rsvp');
    expect(rsvp).toBeDefined();
    expect((rsvp!.payload as { message: string }).message).toBe(
      'Мадина: Приду (+2).',
    );

    // Повторный RSVP того же гостя обновляет запись, не дублирует (Треб. 8.5).
    const second = await h.invitationService.recordResponse(token, {
      ...response,
      rsvp: 'no',
      guests: 0,
    });
    expect(second.updated).toBe(true);
    expect(h.responseStore.size).toBe(1);
  });
});
