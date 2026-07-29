/**
 * Диагностика интеграции с Finik: прогоняет реальный запрос создания платежа и
 * показывает, что именно отвечает Finik.
 *
 *   npx tsx --env-file=.env scripts/finik-diagnose.mts
 *
 * Денег не двигает: платёж только создаётся, никто по нему не платит.
 *
 * Что проверяется:
 *  1. авторизация и подпись (неверная подпись → 401, значит наша верна);
 *  2. создаётся ли запись платежа на стороне Finik (`/v1/redirect` находит id);
 *  3. отдаётся ли ссылка на платёжную страницу `qr.finik` — это и есть признак
 *     полностью рабочей интеграции.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { env } from '../lib/env';
import { signRequest, type FinikRequestData } from '../lib/payments/finikSignature';

const baseUrl = env.finik.baseUrl.replace(/\/$/, '');
const host = new URL(baseUrl).host;
const appUrl = env.appUrl.replace(/\/$/, '');

const privateKey =
  env.finik.privateKey ||
  (env.finik.privateKeyPath ? readFileSync(env.finik.privateKeyPath, 'utf8').trim() : '');

if (!env.finik.apiKey || !env.finik.accountId || !privateKey) {
  console.error(
    'Не хватает настроек: нужны FINIK_API_KEY, FINIK_ACCOUNT_ID и приватный ключ.',
  );
  process.exit(1);
}

async function signedFetch(
  method: string,
  path: string,
  query: Record<string, string> | null,
  body: Record<string, unknown> | null,
  options: { breakSignature?: boolean } = {},
) {
  const timestamp = Date.now().toString();
  const requestData: FinikRequestData = {
    httpMethod: method,
    path,
    headers: {
      Host: host,
      'x-api-key': env.finik.apiKey,
      'x-api-timestamp': timestamp,
    },
    queryStringParameters: query,
    body,
  };

  const signature = options.breakSignature
    ? signRequest({ ...requestData, body: { tampered: true } }, privateKey)
    : signRequest(requestData, privateKey);

  const qs = query
    ? `?${Object.entries(query)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')}`
    : '';

  return fetch(`${baseUrl}${path}${qs}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      'x-api-key': env.finik.apiKey,
      'x-api-timestamp': timestamp,
      signature,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
}

const paymentId = randomUUID();
const body = {
  Amount: 100,
  CardType: 'FINIK_QR',
  PaymentId: paymentId,
  RedirectUrl: `${appUrl}/payment/callback`,
  Data: {
    accountId: env.finik.accountId,
    name_en: env.finik.qrName,
    webhookUrl: `${appUrl}/api/payments/webhook`,
  },
};

console.log(`Среда: ${baseUrl}`);
console.log(`Счёт:  ${env.finik.accountId}`);
console.log(`PaymentId: ${paymentId}\n`);

// 1. Подпись: намеренно ломаем и ждём 401 — так видно, что проверка работает.
const broken = await signedFetch('POST', env.finik.paymentPath, null, body, {
  breakSignature: true,
});
console.log(
  `1) проверка подписи: http=${broken.status} ${
    broken.status === 401 ? '(ожидаемо — подпись проверяется)' : '(неожиданно!)'
  }`,
);

// 2. Создание платежа.
const created = await signedFetch('POST', env.finik.paymentPath, null, body);
const location = created.headers.get('location') ?? '';
console.log(`2) создание платежа: http=${created.status}`);
console.log(`   Location: ${location || (await created.text()).slice(0, 300)}`);

const gotPaymentPage = location.includes('qr.finik');
console.log(
  `   ссылка на оплату: ${gotPaymentPage ? 'ПОЛУЧЕНА — интеграция работает' : 'НЕ получена'}`,
);

// 3. Существует ли запись платежа у Finik. clientId берём из ответа Finik:
//    он свой у каждого API-ключа.
const clientId = /clientId=(\d+)/.exec(location)?.[1] ?? '';
const lookup = await signedFetch(
  'GET',
  '/v1/redirect',
  { paymentId, clientId, status: 'succeeded' },
  null,
);
console.log(
  `3) платёж в базе Finik: http=${lookup.status} ${
    lookup.status === 302 ? 'найден' : (await lookup.text()).slice(0, 200)
  }`,
);

if (!gotPaymentPage) {
  console.log(
    '\nИтог: запрос принят и платёж создан, но Finik не выдал ссылку qr.finik.\n' +
      'Осталось на стороне кабинета Finik: проверить QuickPay ID / QuickPay ключ\n' +
      'у API-клиента и тип счёта (для эквайринга нужен корпоративный).',
  );
}
