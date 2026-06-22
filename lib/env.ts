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

export const env = {
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  nodeEnv: optional('NODE_ENV', 'development'),
  databaseUrl: optional('DATABASE_URL'),
  sessionSecret: optional('SESSION_SECRET'),

  payment: {
    provider: optional('PAYMENT_PROVIDER', 'mock'),
    apiKey: optional('PAYMENT_API_KEY'),
    webhookSecret: optional('PAYMENT_WEBHOOK_SECRET'),
  },

  telegram: {
    botToken: optional('TELEGRAM_BOT_TOKEN'),
    webhookSecret: optional('TELEGRAM_WEBHOOK_SECRET'),
    /** Bot username (without @) used to build t.me deep-links for linking. */
    botUsername: optional('TELEGRAM_BOT_USERNAME'),
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
