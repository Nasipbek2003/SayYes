/**
 * Тесты подписи запросов к Finik.
 *
 * Главный из них — паритет с официальным пакетом Finik
 * (`@mancho.devs/authorizer`, devDependency): наша каноническая строка должна
 * совпадать байт-в-байт с той, что подписывает пакет. Если Finik изменит
 * канонизацию, этот тест упадёт.
 *
 * В рантайме пакет не используется: он логирует тело запроса и подписываемую
 * строку в консоль, а в продакшене это утечка платёжных данных в логи.
 */
import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { Signer } from '@mancho.devs/authorizer';

import {
  canonicalString,
  signRequest,
  verifyRequest,
  type FinikRequestData,
} from './finikSignature';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** Пример из документации Finik (создание платежа). */
const createPayment: FinikRequestData = {
  httpMethod: 'POST',
  path: '/v1/payment',
  headers: {
    Host: 'api.acquiring.averspay.kg',
    'x-api-key': 'api-key-1',
    'x-api-timestamp': '1737369012345',
  },
  queryStringParameters: null,
  body: {
    Amount: 100,
    CardType: 'FINIK_QR',
    PaymentId: 'a3f1c2e4-7b9d-4e2a-8c1f-3d0e9b2a5f6c',
    RedirectUrl: 'https://sayyes.kg/payment/callback',
    Data: {
      accountId: 'acc-1',
      name_en: 'SayYes',
      webhookUrl: 'https://sayyes.kg/api/payments/webhook',
    },
  },
};

/** Пример вебхука: вложенные объекты, порядок ключей как пришёл от Finik. */
const webhook: FinikRequestData = {
  httpMethod: 'POST',
  path: '/api/payments/webhook',
  headers: { Host: 'sayyes.kg', 'x-api-timestamp': '1781763261255' },
  queryStringParameters: null,
  body: {
    fields: { amount: 100, paymentId: 'sess-1' },
    amount: 100,
    status: 'succeeded',
    transactionId: 'trx-1',
    id: 'trx-1_DEBIT',
  },
};

describe('canonicalString', () => {
  it.each([
    ['create payment', createPayment],
    ['webhook', webhook],
    [
      'with query parameters',
      {
        ...createPayment,
        queryStringParameters: { b: '2', a: '1' },
      } satisfies FinikRequestData,
    ],
    [
      'without body',
      { ...createPayment, body: null } satisfies FinikRequestData,
    ],
  ])('совпадает с официальным пакетом Finik: %s', async (_name, data) => {
    // Пакет шумит в stdout — глушим, чтобы не мусорить в отчёте теста.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const signature = await new Signer(data as never).sign(privateKey);
      // Если строки совпадают, подпись пакета проверится нашим кодом.
      expect(verifyRequest(data, publicKey, signature)).toBe(true);
      // И наоборот — наша подпись проверяется пакетом.
      const ours = signRequest(data, privateKey);
      await expect(new Signer(data as never).verify(publicKey, ours)).resolves.toBe(
        true,
      );
    } finally {
      log.mockRestore();
    }
  });

  it('включает только Host и заголовки x-api-*', () => {
    const line = canonicalString({
      ...createPayment,
      headers: {
        ...createPayment.headers,
        authorization: 'secret',
        'content-type': 'application/json',
      },
    });

    expect(line).toContain('host:api.acquiring.averspay.kg');
    expect(line).toContain('x-api-key:api-key-1');
    expect(line).not.toContain('authorization');
    expect(line).not.toContain('content-type');
  });

  it('требует заголовок Host', () => {
    expect(() =>
      canonicalString({ ...createPayment, headers: { 'x-api-key': 'k' } }),
    ).toThrow(/Host/);
  });
});

describe('verifyRequest', () => {
  it('отклоняет подпись, снятую с другого тела', () => {
    const signature = signRequest(createPayment, privateKey);

    const tampered: FinikRequestData = {
      ...createPayment,
      body: { ...createPayment.body, Amount: 1 },
    };

    expect(verifyRequest(createPayment, publicKey, signature)).toBe(true);
    expect(verifyRequest(tampered, publicKey, signature)).toBe(false);
  });

  it('не бросает исключение на мусорной подписи', () => {
    expect(verifyRequest(createPayment, publicKey, 'not-base64!!')).toBe(false);
  });
});
