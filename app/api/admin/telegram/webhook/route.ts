/**
 * Перерегистрация вебхука Telegram на адрес, с которого пришёл запрос.
 *
 * Telegram доставляет апдейты только на один зарегистрированный URL. Раньше его
 * приходилось задавать скриптом из терминала, зная домен; здесь домен берётся из
 * самого запроса — нажатие кнопки в панели на проде регистрирует прод-домен, а
 * в туннеле — адрес туннеля.
 *
 * Секрет: если в настройках его ещё нет, генерируем и сохраняем. Он передаётся
 * Telegram как `secret_token` и проверяется в `/api/telegram/webhook`, поэтому
 * записывать его нужно ровно в момент регистрации — иначе значения разойдутся.
 */
import { randomBytes } from 'node:crypto';

import { getAdminFromRequest } from '@/lib/admin/guard';
import { getRequestOrigin } from '@/lib/auth/requestOrigin';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  getTelegramWebhookSecret,
  saveTelegramWebhookSecret,
} from '@/lib/settings/appConfig';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return Response.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  const token = (process.env.TELEGRAM_BOT_TOKEN || env.telegram.botToken).trim();
  if (!token) {
    return Response.json({ error: 'TELEGRAM_BOT_TOKEN не задан' }, { status: 400 });
  }

  const origin = getRequestOrigin(request).replace(/\/+$/, '');
  if (!origin.startsWith('https://')) {
    return Response.json(
      {
        error: `Telegram принимает только HTTPS. Текущий адрес: ${origin}. Локально нужен туннель, на проде — открыть панель по https.`,
      },
      { status: 400 },
    );
  }

  let secret = await getTelegramWebhookSecret();
  if (!secret) {
    secret = randomBytes(24).toString('hex');
    await saveTelegramWebhookSecret(secret);
  }

  const url = `${origin}/api/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ['message'],
      // Накопившиеся апдейты не выбрасываем: там могут быть нажатия Start,
      // из которых берутся привязки Telegram.
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  if (!res.ok || !payload?.ok) {
    return Response.json(
      { error: payload?.description ?? `Telegram ответил ${res.status}` },
      { status: 502 },
    );
  }

  logger.info('admin-telegram-webhook-set', { admin, url });

  return Response.json({ ok: true, url });
}
