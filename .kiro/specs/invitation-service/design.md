# Design Document

## Overview

Сервис сайтов-приглашений — это веб-приложение, где автор за пару минут создаёт персональную интерактивную ссылку-приглашение, оплачивает её и отправляет адресату. Адресат проходит mobile-first сценарий с анимациями и отвечает прямо внутри ссылки, а автор получает уведомление в Telegram.

Дизайн нацелен на MVP: 3 шаблона, форма ввода данных, оплата (базовый/премиум), генерация ссылки с Open Graph превью, уведомления в Telegram, кабинет автора. Ключевая архитектурная идея — **движок сценариев, управляемый данными (data-driven)**: каждый шаблон описывается декларативной схемой экранов и развилок, а универсальный рантайм-движок отрисовывает её. Это позволяет добавлять/менять шаблоны без переписывания логики и закладывает фундамент под будущий конструктор (Фаза 2–4).

### Технологический стек

- **Frontend / SSR:** Next.js (App Router, React 18, TypeScript). SSR/Route Handlers нужны для Open Graph превью и динамического рендера страницы приглашения.
- **Backend:** Node.js. API реализуется через Next.js Route Handlers (`app/api/*`) — единый деплой, меньше инфраструктуры на MVP. Тяжёлые/фоновые задачи (доставка уведомлений с ретраями) выносятся в очередь.
- **БД:** PostgreSQL через Prisma ORM (типобезопасность, миграции).
- **Хранилище файлов:** S3-совместимое объектное хранилище (фото авторов) с выдачей по подписанным URL.
- **Анимации:** Framer Motion (переходы экранов, парящие сердечки), canvas-confetti (конфетти).
- **Платежи:** абстрагированный платёжный провайдер за интерфейсом `PaymentProvider` (в MVP — один провайдер, напр. Stripe/локальный эквайринг; вебхук подтверждает оплату).
- **Уведомления:** Telegram Bot API через сервис уведомлений с очередью и ретраями.
- **Аутентификация автора:** сессии/JWT; вход через email-magic-link или Telegram-login на MVP.
- **Стейт сценария на клиенте:** локальный конечный автомат (state machine) поверх схемы шаблона.

### Допущения и решения
- Один деплой Next.js (frontend + API) ускоряет MVP; при росте нагрузки сервис уведомлений и платёжные вебхуки можно вынести отдельно.
- Очередь уведомлений на MVP может быть реализована таблицей `notification_outbox` + воркер (outbox pattern), без отдельного брокера — это упрощает инфраструктуру и даёт ретраи «из коробки».
- Прохождение сценария адресатом **не требует авторизации** (публичная ссылка); доступ к данным ограничен токеном в URL.

---

## Architecture

### Контекст системы

```
┌──────────────┐        ┌─────────────────────────────────────┐        ┌───────────────┐
│   Автор      │        │         Next.js приложение          │        │   Адресат     │
│ (браузер)    │◄──────►│  ┌───────────────────────────────┐  │◄──────►│  (мессенджер/ │
└──────────────┘        │  │  Web (React, App Router, SSR) │  │        │   браузер)    │
                        │  └───────────────────────────────┘  │        └───────────────┘
                        │  ┌───────────────────────────────┐  │
                        │  │  API (Route Handlers / Node)  │  │
                        │  └───────────────────────────────┘  │
                        └───┬─────────┬──────────┬─────────────┘
                            │         │          │
                  ┌─────────▼──┐ ┌────▼─────┐ ┌──▼──────────┐
                  │ PostgreSQL │ │  S3 файлы│ │ Notification│
                  │ (Prisma)   │ │  (фото)  │ │   Outbox    │
                  └────────────┘ └──────────┘ └──┬──────────┘
                                                  │ воркер (ретраи)
                                          ┌───────▼─────────┐   ┌──────────────┐
                                          │ Payment Provider │   │ Telegram Bot │
                                          │   (вебхук)       │   │     API      │
                                          └──────────────────┘   └──────────────┘
```

### Слои приложения

1. **Presentation (React-компоненты):**
   - Публичные страницы автора: галерея, форма создания, предпросмотр, оплата, кабинет.
   - Страница приглашения адресата `/i/[token]` — SSR для Open Graph + клиентский рантайм-движок сценария.
