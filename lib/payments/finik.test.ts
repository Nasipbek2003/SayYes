/**
 * Тесты адаптера Finik.
 *
 * Внешний HTTP подменяется fetch-заглушкой: проверяем, что запрос создания
 * платежа собран и подписан по спецификации, что ссылка берётся из заголовка
 * `Location` (302), и что вебхук проверяется по подписи и нормализуется в
 * {@link PaymentEvent}.
 */
import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { FinikPaymentProvider } from './finik';
import { signRequest, verifyRequest, type FinikRequestData } from './finikSignature';
import { WebhookVerificationError } from './provider';

/** Наша пара ключей (подписываем запросы к Finik). */
const merchant = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** Пара ключей «Finik» (подписывает вебхуки). */
const finik = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const BASE_URL = 'https://beta.api.acquiring.averspay.kg';
const APP_URL = 'https://sayyes.kg';

function buildProvider(fetchImpl: typeof fetch) {
  return new FinikPaymentProvider({
    baseUrl: BASE_URL,
    appUrl: APP_URL,
    apiKey: 'api-key-1',
    accountId: 'acc-1',
    qrName: 'SayYes',
    privateKey: merchant.privateKey,
    webhookPublicKey: finik.publicKey,
    fetchImpl,
  });
}

const checkoutParams = {
  invitationId: 'inv-1',
  authorId: 'author-1',
  plan: 'single' as const,
  tier: 'PREMIUM' as const,
  amount: 100,
  currency: 'KGS',
};

describe('FinikPaymentProvider.createCheckout', () => {
  it('подписывает запрос и возвращает ссылку из заголовка Location', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, {
        status: 302,
        headers: { location: 'https://qr.finik/pay/abc' },
      });
    }) as unknown as typeof fetch;

    const provider = buildProvider(fetchImpl);
    const result = await provider.createCheckout(checkoutParams);

    expect(result.checkoutUrl).toBe('https://qr.finik/pay/abc');
    // PaymentId (= sessionId) — UUID.
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);

    const [call] = calls;
    expect(call.url).toBe(`${BASE_URL}/v1/payment`);
    const headers = call.init.headers as Record<string, string>;
    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;

    expect(call.init.redirect).toBe('manual');
    expect(body).toMatchObject({
      Amount: 100,
      CardType: 'FINIK_QR',
      PaymentId: result.sessionId,
      // В ссылку возврата дописан идентификатор платежа.
      RedirectUrl: `${APP_URL}/payment/callback?session=${result.sessionId}`,
    });
    expect(body.Data).toMatchObject({
      accountId: 'acc-1',
      name_en: 'SayYes',
      webhookUrl: `${APP_URL}/api/payments/webhook`,
    });

    // Подпись снята с той же канонической строки, что ждёт Finik.
    const requestData: FinikRequestData = {
      httpMethod: 'POST',
      path: '/v1/payment',
      headers: {
        Host: new URL(BASE_URL).host,
        'x-api-key': headers['x-api-key'],
        'x-api-timestamp': headers['x-api-timestamp'],
      },
      queryStringParameters: null,
      body,
    };
    expect(verifyRequest(requestData, merchant.publicKey, headers.signature)).toBe(
      true,
    );
  });

  it('сохраняет свой session в переданном successUrl', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://qr.finik/pay/abc' },
      });
    }) as unknown as typeof fetch;

    const { sessionId } = await buildProvider(fetchImpl).createCheckout({
      ...checkoutParams,
      successUrl: `${APP_URL}/payment/done?from=create`,
    });

    expect(sent.RedirectUrl).toBe(
      `${APP_URL}/payment/done?from=create&session=${sessionId}`,
    );
  });

  it('падает с понятной ошибкой, если Finik не вернул ссылку', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 401 })) as unknown as typeof fetch;

    await expect(
      buildProvider(fetchImpl).createCheckout(checkoutParams),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('требует настроенных ключей', async () => {
    const provider = new FinikPaymentProvider({
      baseUrl: BASE_URL,
      appUrl: APP_URL,
      apiKey: '',
      accountId: '',
      privateKey: '',
    });

    await expect(provider.createCheckout(checkoutParams)).rejects.toThrow(
      /FINIK_API_KEY/,
    );
  });
});

/** Собирает подписанный «Finik»-ом запрос вебхука. */
function webhookRequest(
  payload: Record<string, unknown>,
  options: { signature?: string; host?: string; timestamp?: string } = {},
): Request {
  const timestamp = options.timestamp ?? '1781763261255';
  const host = options.host ?? 'sayyes.kg';
  const signature =
    options.signature ??
    signRequest(
      {
        httpMethod: 'POST',
        path: '/api/payments/webhook',
        headers: { Host: host, 'x-api-timestamp': timestamp },
        queryStringParameters: null,
        body: payload,
      },
      finik.privateKey,
    );

  return new Request(`https://${host}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host,
      'x-api-timestamp': timestamp,
      signature,
    },
    body: JSON.stringify(payload),
  });
}

const successPayload = {
  id: 'trx-1_DEBIT',
  transactionId: 'trx-1',
  status: 'succeeded',
  amount: 100,
  fields: { amount: 100, paymentId: 'sess-1', plan: 'single' },
  transactionDate: 1781697937466,
};

describe('FinikPaymentProvider.verifyWebhook', () => {
  const provider = buildProvider((async () => new Response(null)) as unknown as typeof fetch);

  it('нормализует успешный вебхук', async () => {
    const event = await provider.verifyWebhook(webhookRequest(successPayload));

    expect(event).toEqual({
      sessionId: 'sess-1',
      status: 'succeeded',
      externalId: 'trx-1',
      eventId: 'trx-1',
    });
  });

  it('принимает статус в любом регистре и форме', async () => {
    const event = await provider.verifyWebhook(
      webhookRequest({ ...successPayload, status: 'SUCCESS' }),
    );
    expect(event.status).toBe('succeeded');
  });

  it('размечает неизвестный статус как failed', async () => {
    const event = await provider.verifyWebhook(
      webhookRequest({ ...successPayload, status: 'declined' }),
    );
    expect(event.status).toBe('failed');
  });

  it('отклоняет неверную подпись', async () => {
    await expect(
      provider.verifyWebhook(
        webhookRequest(successPayload, { signature: 'bm9wZQ==' }),
      ),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('отклоняет запрос без подписи', async () => {
    const request = new Request(`${APP_URL}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(successPayload),
    });

    await expect(provider.verifyWebhook(request)).rejects.toThrow(
      /Missing signature/,
    );
  });

  it('отклоняет подпись, снятую с подменённого тела', async () => {
    const signature = signRequest(
      {
        httpMethod: 'POST',
        path: '/api/payments/webhook',
        headers: { Host: 'sayyes.kg', 'x-api-timestamp': '1781763261255' },
        queryStringParameters: null,
        body: successPayload,
      },
      finik.privateKey,
    );

    await expect(
      provider.verifyWebhook(
        webhookRequest({ ...successPayload, amount: 1 }, { signature }),
      ),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('требует paymentId', async () => {
    await expect(
      provider.verifyWebhook(
        webhookRequest({ status: 'succeeded', fields: {} }),
      ),
    ).rejects.toThrow(/paymentId/);
  });
});
