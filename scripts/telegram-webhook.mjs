#!/usr/bin/env node
/**
 * Управление вебхуком Telegram-бота.
 *
 *   node scripts/telegram-webhook.mjs info
 *   node scripts/telegram-webhook.mjs set https://<публичный-домен>
 *   node scripts/telegram-webhook.mjs set            # возьмёт NEXT_PUBLIC_APP_URL
 *   node scripts/telegram-webhook.mjs delete
 *
 * Зачем скрипт: Telegram доставляет апдейты только на один зарегистрированный
 * URL. Если он указывает на умерший туннель (trycloudflare/ngrok перезапустился)
 * или на localhost, бот не получает ни одного сообщения — люди нажимают Start,
 * а привязка Telegram не происходит и уведомления никому не уходят. `info`
 * показывает текущий URL и последнюю ошибку доставки, `set` перенастраивает.
 *
 * Секрет `TELEGRAM_WEBHOOK_SECRET` передаётся в Telegram как `secret_token` —
 * он же проверяется в `/api/telegram/webhook`, поэтому значения обязаны
 * совпадать.
 */
import { readFileSync } from 'node:fs';
import { argv } from 'node:process';

/** Минимальный парсер .env: не тянем зависимость ради трёх переменных. */
function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  } catch {
    // .env может отсутствовать — тогда переменные приходят из окружения.
  }
}

loadEnv();

const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не задан.');
  process.exit(1);
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json();
  if (!payload.ok) {
    console.error(`${method}: ${payload.description ?? response.status}`);
    process.exit(1);
  }
  return payload.result;
}

const command = argv[2] ?? 'info';

if (command === 'info') {
  const me = await call('getMe');
  const info = await call('getWebhookInfo');
  console.log(`бот: @${me.username} (${me.first_name})`);
  console.log(`webhook: ${info.url || '(не задан)'}`);
  console.log(`ожидают доставки: ${info.pending_update_count ?? 0}`);
  if (info.last_error_message) {
    const when = info.last_error_date
      ? new Date(info.last_error_date * 1000).toISOString()
      : '—';
    console.log(`последняя ошибка (${when}): ${info.last_error_message}`);
  }
  if (!info.url) {
    console.log('\nБот не получает апдейты. Задайте адрес:');
    console.log('  node scripts/telegram-webhook.mjs set https://<домен>');
  }
} else if (command === 'set') {
  const base = (argv[3] ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    console.error('Укажите публичный URL: node scripts/telegram-webhook.mjs set https://<домен>');
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/.test(base)) {
    console.error(
      `Telegram не умеет доставлять апдейты на ${base}. Нужен публичный HTTPS-адрес:\n` +
        '  прод-домен, либо туннель (cloudflared tunnel --url http://localhost:3000).',
    );
    process.exit(1);
  }
  if (!base.startsWith('https://')) {
    console.error('Telegram требует HTTPS.');
    process.exit(1);
  }

  const url = `${base}/api/telegram/webhook`;
  await call('setWebhook', {
    url,
    secret_token: secret || undefined,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
  console.log(`webhook установлен: ${url}`);
  console.log(`secret_token: ${secret ? 'передан' : 'не задан (проверка отключена)'}`);
} else if (command === 'delete') {
  await call('deleteWebhook', { drop_pending_updates: false });
  console.log('webhook удалён');
} else {
  console.error(`Неизвестная команда: ${command}. Доступно: info, set, delete.`);
  process.exit(1);
}