2. **Application / API (Route Handlers):**
   - Создание/редактирование приглашений, загрузка фото, инициирование оплаты, приём вебхуков, приём ответов адресата, регистрация событий открытия.
3. **Domain (сервисы):**
   - `TemplateRegistry`, `InvitationService`, `ScenarioEngine` (валидация ответов на сервере), `PaymentService`, `NotificationService`, `ResponseService`.
4. **Infrastructure:**
   - Prisma-репозитории, S3-клиент, Telegram-клиент, платёжный адаптер, outbox-воркер.

### Поток создания приглашения

```
Автор → выбор шаблона → форма данных (черновик авто-сохраняется)
      → предпросмотр → выбор тарифа → оплата (provider)
providers webhook → InvitationService.activate() → генерация token+OG
      → ссылка отдана автору
```

### Поток прохождения сценария адресатом

```
GET /i/[token] (SSR) → отдаёт OG-метаданные + HTML
  → клиент: экран загрузки → ScenarioEngine стартует по schema
  → событие "открыто" → POST /api/i/[token]/open → outbox → автору "открыли"
  → адресат идёт по экранам (развилки на клиенте)
  → финальный ответ → POST /api/i/[token]/respond
        → сервер валидирует против schema → сохраняет Response
        → outbox → автору детали ответа
  → финальный экран
```

---

## Components and Interfaces

### 1. Template Registry и схема шаблона (data-driven движок)

Каждый шаблон — декларативная схема: список экранов, элементы, переходы/развилки, какие поля вводит автор, какие события уходят автору. Движок на клиенте интерпретирует схему; сервер использует ту же схему для валидации ответа.

```typescript
// Тип данных, которые вводит автор (поля формы шаблона)
interface TemplateField {
  key: string;                 // e.g. "имя_адресата"
  label: string;
  type: 'text' | 'longtext' | 'image' | 'placesList' | 'datetime' | 'boolean';
  required: boolean;
  maxLength?: number;
}

// Экран сценария
interface ScreenSchema {
  id: string;                  // "screen-1"
  kind: 'intro' | 'invite' | 'fork' | 'placePicker' | 'timePicker'
      | 'rsvp' | 'eventDetails' | 'final';
  elements: ScreenElement[];   // тексты, кнопки, картинки (могут ссылаться на {{переменные}})
  transitions: Transition[];   // куда вести по действию
  emits?: AuthorEvent[];       // какие события уходят автору на этом экране
}

interface Transition {
  on: string;                  // действие: "click:yes", "select:place", "submit:rsvp"
  to: string;                  // id целевого экрана
}

interface AuthorEvent {
  type: 'opened' | 'accepted' | 'declined' | 'rsvp';
  // шаблон текста уведомления с подстановкой ответа
  messageTemplate: string;
}

interface TemplateSchema {
  id: string;                  // "simple-date" | "story-fork" | "event-rsvp"
  name: string;
  description: string;
  themes: ThemeId[];           // 2-3 цветовые темы
  fields: TemplateField[];     // что вводит автор
  startScreen: string;
  screens: ScreenSchema[];
  premiumFeatures: string[];   // что включает премиум
}
```

```typescript
interface TemplateRegistry {
  list(): TemplateSummary[];                 // для галереи
  get(id: string): TemplateSchema;
  validateAuthorData(id: string, data: Record<string, unknown>): ValidationResult;
  // Валидация ответа адресата против схемы (на сервере)
  validateResponse(id: string, response: GuestResponse): ValidationResult;
}
```

В MVP схемы трёх шаблонов хранятся в коде (`/templates/*.ts`), что упрощает разработку. Модель данных в БД уже спроектирована так, чтобы позже схемы можно было перенести в таблицу `templates` без изменения рантайма.

### 2. Scenario Engine (клиентский рантайм)

Конечный автомат, который ведёт адресата по `screens` согласно `transitions`.

```typescript
interface ScenarioEngine {
  current: ScreenSchema;
  context: GuestContext;                 // накопленные ответы (выбранное место/время и т.п.)
  dispatch(action: string, payload?: unknown): void;  // двигает по transitions
  isFinal(): boolean;
  buildResponse(): GuestResponse;        // финальный ответ для отправки на сервер
}
```

