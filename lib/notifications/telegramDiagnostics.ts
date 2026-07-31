/**
 * Диагностика Telegram-бота для админ-панели.
 *
 * Самая частая причина «уведомления не приходят» — не код, а конфигурация:
 * Telegram доставляет апдейты только на один зарегистрированный URL, и если он
 * указывает на умерший туннель или на localhost, бот не получает вообще ничего.
 * Пользователи при этом нажимают Start, но привязка не происходит, и события
 * копятся в очереди без получателя.
 *
 * Здесь читаем состояние через `getWebhookInfo`, чтобы это было видно в панели,
 * а не только в логах. Токен наружу не отдаём — только выводы.
 */
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface TelegramWebhookStatus {
  /** Задан ли токен бота. */
  tokenConfigured: boolean;
  /** Задан ли `TELEGRAM_BOT_USERNAME` (без него нет deep-link привязки). */
  botUsername: string | null;
  /** `@username` бота по данным Telegram. */
  actualBotUsername: string | null;
  /** Зарегистрированный URL вебхука, либо null. */
  url: string | null;
  pendingUpdates: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  /** Вебхук задан и последней ошибки доставки нет. */
  healthy: boolean;
  /** Почему статус не удалось получить (сеть, неверный токен). */
  probeError: string | null;
}

const TIMEOUT_MS = 5000;

async function callBotApi(
  token: string,
  method: 'getMe' | 'getWebhookInfo',
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = (await response.json()) as {
    ok: boolean;
    result?: Record<string, unknown>;
    description?: string;
  };
  if (!payload.ok) {
    throw new Error(payload.description ?? `HTTP ${response.status}`);
  }
  return payload.result ?? {};
}

export async function getTelegramWebhookStatus(): Promise<TelegramWebhookStatus> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || env.telegram.botToken).trim();
  const configuredUsername = env.telegram.botUsername || null;

  const base: TelegramWebhookStatus = {
    tokenConfigured: Boolean(token),
    botUsername: configuredUsername,
    actualBotUsername: null,
    url: null,
    pendingUpdates: 0,
    lastError: null,
    lastErrorAt: null,
    healthy: false,
    probeError: null,
  };

  if (!token) return base;

  try {
    const [me, info] = await Promise.all([
      callBotApi(token, 'getMe'),
      callBotApi(token, 'getWebhookInfo'),
    ]);

    const url = typeof info.url === 'string' && info.url.length > 0 ? info.url : null;
    const lastError =
      typeof info.last_error_message === 'string' ? info.last_error_message : null;

    return {
      ...base,
      actualBotUsername: typeof me.username === 'string' ? me.username : null,
      url,
      pendingUpdates: typeof info.pending_update_count === 'number'
        ? info.pending_update_count
        : 0,
      lastError,
      lastErrorAt:
        typeof info.last_error_date === 'number'
          ? new Date(info.last_error_date * 1000)
          : null,
      healthy: Boolean(url) && !lastError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('telegram-webhook-probe-failed', { error: message });
    return { ...base, probeError: message };
  }
}
