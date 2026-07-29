/**
 * Подпись запросов к Finik Web SDK (RSA-SHA256, Base64).
 *
 * Finik предлагает пакет `@mancho.devs/authorizer`, но он пишет тело запроса и
 * подписываемую строку в `console.log` — в продакшене это утечка платёжных
 * данных в логи. Поэтому канонизация повторена здесь один в один (см.
 * `lib/payments/finikSignature.test.ts` — тест сверяет нашу строку с
 * результатом официального пакета).
 *
 * Каноническая строка (части через `\n`):
 *   1. HTTP-метод в нижнем регистре
 *   2. decodeURI(path) — только путь, без query
 *   3. `host:<Host>` + заголовки `x-api-*` (ключ в нижнем регистре,
 *      отсортированы), склеенные через `&`
 *   4. query-параметры `k=v` (отсортированы) — часть добавляется, только если
 *      параметры есть
 *   5. JSON тела, где ключи верхнего уровня отсортированы `localeCompare`
 */
import { createSign, createVerify } from 'node:crypto';

export interface FinikRequestData {
  httpMethod: string;
  /** Абсолютный путь без query. */
  path: string;
  /** Обязателен `Host`; в подпись попадают только `Host` и `x-api-*`. */
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: Record<string, unknown> | null;
}

/** Собирает каноническую строку, которую подписывает/проверяет Finik. */
export function canonicalString(data: FinikRequestData): string {
  const parts: string[] = [];

  parts.push(data.httpMethod.toLowerCase());
  parts.push(decodeURI(data.path ?? ''));
  parts.push(headersData(data.headers));

  const query = queryData(data.queryStringParameters ?? {});
  if (query) parts.push(query);

  parts.push(jsonBody(data.body));

  return parts.join('\n');
}

function headersData(headers: FinikRequestData['headers']): string {
  const host = headers.Host ?? headers.host;
  if (!host) {
    throw new Error("Header 'Host' is required");
  }

  const apiHeaders = Object.keys(headers)
    .filter((key) => key.toLowerCase().startsWith('x-api-'))
    .sort()
    .map((key) => {
      const value = headers[key];
      if (value === undefined || value === null) {
        throw new Error(`Header '${key}' contains invalid value`);
      }
      return `${key.toLowerCase()}:${String(value)}`;
    });

  return [`host:${String(host)}`, ...apiHeaders].join('&');
}

function queryData(params: Record<string, string | undefined>): string {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key] ?? '';
      return `${encodeURI(decodeURI(key))}=${encodeURI(decodeURI(value))}`;
    })
    .join('&');
}

function jsonBody(body: FinikRequestData['body']): string {
  if (!body) return '';

  // Сортируются только ключи верхнего уровня — как в пакете Finik.
  const sorted = Object.entries(body)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  return JSON.stringify(sorted);
}

/** Подписывает запрос приватным ключом (PEM). Возвращает Base64. */
export function signRequest(data: FinikRequestData, privateKeyPem: string): string {
  const signer = createSign('SHA256');
  signer.update(canonicalString(data));
  return signer.sign(privateKeyPem, 'base64');
}

/** Проверяет Base64-подпись запроса публичным ключом (PEM) Finik. */
export function verifyRequest(
  data: FinikRequestData,
  publicKeyPem: string,
  signature: string,
): boolean {
  try {
    const verifier = createVerify('SHA256');
    verifier.update(canonicalString(data));
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch {
    // Битый ключ или подпись не в Base64 — считаем проверку непройденной.
    return false;
  }
}
