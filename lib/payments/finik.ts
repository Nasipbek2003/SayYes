/**
 * Адаптер Finik Web SDK — эквайринг в сомах через QR/финансовые приложения КР.
 *
 * Поток (docs: https://www.finik.kg/documentation/web-sdk/):
 *  1. Подписываем тело запроса приватным ключом RSA (заголовок `signature`).
 *  2. `POST {baseUrl}/v1/payment` с `redirect: 'manual'` — Finik отвечает 302,
 *     ссылка на платёжную страницу лежит в заголовке `Location`.
 *  3. Плательщика ведём на эту ссылку; после оплаты Finik возвращает его на
 *     `RedirectUrl` (у нас — /payment/callback?session=…).
 *  4. Источник правды — вебхук на `Data.webhookUrl`: он приходит только при
 *     успешной оплате, доставляется «хотя бы один раз» и подписан приватным
 *     ключом Finik (проверяем его публичным ключом Finik).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

import { finikWebhookPublicKeyFor } from './finikPublicKeys';
import { signRequest, verifyRequest, type FinikRequestData } from './finikSignature';
import {
  PaymentConfigError,
  WebhookVerificationError,
  type CheckoutParams,
  type CheckoutResult,
  type PaymentEvent,
  type PaymentProvider,
} from './provider';

/** Путь нашего вебхука — Finik подписывает запрос именно с этим путём. */
const WEBHOOK_PATH = '/api/payments/webhook';

interface FinikOptions {
  baseUrl?: string;
  /** Путь создания платежа, по умолчанию `/v1/payment`. */
  paymentPath?: string;
  apiKey?: string;
  accountId?: string;
  qrName?: string;
  privateKey?: string;
  webhookPublicKey?: string;
  appUrl?: string;
  /** Подменяемый fetch — для тестов. */
  fetchImpl?: typeof fetch;
}

export class FinikPaymentProvider implements PaymentProvider {
  readonly name = 'finik';

  constructor(private readonly options: FinikOptions = {}) {}

  private get baseUrl(): string {
    return (this.options.baseUrl ?? env.finik.baseUrl).replace(/\/$/, '');
  }

  private get appUrl(): string {
    return (this.options.appUrl ?? env.appUrl).replace(/\/$/, '');
  }

  /** Путь создания платежа (входит в подпись — должен совпадать с URL). */
  private get paymentPath(): string {
    const path = this.options.paymentPath ?? env.finik.paymentPath;
    return path.startsWith('/') ? path : `/${path}`;
  }

  private get apiKey(): string {
    return this.options.apiKey ?? env.finik.apiKey;
  }

  private get accountId(): string {
    return this.options.accountId ?? env.finik.accountId;
  }

  private get privateKey(): string {
    return (
      this.options.privateKey ??
      (env.finik.privateKey || readPemFile(env.finik.privateKeyPath))
    );
  }

  /**
   * Публичный ключ Finik для проверки вебхуков. Приоритет: явная опция →
   * переменная окружения → файл → встроенный ключ среды (опубликован Finik).
   */
  private get webhookPublicKey(): string {
    return (
      this.options.webhookPublicKey ??
      (env.finik.webhookPublicKey ||
        readPemFile(env.finik.webhookPublicKeyPath) ||
        finikWebhookPublicKeyFor(this.baseUrl))
    );
  }