- Рендер экрана — компонент `<ScreenRenderer screen kind>`, который мапит `kind` на React-компонент (`IntroScreen`, `InviteScreen`, `ForkScreen`, `PlacePicker`, `TimePicker`, `RsvpScreen`, `EventDetails`, `FinalScreen`).
- Спец-поведения как переиспользуемые компоненты: `RunawayButton` (убегающая «Нет»), `Confetti`, `FloatingHearts`, `Countdown`.
- Переходы экранов — Framer Motion `AnimatePresence`.

### 3. Специальные интерактивные элементы

- **RunawayButton** (Требование 6): при попытке тапа/наведения смещается в случайную точку в пределах контейнера и уменьшается; счётчик попыток; по достижении лимита (4–5) скрывается. Кнопка «Да» получает коэффициент роста от того же счётчика. На тач-устройствах реагирует на `touchstart`/`pointerdown` до срабатывания клика.
- **Confetti / FloatingHearts:** запускаются на экранах согласия/финала.
- **Countdown:** обратный отсчёт до `{{дата}}` события (Шаблон 3), обновляется на клиенте.

### 4. Invitation Service (API)

```typescript
interface InvitationService {
  createDraft(authorId: string, templateId: string, data: AuthorData): Invitation;
  updateDraft(invitationId: string, data: Partial<AuthorData>): Invitation;
  preview(invitationId: string): PreviewPayload;
  activate(invitationId: string): { token: string; url: string }; // после оплаты
  getByToken(token: string): PublicInvitation; // для рендера адресату (без приватных данных автора)
  recordOpen(token: string): void;
  recordResponse(token: string, response: GuestResponse): void;
}
```

- `getByToken` отдаёт только то, что нужно для рендера сценария (тексты, фото, список мест), без email/телефона автора.
- `recordResponse` идемпотентен: повторный ответ того же гостя обновляет запись (Требование 8.5), повторное открытие после ответа не перезапускает сценарий (Требование 5.7).

### 5. Route Handlers (HTTP API)

| Метод | Путь | Назначение | Авторизация |
|------|------|-----------|-------------|
| GET | `/api/templates` | Галерея шаблонов | — |
| POST | `/api/invitations` | Создать черновик | автор |
| PATCH | `/api/invitations/:id` | Обновить черновик (авто-сейв) | автор |
| POST | `/api/invitations/:id/photo` | Загрузка фото (подписанный URL) | автор |
| GET | `/api/invitations/:id/preview` | Предпросмотр | автор |
| POST | `/api/invitations/:id/checkout` | Инициировать оплату | автор |
| POST | `/api/payments/webhook` | Вебхук провайдера → активация | подпись провайдера |
| GET | `/i/[token]` | Страница приглашения (SSR + OG) | публично |
| POST | `/api/i/:token/open` | Событие «открыли» | публично (rate-limited) |
| POST | `/api/i/:token/respond` | Ответ адресата | публично (rate-limited) |
| GET | `/api/me/invitations` | Кабинет: список | автор |
| GET | `/api/me/invitations/:id` | Кабинет: детали + ответы/RSVP | автор |
| POST | `/api/me/telegram/link` | Привязка Telegram | автор |

### 6. Open Graph рендер (Требование 4)

- Страница `/i/[token]` рендерится на сервере и отдаёт `<meta og:title>`, `<og:description>` = `«{{имя_адресата}}, у меня для тебя кое-что есть...»`, `<og:image>`.
- OG-картинка генерируется динамически (`next/og` / `@vercel/og` `ImageResponse`) на основе темы шаблона и фото, либо берётся статичная превью-картинка шаблона.
- `robots: noindex` для приватности (Требование 11.3).

### 7. Payment Service

```typescript
interface PaymentProvider {
  createCheckout(params: CheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }>;
  verifyWebhook(req: Request): Promise<PaymentEvent>; // проверка подписи
}

interface PaymentService {
  startCheckout(invitationId: string, tier: 'basic' | 'premium'): Promise<string>;
  handleWebhook(event: PaymentEvent): Promise<void>; // success → activate(); fail → keep draft
}
```

- Идемпотентная обработка вебхука (по `sessionId`/`eventId`), чтобы повторная доставка не активировала дважды.
- Тариф сохраняется в приглашении и управляет премиум-возможностями и подписью бренда (Требование 3.5/3.6).

### 8. Notification Service (Telegram, outbox + ретраи)

