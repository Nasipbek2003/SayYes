/**
 * Integration tests for the payment webhook Route Handler (task 5.2):
 *   POST /api/payments/webhook
 *
 * ## Testing approach
 * The payment provider (`getPaymentProvider`) and the {@link PaymentService}
 * singleton are mocked, so these tests cover the HTTP adapter only: signature
 * verification gating (400 on a bad/unparseable payload), delegation to
 * `handleWebhook`, and that a verified event is always acknowledged with 200
 * (including idempotent duplicates and unknown sessions) so the provider does
 * not enter a retry storm.
 *
 * **Validates: Requirements 3.2, 3.3, 3.4**
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { WebhookVerificationError } from '@/lib/payments/provider';

const verifyWebhook = vi.fn();
const handleWebhook = vi.fn();

vi.mock('@/lib/payments/provider', async () => {
  const actual = await vi.importActual<typeof import('@/lib/payments/provider')>(
    '@/lib/payments/provider',
  );
  return {
    ...actual,
    getPaymentProvider: () => ({
      name: 'mock',
      createCheckout: vi.fn(),
      verifyWebhook: (...args: unknown[]) => verifyWebhook(...args),
    }),
  };
});

vi.mock('@/lib/services/payment', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/payment')>(
    '@/lib/services/payment',
  );
  return {
    ...actual,
    paymentService: {
      handleWebhook: (...args: unknown[]) => handleWebhook(...args),
    },
  };
});

// Import the handler AFTER the mocks are registered.
const { POST } = await import('./route');

function webhookReq(body: unknown): Request {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/payments/webhook', () => {
  it('activates on a verified success event and returns 200', async () => {
    verifyWebhook.mockResolvedValue({ sessionId: 'sess_1', status: 'succeeded' });
    handleWebhook.mockResolvedValue({
      status: 'activated',
      invitationId: 'inv-1',
      token: 'abc123',
      url: 'http://localhost:3000/i/abc123',
    });

    const res = await POST(webhookReq({ sessionId: 'sess_1', status: 'succeeded' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'activated' });
    expect(handleWebhook).toHaveBeenCalledWith({
      sessionId: 'sess_1',
      status: 'succeeded',
    });
  });

  it('keeps the draft on a verified failure event and returns 200', async () => {
    verifyWebhook.mockResolvedValue({ sessionId: 'sess_1', status: 'failed' });
    handleWebhook.mockResolvedValue({ status: 'failed', invitationId: 'inv-1' });

    const res = await POST(webhookReq({ sessionId: 'sess_1', status: 'failed' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'failed' });
  });

  it('acknowledges an idempotent duplicate with 200', async () => {
    verifyWebhook.mockResolvedValue({ sessionId: 'sess_1', status: 'succeeded' });
    handleWebhook.mockResolvedValue({ status: 'duplicate', paymentStatus: 'SUCCEEDED' });

    const res = await POST(webhookReq({ sessionId: 'sess_1', status: 'succeeded' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'duplicate' });
  });

  it('returns 400 when signature verification fails (no service call)', async () => {
    verifyWebhook.mockRejectedValue(
      new WebhookVerificationError('Invalid webhook signature'),
    );

    const res = await POST(webhookReq({ sessionId: 'sess_1', status: 'succeeded' }));

    expect(res.status).toBe(400);
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it('returns 400 on an unparseable/invalid payload (no service call)', async () => {
    verifyWebhook.mockRejectedValue(new WebhookVerificationError('Invalid webhook body'));

    const res = await POST(webhookReq({}));

    expect(res.status).toBe(400);
    expect(handleWebhook).not.toHaveBeenCalled();
  });
});