  /** URL, на который Finik присылает уведомления о статусе платежа. */
  get webhookUrl(): string {
    return `${this.appUrl}${WEBHOOK_PATH}`;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const missing = [
      !this.apiKey && 'FINIK_API_KEY',
      !this.accountId && 'FINIK_ACCOUNT_ID',
      !this.privateKey && 'FINIK_PRIVATE_KEY',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new PaymentConfigError(
        `Finik не настроен: не заданы ${missing.join(', ')}.`,
      );
    }

    // PaymentId должен быть UUID и уникальным — он же наш sessionId.
    const sessionId = randomUUID();
    const timestamp = Date.now().toString();
    const host = new URL(this.baseUrl).host;

    const body = {
      Amount: params.amount,
      CardType: 'FINIK_QR',
      PaymentId: sessionId,
      // Страница возврата должна знать, какой платёж ждать, — дописываем session.
      RedirectUrl: withSession(
        params.successUrl ?? `${this.appUrl}/payment/callback`,
        sessionId,
      ),
      Data: {
        accountId: this.accountId,
        name_en: this.options.qrName ?? env.finik.qrName,
        webhookUrl: this.webhookUrl,
        ...(params.description ? { description: params.description } : {}),
        // Прилетит обратно в webhook.fields — так связываем платёж с доменом,
        // даже если запись в базе почему-то потерялась.
        additionalData: [
          { fieldId: 'plan', name: 'Тариф', isHidden: true, value: params.plan },
          { fieldId: 'authorId', name: 'Автор', isHidden: true, value: params.authorId },
          ...(params.invitationId
            ? [
                {
                  fieldId: 'invitationId',
                  name: 'Приглашение',
                  isHidden: true,
                  value: params.invitationId,
                },
              ]
            : []),
        ],
      },
    };

    const requestData: FinikRequestData = {
      httpMethod: 'POST',
      path: this.paymentPath,
      headers: {
        Host: host,
        'x-api-key': this.apiKey,
        'x-api-timestamp': timestamp,
      },
      queryStringParameters: null,
      body,
    };

    const signature = signRequest(requestData, this.privateKey);
    const fetchImpl = this.options.fetchImpl ?? fetch;

    const res = await fetchImpl(`${this.baseUrl}${this.paymentPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'x-api-timestamp': timestamp,
        signature,
      },
      body: JSON.stringify(body),
      // Не идём по редиректу: нам нужен сам Location, а не HTML страницы.
      redirect: 'manual',
    });

    const checkoutUrl = await readCheckoutUrl(res);
    if (!checkoutUrl) {
      const detail = await safeText(res);
      logger.error('finik-create-payment-failed', { status: res.status, detail });
      throw new Error(`Finik не вернул ссылку на оплату (HTTP ${res.status}).`);
    }

    return { checkoutUrl, sessionId };
  }

  async verifyWebhook(req: Request): Promise<PaymentEvent> {
    const raw = await req.text();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new WebhookVerificationError('Invalid webhook body');
    }

    await this.assertSignature(req, payload);

    const fields = (payload.fields ?? {}) as Record<string, unknown>;
    const sessionId =
      pickString(fields.paymentId) ?? pickString(payload.transactionId) ?? '';
    if (!sessionId) {
      throw new WebhookVerificationError('Missing paymentId');
    }

    // Finik присылает вебхук только по успешной оплате, но статус может
    // прийти в любом регистре и в разных формах (success / succeeded).
    const rawStatus = pickString(payload.status) ?? '';
    const status = /^succe/i.test(rawStatus) ? 'succeeded' : 'failed';

    const externalId = pickString(payload.transactionId) ?? pickString(payload.id);

    return {
      sessionId,
      status,
      ...(externalId ? { externalId, eventId: externalId } : {}),
    };
  }

  /**
   * Проверяет подпись вебхука публичным ключом Finik.
   *
   * Host и путь берём из нескольких кандидатов: за прокси (Vercel и т.п.)
   * заголовок `host` может отличаться от того, что Finik использовал при
   * подписи — им был host нашего `webhookUrl`.
   */
  private async assertSignature(
    req: Request,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const signature = req.headers.get('signature');
    const publicKey = this.webhookPublicKey;

    if (!publicKey) {
      if (env.nodeEnv === 'production') {
        throw new WebhookVerificationError(
          'FINIK_WEBHOOK_PUBLIC_KEY is not configured',
        );
      }
      logger.warn('finik-webhook-signature-skipped', {
        reason: 'no_public_key',
        env: env.nodeEnv,
      });
      return;
    }

    if (!signature) {
      throw new WebhookVerificationError('Missing signature header');
    }

    const url = new URL(req.url);
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-api-')) headers[key] = value;
    });

    const hosts = unique([
      req.headers.get('x-forwarded-host') ?? '',
      req.headers.get('host') ?? '',
      hostOf(this.appUrl),
      url.host,
    ]);
    const paths = unique([url.pathname, WEBHOOK_PATH]);

    for (const host of hosts) {
      for (const path of paths) {
        const ok = verifyRequest(
          {
            httpMethod: 'POST',
            path,
            headers: { ...headers, Host: host },
            queryStringParameters: null,
            body: payload,
          },
          publicKey,
          signature,
        );
        if (ok) return;
      }
    }

    throw new WebhookVerificationError('Invalid webhook signature');
  }
}

/** Достаёт ссылку на оплату из ответа Finik (302 Location или JSON). */
async function readCheckoutUrl(res: Response): Promise<string | null> {
  const location = res.headers.get('location');
  if (location) return location;

  // На случай, если API начнёт отвечать 201 с JSON вместо 302.
  if (res.ok) {
    try {
      const data = (await res.clone().json()) as Record<string, unknown>;
      return (
        pickString(data.paymentUrl) ??
        pickString(data.url) ??
        pickString(data.redirectUrl) ??
        null
      );
    } catch {
      return null;
    }
  }

  return null;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Читает PEM-ключ из файла (переменные `FINIK_*_KEY_PATH`). Результат
 * кэшируется: ключи не меняются в течение жизни процесса.
 */
const pemCache = new Map<string, string>();

function readPemFile(path: string): string {
  if (!path) return '';

  const cached = pemCache.get(path);
  if (cached !== undefined) return cached;

  let value = '';
  try {
    value = readFileSync(path, 'utf8').trim();
  } catch (error) {
    logger.warn('finik-pem-file-unreadable', { path, error: String(error) });
  }

  pemCache.set(path, value);
  return value;
}

/** Дописывает `?session=<id>` в URL возврата, если его там ещё нет. */
function withSession(url: string, sessionId: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('session')) {
      parsed.searchParams.set('session', sessionId);
    }
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}session=${encodeURIComponent(sessionId)}`;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