```typescript
interface NotificationService {
  enqueue(event: NotificationEvent): Promise<void>; // пишет в notification_outbox
}

// воркер
interface OutboxWorker {
  processPending(): Promise<void>; // берёт pending, шлёт в Telegram, ретраи с backoff
}
```

- Событие записывается в `notification_outbox` в той же транзакции, что и доменное изменение (open/response) — гарантия, что событие не потеряется.
- Воркер шлёт в Telegram с экспоненциальным backoff; при превышении попыток помечает `failed`, но событие остаётся видимым в кабинете автора (Требование 9.4).
- Если автор не привязал Telegram — события копятся, доставляются после привязки (Требование 9.5).

---

## Data Models

```prisma
model Author {
  id            String   @id @default(cuid())
  email         String?  @unique
  telegramChatId String? @unique
  createdAt     DateTime @default(now())
  invitations   Invitation[]
}

model Invitation {
  id           String   @id @default(cuid())
  authorId     String
  author       Author   @relation(fields: [authorId], references: [id])
  templateId   String                       // "simple-date" | "story-fork" | "event-rsvp"
  themeId      String
  tier         Tier     @default(BASIC)
  status       InvitationStatus @default(DRAFT)
  data         Json                          // {{переменные}} автора (валидируются по схеме)
  token        String?  @unique              // короткий публичный токен (после активации)
  expiresAt    DateTime?                     // срок жизни ссылки (приватность)
  oneTimeView  Boolean  @default(false)
  createdAt    DateTime @default(now())
  activatedAt  DateTime?
  opens        OpenEvent[]
  responses    Response[]
  payment      Payment?
}

enum Tier { BASIC PREMIUM }
enum InvitationStatus { DRAFT PENDING_PAYMENT ACTIVE EXPIRED }

model OpenEvent {
  id           String   @id @default(cuid())
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id])
  openedAt     DateTime @default(now())
  userAgent    String?
}

model Response {
  id           String   @id @default(cuid())
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id])
  guestName    String?                       // для RSVP (Шаблон 3)
  guestKey     String?                       // идемпотентность повторного ответа гостя
  outcome      Json                          // { type, place?, time?, rsvp?, guests? }
  createdAt    DateTime @default(now())
  @@unique([invitationId, guestKey])         // повторный ответ обновляет, не дублирует
}

model Payment {
  id           String   @id @default(cuid())
  invitationId String   @unique
  invitation   Invitation @relation(fields: [invitationId], references: [id])
  provider     String
  sessionId    String   @unique
  status       PaymentStatus @default(PENDING)
  amount       Int
  tier         Tier
  createdAt    DateTime @default(now())
}

enum PaymentStatus { PENDING SUCCEEDED FAILED }

model NotificationOutbox {
  id           String   @id @default(cuid())
  authorId     String
  invitationId String
  type         String                        // opened | accepted | declined | rsvp
  payload      Json
  status       OutboxStatus @default(PENDING)
  attempts     Int      @default(0)
  lastError    String?
  createdAt    DateTime @default(now())
  sentAt       DateTime?
}

enum OutboxStatus { PENDING SENT FAILED }
```

### Связь моделей и требований
- `Invitation.data` (Json) хранит `{{переменные}}`, валидируемые `TemplateRegistry` по схеме шаблона (Требование 2).
- `Invitation.tier` управляет премиум/подписью бренда (Требование 3.5/3.6).
- `token`, `expiresAt`, `oneTimeView` покрывают ссылку и приватность (Требования 4, 11).
- `Response.@@unique([invitationId, guestKey])` — идемпотентность RSVP (Требование 8.5).
- `NotificationOutbox` — надёжная доставка уведомлений с ретраями (Требование 9).

---

## Error Handling

