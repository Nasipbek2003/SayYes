/**
 * Unit tests for the {@link MockPaymentProvider} (task 5.1).
 *
 * Covers the provider abstraction directly:
 *  - createCheckout returns a checkoutUrl under the configured app origin and a
 *    unique session id;
 *  - verifyWebhook normalises a valid `{ sessionId, status }` body into a
 *    {@link PaymentEvent};
 *  - verifyWebhook rejects unknown status, missing sessionId and (when a secret
 *    is configured) a missing/incorrect `x-webhook-secret` header.
 */
import { describe, expect, it } from 'vitest';

import { MockPaymentProvider, WebhookVerificationError } from './provider';

function webhookReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('MockPaymentProvider.createCheckout', () => {
  it('returns a checkout URL under the configured app origin and a unique session id', async () => {
    const provider = new MockPaymentProvider({ appUrl: 'https://app.test' });

    const a = await provider.createCheckout({
      invitationId: 'inv-1',
      tier: 'BASIC',
      amount: 990,
    });
    const b = await provider.createCheckout({
      invitationId: 'inv-1',
      tier: 'BASIC',
      amount: 990,
    });

    expect(a.checkoutUrl).toContain('https://app.test/mock-checkout/');
    expect(a.checkoutUrl).toContain(a.sessionId);
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe('MockPaymentProvider.verifyWebhook', () => {
  it('normalises a valid succeeded webhook', async () => {
    const provider = new MockPaymentProvider();
    const event = await provider.verifyWebhook(
      webhookReq({ sessionId: 'sess_1', status: 'succeeded', eventId: 'evt_1' }),
    );
    expect(event).toEqual({
      sessionId: 'sess_1',
      status: 'succeeded',
      eventId: 'evt_1',
    });
  });

  it('normalises a valid failed webhook without eventId', async () => {
    const provider = new MockPaymentProvider();
    const event = await provider.verifyWebhook(
      webhookReq({ sessionId: 'sess_2', status: 'failed' }),
    );
    expect(event).toEqual({ sessionId: 'sess_2', status: 'failed' });
  });

  it('rejects an unknown status', async () => {
    const provider = new MockPaymentProvider();
    await expect(
      provider.verifyWebhook(webhookReq({ sessionId: 'sess_3', status: 'weird' })),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('rejects a missing sessionId', async () => {
    const provider = new MockPaymentProvider();
    await expect(
      provider.verifyWebhook(webhookReq({ status: 'succeeded' })),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('requires a matching secret header when configured', async () => {
    const provider = new MockPaymentProvider({ webhookSecret: 'shh' });

    await expect(
      provider.verifyWebhook(webhookReq({ sessionId: 's', status: 'succeeded' })),
    ).rejects.toBeInstanceOf(WebhookVerificationError);

    const event = await provider.verifyWebhook(
      webhookReq(
        { sessionId: 's', status: 'succeeded' },
        { 'x-webhook-secret': 'shh' },
      ),
    );
    expect(event.sessionId).toBe('s');
  });
});
