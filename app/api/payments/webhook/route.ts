/**
 * POST /api/payments/webhook — payment provider callback (task 5.2).
 *
 * Auth: the provider's signature, verified by
 * {@link PaymentProvider.verifyWebhook} (not an author session). An invalid or
 * unparseable payload → 400.
 *
 * On a verified event the handler delegates to
 * {@link PaymentService.handleWebhook}, which is idempotent by the provider
 * `sessionId` (Property 2):
 *  - succeeded → mark the payment SUCCEEDED and activate the invitation
 *    (generate token + URL, status ACTIVE — Property 1 / Requirement 3.3);
 *  - failed/cancelled → mark the payment FAILED and keep the draft so the author
 *    can retry (Requirement 3.4);
 *  - a re-delivered or unknown event is acknowledged without side effects.
 *
 * The handler always returns 200 for a verified event (even duplicates/unknown
 * sessions) so the provider doesn't enter a retry storm; only signature/parse
 * failures return 400.
 */
import { getPaymentProvider } from '@/lib/payments/provider';
import { WebhookVerificationError } from '@/lib/payments/provider';
import { paymentService } from '@/lib/services/payment';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const provider = getPaymentProvider();

  // 1) Verify the provider signature and normalise the event.
  let event;
  try {
    event = await provider.verifyWebhook(request);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    // Any other verification failure is also a bad request from our side.
    return Response.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  // 2) Apply the event idempotently (success → activate, fail → keep draft).
  const result = await paymentService.handleWebhook(event);
  return Response.json(result, { status: 200 });
}
