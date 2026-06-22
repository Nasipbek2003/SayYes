/**
 * Notification service (task 9.1 — enqueue into the outbox).
 *
 * Author notifications use the **outbox pattern** (design §8): instead of
 * calling the Telegram Bot API inline (which is slow and can fail), a domain
 * event is recorded as a row in `notification_outbox`, and a separate worker
 * (task 9.2) delivers it with retries. This service owns only the *enqueue*
 * half — building the notification payload from the template schema and writing
 * exactly one outbox row per notifiable domain event.
 *
 * ## Transactionality (Correctness Property 8)
 *
 * Property 8 requires that *every domain event (open/response) yields exactly
 * one outbox row, written in the same transaction as the domain change*, so an
 * event is never lost (and never duplicated) even if Telegram delivery later
 * fails. To guarantee atomicity, {@link InvitationService} now performs the
 * domain write (OpenEvent / Response) **and** the outbox enqueue inside a single
 * Prisma transaction, invoking {@link NotificationService.handleDomainEvent}
 * with the transaction client `tx`. If the outbox write throws, the whole
 * transaction rolls back — neither the domain row nor the outbox row is
 * persisted — so the guest's request can be retried without losing or
 * double-emitting the event. This replaces the previous best-effort,
 * fire-after-write hook whose failures were swallowed.
 *
 * ## Which events are notifiable (Requirement 9.1 / 9.2)
 *
 *  - **open**: only the *first* open emits an "opened" notification
 *    (Requirement 9.1). Repeat opens are recorded as OpenEvents but produce no
 *    outbox row.
 *  - **response**: every recorded answer emits a notification carrying the
 *    answer details (Requirement 9.2), using the matching `AuthorEvent` of the
 *    template schema for the message template.
 */
import { outboxRepo as defaultOutboxRepo } from '@/lib/repositories';
import { templateRegistry as defaultRegistry } from '@/lib/templates/registry';
import type { NotificationOutbox, Prisma } from '@prisma/client';
import type {
  AuthorEvent,
  GuestResponse,
  TemplateRegistry,
  TemplateSchema,
} from '@/templates/types';
import type { DomainEvent } from '@/lib/services/invitation';

/**
 * A notification ready to be appended to the outbox. `payload` is opaque JSON
 * the delivery worker (task 9.2) turns into a Telegram message — here it always
 * carries the rendered `message`, the raw `messageTemplate`, and the answer
 * `details` so the cabinet (Requirement 9.4) and the worker have everything
 * they need.
 */
export interface NotificationEvent {
  /** Author who should receive the notification. */
  authorId: string;
  /** Invitation the event belongs to. */
  invitationId: string;
  /** Event category: opened | accepted | declined | rsvp. */
  type: AuthorEvent['type'];
  /** Rendered message + details for the worker / cabinet. */
  payload: NotificationPayload;
}

/** JSON payload stored on an outbox row. */
export interface NotificationPayload {
  /** Final message text with `{{переменные}}` substituted. */
  message: string;
  /** Original template string (kept for debugging / re-rendering). */
  messageTemplate: string;
  /** The guest's answer details (absent for "opened"). */
  details?: Record<string, unknown>;
}

/** Outbox repository surface the service depends on (subset). */
export interface NotificationOutboxRepo {
  create: typeof defaultOutboxRepo.create;
}

/** Injectable dependencies (kept explicit so the service is unit-testable). */
export interface NotificationServiceDeps {
  registry: TemplateRegistry;
  outboxRepo: NotificationOutboxRepo;
}

/**
 * Substitute `{{ключ}}` placeholders in a template string from a context map.
 * Unknown keys render as the empty string. Keys may be Cyrillic (the template
 * variables are localized, e.g. `{{имя_адресата}}`).
 */
function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const value = context[rawKey];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Build the substitution context for a notification message from the author's
 * data and (for a response) the guest's answer. The author's `{{переменные}}`
 * are the base; response fields are mapped onto the localized variable names
 * the message templates use (e.g. `place` → `выбранное_место`,
 * `rsvp` → `статус_rsvp`) and also exposed under their raw keys.
 */
