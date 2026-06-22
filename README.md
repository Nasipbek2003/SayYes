# SayYes — сервис интерактивных приглашений

Сервис-конструктор, который превращает приглашение (на свидание, праздник, событие) в маленький
интерактивный опыт. Автор выбирает шаблон, вписывает данные, оплачивает и получает уникальную
короткую ссылку. Адресат проходит mobile-first сценарий с анимациями и отвечает прямо внутри ссылки,
а автор получает уведомление в Telegram.

> Это MVP. Сейчас готов каркас проекта (задача 1). Дальнейшая функциональность —
> движок шаблонов, оплата, рантайм сценария, уведомления и кабинет автора — реализуется
> в последующих задачах спецификации.

## Технологический стек

- **Next.js** (App Router, React 18, TypeScript) — SSR/Route Handlers для Open Graph и рантайма
- **Node.js** — API через Next.js Route Handlers
- **PostgreSQL** + **Prisma ORM** — данные и миграции
- **Framer Motion** + **canvas-confetti** — анимации сценария
- ESLint + Prettier — качество кода

## Структура каталогов

```
app/         — страницы и API route handlers (App Router)
lib/         — доменные сервисы и утилиты (prisma-клиент, конфиг окружения)
templates/   — data-driven схемы шаблонов (добавляются в задачах 3.1–3.2)
prisma/      — schema.prisma, миграции, seed
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

   Минимально нужно задать рабочий `DATABASE_URL` (PostgreSQL). Остальные переменные
   (платёжный провайдер, Telegram-бот, S3-хранилище) на этапе каркаса — заглушки.

3. Поднять PostgreSQL (пример через Docker):

   ```bash
   docker run --name sayyes-postgres -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=invitation_service -p 5432:5432 -d postgres:16
   ```

4. Сгенерировать Prisma Client:

   ```bash
   npm run prisma:generate
   ```

   > Модели данных появятся в задаче 2.1. После их добавления примените миграцию:
   > `npm run prisma:migrate`

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
- `PAYMENT_*` — настройки платёжного провайдера (заглушки)
- `TELEGRAM_BOT_TOKEN` — токен Telegram-бота (заглушка)
- `S3_*` — настройки S3-совместимого хранилища для фото (заглушки)
