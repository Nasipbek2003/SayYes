/**
 * Product analytics — conversion funnel + error tracking (analysis gap #5).
 *
 * The MVP's core hypothesis is "will people pay", so the whole funnel must be
 * observable: invitation created → checkout started → payment succeeded →
 * link opened → guest responded. This module gives one tiny API to record those
 * milestones and any errors, decoupled from where the data ends up.
 *
 * Two sinks, both non-blocking and failure-swallowing (analytics must never
 * break a user request):
 *  - **Structured logger** (always): every event is logged with an `analytics`
 *    marker so it is queryable in log drains even without an external provider.
 *  - **PostHog** (optional): when `POSTHOG_KEY` is set, events are also
 *    forwarded to PostHog's capture endpoint via fire-and-forget `fetch`.
 *
 * Swap or add sinks here without touching call sites.
 */
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/** The conversion-funnel milestones we track. */
export type FunnelEvent =
  | 'invitation_created'
  | 'checkout_started'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'invitation_opened'
  | 'invitation_responded';

/** Flat, serialisable event properties. */
export type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Fire-and-forget POST to PostHog's capture API when configured. */
function forwardToPostHog(event: string, props: AnalyticsProps): void {
  const { posthogKey, posthogHost } = env.analytics;
  if (!posthogKey) return;

  // A per-invitation distinct id keeps funnel steps for one link correlated;
  // fall back to an anonymous marker when no id is present.
  const distinctId =
    (props.invitationId as string | undefined) ??
    (props.token as string | undefined) ??
    'anonymous';

  void fetch(`${posthogHost.replace(/\/$/, '')}/i/v0/e/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: posthogKey,
      event,
      properties: { distinct_id: distinctId, ...props },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    /* analytics is best-effort — never surface a delivery error */
  });
}

/**
 * Record a funnel event. Always logs (structured, `analytics: true`) and, when
 * PostHog is configured, forwards there too. Never throws.
 */
export function track(event: FunnelEvent, props: AnalyticsProps = {}): void {
  try {
    logger.info('analytics-event', { analytics: true, event, ...props });
    forwardToPostHog(event, props);
  } catch {
    /* analytics must never break the caller */
  }
}

/**
 * Record an error for observability. Logs at `error` level with a scope so it
 * is easy to grep/alert on; forwards to PostHog as a `$exception`-style event
 * when configured. Use this in catch blocks where a failure matters
 * (payments, notifications, storage). Never throws.
 */
export function trackError(
  scope: string,
  error: unknown,
  props: AnalyticsProps = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  try {
    logger.error('analytics-error', { analytics: true, scope, error: message, ...props });
    forwardToPostHog('error', { scope, error: message, ...props } as AnalyticsProps & {
      scope: string;
    });
  } catch {
    /* swallow */
  }
}