function buildContext(
  authorData: Record<string, unknown>,
  response?: GuestResponse,
): Record<string, unknown> {
  const context: Record<string, unknown> = { ...authorData };
  if (!response) return context;

  if (typeof response.place === 'string') context['выбранное_место'] = response.place;
  if (typeof response.time === 'string') context['выбранное_время'] = response.time;
  if (typeof response.guestName === 'string') context['имя_гостя'] = response.guestName;
  if (response.rsvp === 'yes' || response.rsvp === 'no') {
    context['статус_rsvp'] = response.rsvp === 'yes' ? 'Приду' : 'Не смогу';
  }
  if (typeof response.guests === 'number') context['число_гостей'] = response.guests;

  // Expose any remaining raw response keys without clobbering the mapped ones.
  for (const [key, value] of Object.entries(response)) {
    if (!(key in context)) context[key] = value;
  }
  return context;
}

/** Read an invitation `data` JSON column as a plain author-data record. */
function asAuthorData(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Locate the {@link AuthorEvent} of `type` declared by any screen of the
 * template (its `emits`). Returns the first match, or `undefined` when the
 * template never emits that type.
 */
function findAuthorEvent(
  template: TemplateSchema,
  type: AuthorEvent['type'],
): AuthorEvent | undefined {
  for (const screen of template.screens) {
    for (const emit of screen.emits ?? []) {
      if (emit.type === type) return emit;
    }
  }
  return undefined;
}

/**
 * Notification service. Construct with explicit dependencies in tests; the
 * default {@link notificationService} singleton wires the real outbox
 * repository and the in-code template registry.
 */
export class NotificationService {
  private readonly registry: TemplateRegistry;
  private readonly outboxRepo: NotificationOutboxRepo;

  constructor(deps: NotificationServiceDeps) {
    this.registry = deps.registry;
    this.outboxRepo = deps.outboxRepo;
  }

  /**
   * Append a single event to `notification_outbox`. Pass the Prisma transaction
   * client `tx` so the row is written in the same transaction as the domain
   * change (Property 8). Returns the created row.
   */
  async enqueue(
    event: NotificationEvent,
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationOutbox> {
    return this.outboxRepo.create(
      {
        authorId: event.authorId,
        invitationId: event.invitationId,
        type: event.type,
        payload: event.payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Translate a recorded {@link DomainEvent} into at most one outbox row, within
   * the same transaction (`tx`) as the domain write. This is the extension point
   * wired into {@link InvitationService} via its `onDomainEvent` hook.
   *
   *  - **open**: enqueues an "opened" notification only on the first open
   *    (Requirement 9.1); repeat opens are a no-op here.
   *  - **response**: enqueues a notification for the answer with its details
   *    (Requirement 9.2), using the template's matching `AuthorEvent` message.
   *
   * Failures are intentionally NOT swallowed: a throw rolls back the enclosing
   * transaction so the domain change is not persisted without its event
   * (Property 8 — the event is never lost).
   */
  async handleDomainEvent(
    event: DomainEvent,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const template = this.registry.get(event.invitation.templateId);
    const authorData = asAuthorData(event.invitation.data);

    if (event.kind === 'open') {
      // Requirement 9.1: only the first open notifies the author.
      if (!event.firstOpen) return;
      const authorEvent = findAuthorEvent(template, 'opened');
      const messageTemplate = authorEvent?.messageTemplate ?? 'Приглашение открыли.';
      await this.enqueue(
        {
          authorId: event.invitation.authorId,
          invitationId: event.invitation.id,
          type: 'opened',
          payload: {
            message: renderTemplate(messageTemplate, buildContext(authorData)),
            messageTemplate,
          },
        },
        tx,
      );
      return;
    }

    // event.kind === 'response' (Requirement 9.2): notify with answer details.
    const type = event.response.type;
    const authorEvent = findAuthorEvent(template, type);
    const messageTemplate = authorEvent?.messageTemplate ?? 'Новый ответ на приглашение.';
    const context = buildContext(authorData, event.response);
    await this.enqueue(
      {
        authorId: event.invitation.authorId,
        invitationId: event.invitation.id,
        type,
        payload: {
          message: renderTemplate(messageTemplate, context),
          messageTemplate,
          details: { ...event.response },
        },
      },
      tx,
    );
  }
}

/** Default service wired with the real outbox repo and the in-code registry. */
export const notificationService = new NotificationService({
  registry: defaultRegistry,
  outboxRepo: defaultOutboxRepo,
});
