/**
 * Centralized environment variable access.
 *
 * Reads from `process.env` with sensible defaults for local development.
 * Domain modules should import from here rather than touching `process.env`
 * directly, so configuration stays in one place.
 */

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

/**
 * Нормализует PEM из переменной окружения: в `.env` перевод строки обычно не
 * сохраняется, поэтому строку вида `-----BEGIN...\n...` разворачиваем обратно в
 * многострочный PEM.
 *
 * Чтение ключа из файла (`*_KEY_PATH`) делает серверный код — здесь нельзя
 * трогать `node:fs`, потому что этот модуль попадает и в клиентский бандл.
 */
function normalisePem(value: string): string {
  return value.trim().replace(/\\n/g, '\n');
}

/**
 * Parse a Cloudinary connection string of the form
 * `cloudinary://<api_key>:<api_secret>@<cloud_name>` into its parts. Returns
 * null when the value is empty or malformed, so callers can fall back to the
 * discrete `CLOUDINARY_*` variables.
 */
function parseCloudinaryUrl(
  url: string,
): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
  if (!match) return null;
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
}

const cloudinaryParsed = parseCloudinaryUrl(optional('CLOUDINARY_URL'));

export const env = {
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  nodeEnv: optional('NODE_ENV', 'development'),
  databaseUrl: optional('DATABASE_URL'),
  sessionSecret: optional('SESSION_SECRET'),

  payment: {
    /** 'finik' — реальный эквайринг, 'mock' — локальная заглушка. */
    provider: optional('PAYMENT_PROVIDER', 'mock'),
    apiKey: optional('PAYMENT_API_KEY'),
    webhookSecret: optional('PAYMENT_WEBHOOK_SECRET'),
  },

  /**
   * Finik Web SDK (эквайринг, KGS). Приватный ключ подписывает каждый запрос,
   * публичный ключ Finik проверяет подпись вебхуков.
   *
   * `privateKey` можно задать одной строкой с `\n` вместо переводов строк —
   * {@link normalisePem} приводит её к нормальному PEM. Как альтернатива —
   * `FINIK_PRIVATE_KEY_PATH` с путём до файла (удобно локально); файл читает
   * серверный адаптер `lib/payments/finik.ts`.
   */
  finik: {
    baseUrl: optional('FINIK_BASE_URL', 'https://api.acquiring.averspay.kg'),
    /**
     * Путь создания платежа. Документация Finik — `/v1/payment`; кабинет иногда
     * выдаёт другой URL. Путь участвует в подписи, поэтому он настраиваемый.
     */
    paymentPath: optional('FINIK_PAYMENT_PATH', '/v1/payment'),
    apiKey: optional('FINIK_API_KEY'),
    accountId: optional('FINIK_ACCOUNT_ID'),
    /** Имя QR/платежа, которое видит плательщик. */
    qrName: optional('FINIK_QR_NAME', 'SayYes'),
    privateKey: normalisePem(optional('FINIK_PRIVATE_KEY')),
    privateKeyPath: optional('FINIK_PRIVATE_KEY_PATH'),
    webhookPublicKey: normalisePem(optional('FINIK_WEBHOOK_PUBLIC_KEY')),
    webhookPublicKeyPath: optional('FINIK_WEBHOOK_PUBLIC_KEY_PATH'),
  },

  telegram: {
    botToken: optional('TELEGRAM_BOT_TOKEN'),
    webhookSecret: optional('TELEGRAM_WEBHOOK_SECRET'),
    /** Bot username (without @) used to build t.me deep-links for linking. */
    botUsername: optional('TELEGRAM_BOT_USERNAME'),
  },

  /**
   * Cloudinary image storage (author photos). Prefer the single
   * `CLOUDINARY_URL` connection string; discrete `CLOUDINARY_*` vars are a
   * fallback. `uploadFolder` namespaces uploads inside the account.
   */
  cloudinary: {
    cloudName: cloudinaryParsed?.cloudName ?? optional('CLOUDINARY_CLOUD_NAME'),
    apiKey: cloudinaryParsed?.apiKey ?? optional('CLOUDINARY_API_KEY'),
    apiSecret: cloudinaryParsed?.apiSecret ?? optional('CLOUDINARY_API_SECRET'),
    uploadFolder: optional('CLOUDINARY_UPLOAD_FOLDER', 'sayyes'),
  },

  /**
   * Upstash Redis (REST) — optional shared store for rate limiting across
   * serverless instances. When absent, the limiter falls back to a
   * process-local in-memory store (fine for a single long-lived process).
   */
  upstash: {
    restUrl: optional('UPSTASH_REDIS_REST_URL'),
    restToken: optional('UPSTASH_REDIS_REST_TOKEN'),
  },

  /**
   * Product analytics — optional PostHog forwarding for the conversion funnel.
   * When the key is absent, funnel events are still recorded via the structured
   * logger (visible in logs / log drains); PostHog is a bonus, not required.
   */
  analytics: {
    posthogKey: optional('POSTHOG_KEY'),
    posthogHost: optional('POSTHOG_HOST', 'https://us.i.posthog.com'),
  },

  s3: {
    endpoint: optional('S3_ENDPOINT'),
    region: optional('S3_REGION', 'us-east-1'),
    bucket: optional('S3_BUCKET'),
    accessKeyId: optional('S3_ACCESS_KEY_ID'),
    secretAccessKey: optional('S3_SECRET_ACCESS_KEY'),
    publicUrl: optional('S3_PUBLIC_URL'),
  },
} as const;