| Сценарий | Поведение | Требование |
|---------|-----------|-----------|
| Недопустимый/большой файл фото | 400 + понятная ошибка у поля | 2.2 |
| Невалидные/пустые обязательные поля | Ошибка валидации, переход заблокирован | 2.3 |
| Платёж отменён/не прошёл | Черновик сохраняется, можно повторить | 3.4 |
| Двойная доставка вебхука | Идемпотентная обработка по `sessionId` | 3 |
| Истёкшая/недоступная ссылка | Экран «ссылка недоступна» (не 500) | 4.4 |
| Пустой `{{список_мест}}` | Свободное поле «Напиши, куда хочешь» | 7.6 |
| Повторное открытие после ответа | Финальный экран «уже отвечено» | 5.7 |
| Повторный RSVP того же гостя | Обновление записи (upsert по guestKey) | 8.5 |
| Сбой доставки в Telegram | Ретраи с backoff, событие видно в кабинете | 9.4 |
| Автор без привязки Telegram | События копятся, доставка после привязки | 9.5 |
| Доступ к чужому приглашению | 403 (авторизация автора) | 10.4 |

Общие принципы: серверная валидация ответов адресата (нельзя доверять клиенту); rate-limiting на публичных эндпоинтах `open`/`respond`; graceful-экраны для адресата вместо технических ошибок.

---

## Testing Strategy

### Unit
- `TemplateRegistry.validateAuthorData` / `validateResponse` для всех трёх шаблонов (включая edge: пустой список мест, отсутствующие опц. поля).
- `ScenarioEngine`: корректность переходов и развилок (Шаблон 2 — все ветки схемы; Шаблон 1 — лимит попыток «Нет»).
- `PaymentService.handleWebhook`: success → активация, fail → черновик, идемпотентность.
- `NotificationService` / outbox-воркер: ретраи, пометка failed, доставка после привязки Telegram.

### Integration
- Создание черновика → авто-сейв → checkout → webhook → активация → выдача токена/URL.
- `GET /i/[token]`: корректные OG-метаданные и `noindex`; истёкшая ссылка → экран недоступности.
- `respond`: идемпотентность RSVP (повтор обновляет), серверная валидация против схемы.

### Component / E2E (frontend)
- Прохождение каждого шаблона на мобильном вьюпорте (~390px).
- RunawayButton: убегание, уменьшение, лимит, рост «Да» (включая touch).
- Анимации переходов не ломают навигацию; повторное открытие после ответа → финальный экран.

### Ручная проверка (обязательно для MVP)
- Открытие ссылок во встроенных браузерах Telegram / WhatsApp / Instagram (Требование 5.2): анимации, mute по умолчанию, OG-превью при вставке ссылки.

---

## Correctness Properties

Инварианты, которые должны выполняться всегда (основа для property-based и интеграционных тестов):

### Property 1: Активация только после успешной оплаты
`Invitation.status = ACTIVE` ⇒ существует `Payment.status = SUCCEEDED` для этого приглашения. Токен и URL не выдаются для неоплаченных приглашений.

**Validates: Requirements 3.3**

### Property 2: Идемпотентность оплаты
Повторная обработка вебхука с тем же `sessionId` не создаёт второй платёж и не активирует приглашение дважды.

**Validates: Requirements 3.2**

### Property 3: Идемпотентность ответа гостя
Для любого `(invitationId, guestKey)` существует не более одной записи `Response`; повторный ответ обновляет существующую.

**Validates: Requirements 8.5**

### Property 4: Целостность развилок (Шаблон 2)
Любой путь по `transitions` из `startScreen` достижимо завершается экраном `kind = final`; не существует «висячих» переходов на несуществующий `screen.id`.

**Validates: Requirements 7.1**

### Property 5: Серверная валидация ответа
Любой принятый `respond` проходит `validateResponse` против схемы шаблона; ответ, не соответствующий схеме (несуществующее место, неверный тип), отклоняется.

**Validates: Requirements 5.5**

### Property 6: Приватность токена
`getByToken` никогда не возвращает приватные данные автора (email, telegramChatId); страница `/i/[token]` всегда отдаётся с `noindex`.

**Validates: Requirements 11.3**

### Property 7: Срок жизни и одноразовость
Если `expiresAt` в прошлом или `oneTimeView` и просмотр уже завершён — приглашение недоступно адресату.

**Validates: Requirements 11.2**

### Property 8: Сохранность событий
Каждое доменное событие (open/response) порождает ровно одну запись в `notification_outbox` в той же транзакции; событие не теряется при сбое доставки в Telegram.

**Validates: Requirements 9.4**

### Property 9: Согласованность тарифа
`tier = BASIC` ⇒ подпись бренда присутствует; `tier = PREMIUM` ⇒ подпись отсутствует и премиум-возможности включены.

**Validates: Requirements 3.5, 3.6**
