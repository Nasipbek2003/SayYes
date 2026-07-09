# SayYes — сервис интерактивных приглашений

Сервис-конструктор, который превращает приглашение (на свидание, праздник, событие) в маленький
интерактивный опыт. Автор выбирает шаблон, вписывает данные, оплачивает и получает уникальную
короткую ссылку. Адресат проходит mobile-first сценарий с анимациями и отвечает прямо внутри ссылки,
а автор получает уведомление в Telegram.

> Статус: MVP реализован. Готовы движок шаблонов, галерея и форма создания, оплата
> (mock-провайдер за абстракцией `PaymentProvider`), рантайм сценария с анимациями,
> загрузка фото в Cloudinary, уведомления автору в Telegram (outbox + ретраи) и кабинет
> автора. Покрыто юнит/интеграционными тестами (Vitest) и e2e (Playwright).

## Возможности

- **Движок шаблонов (data-driven):** каждый шаблон — декларативная схема экранов и развилок;
  один рантайм отрисовывает любой шаблон. В комплекте — набор шаблонов в `templates/`.
- **Создание приглашения:** галерея → форма (поля из схемы) → живое превью → оплата → ссылка.
- **Загрузка фото:** подписанная серверная загрузка в Cloudinary (`/api/invitations/:id/photo`).
- **Оплата и тарифы:** абстракция `PaymentProvider` (MVP — mock), базовый/премиум, подпись бренда.
- **Ссылка + Open Graph:** короткий токен, SSR-страница `/i/[token]`, интригующее превью, `noindex`.
- **Рантайм сценария:** mobile-first, Framer Motion, конфетти; уважает `prefers-reduced-motion`.
- **Уведомления автору:** Telegram-бот через outbox с ретраями; мгновенная доставка + крон-фолбэк.
- **Кабинет автора:** список приглашений, открытия, ответы, RSVP-дашборд.
- **Rate-limiting:** публичные `open`/`respond` защищены; общий стор через Upstash Redis (опц.).
- **i18n:** ru + ky (Кыргызстан).

## Технологический стек

- **Next.js** (App Router, React 18, TypeScript) — SSR/Route Handlers для Open Graph и рантайма
- **Node.js** — API через Next.js Route Handlers
- **PostgreSQL** + **Prisma ORM** — данные и миграции
- **Cloudinary** — хранилище пользовательских фото
- **Telegram Bot API** — уведомления автору (outbox pattern)
- **Upstash Redis** (опционально) — общий стор для rate-limiting на serverless
- **Framer Motion** + **canvas-confetti** — анимации сценария
- **Vitest** + **Playwright** — юнит/интеграционные и e2e тесты
- ESLint + Prettier — качество кода

## Структура каталогов

```
app/         — страницы и API route handlers (App Router)
  app/i/[token]/  — публичная страница приглашения + клиентский рантайм сценария
  app/create/     — форма создания приглашения
  app/me/         — кабинет автора
  app/api/        — route handlers (invitations, payments, telegram, cron, ...)
lib/         — доменные сервисы и утилиты
  lib/services/     — доменные сервисы (invitation, payment, notification, tier)
  lib/templates/    — TemplateRegistry и валидация
  lib/scenario/     — ScenarioEngine (конечный автомат)
  lib/storage/      — Cloudinary (загрузка фото)
  lib/rate-limit/   — rate-limiting (in-memory + Upstash Redis)
  lib/notifications/— Telegram outbox + воркер
templates/   — data-driven схемы шаблонов
prisma/      — schema.prisma, миграции, seed
e2e/         — Playwright end-to-end тесты
```

## Требования к окружению

- Node.js 18+ (рекомендуется LTS; проверено на Node 23)
- PostgreSQL 14+ (локально или в Docker)

## Быстрый старт

1. Установить зависимости:

   ```bash
   npm install
   ```

2. Создать файл окружения из шаблона и заполнить значения:

   ```bash
   cp .env.example .env
   ```

   Минимально нужно задать рабочий `DATABASE_URL` (PostgreSQL). Для загрузки фото задайте
   `CLOUDINARY_URL`, для уведомлений — `TELEGRAM_BOT_TOKEN`. Платёжный провайдер по умолчанию
   `mock`. `UPSTASH_REDIS_REST_URL/TOKEN` опциональны (общий rate-limit на serverless).

3. Поднять PostgreSQL (пример через Docker):

   ```bash
   docker run --name sayyes-postgres -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=invitation_service -p 5432:5432 -d postgres:16
   ```

4. Сгенерировать Prisma Client:

   ```bash
   npm run prisma:generate
   ```

   Затем примените миграции к своей базе:

   ```bash
   npm run prisma:migrate
   ```

5. Запустить dev-сервер:

   ```bash
   npm run dev
   ```

   Приложение откроется на http://localhost:3000

## Полезные скрипты

| Команда                   | Назначение                         |
| ------------------------- | ---------------------------------- |
| `npm run dev`             | Запуск dev-сервера                 |
| `npm run build`           | Продакшен-сборка                   |
| `npm run start`           | Запуск собранного приложения       |
| `npm run lint`            | Проверка ESLint                    |
| `npm run format`          | Форматирование Prettier            |
| `npm run format:check`    | Проверка форматирования            |
| `npm run prisma:generate` | Генерация Prisma Client            |
| `npm run prisma:migrate`  | Создание/применение миграции (dev) |
| `npm run prisma:deploy`   | Применение миграций (prod)         |
| `npm run prisma:studio`   | Prisma Studio (просмотр БД)        |
| `npm run db:seed`         | Заполнение БД сид-данными          |

## Переменные окружения

Все переменные описаны в [`.env.example`](./.env.example):

- `DATABASE_URL` — строка подключения к PostgreSQL
- `SESSION_SECRET` — секрет для сессий/JWT
- `PAYMENT_*` — настройки платёжного провайдера (MVP: `mock`)
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_BOT_USERNAME` — Telegram-бот
- `CLOUDINARY_URL` — хранилище фото (`cloudinary://<key>:<secret>@<cloud>`)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — общий rate-limit стор (опционально)
- `RESEND_API_KEY` / `MAIL_FROM` — доставка magic-link писем (иначе печатается в консоль)
- `CRON_SECRET` — защита `/api/cron/*`
- `S3_*` — устаревшее, заменено Cloudinary
