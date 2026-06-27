/**
 * Outbox worker — Telegram delivery with retries (task 9.2).
 *
 * Implements the delivery half of the outbox pattern (design §8). On each
 * {@link OutboxWorker.processPending} invocation the worker:
 *
 *  1. reads PENDING rows from `notification_outbox` (oldest first);
 *  2. resolves the author's `telegramChatId`. If the author hasn't linked
 *     Telegram yet, the row is **left PENDING and skipped** — it is delivered
 *     after linking (task 9.3 / Requirement 9.5), and the worker doesn't fail;
 *  3. otherwise sends the message text via the {@link TelegramClient}:
 *     - success → mark the row SENT (with `sentAt`);
 *     - failure → record the failed attempt with the error. If the retry budget
 *       is exhausted ({@link hasExhaustedRetries}) the row is marked FAILED
 *       (keeping `lastError`), but it stays visible in the author's cabinet
 *       (Requirement 9.4); otherwise it stays PENDING for an exponential-backoff
 *       retry on a later run ({@link backoffDelayMs}).
 *
 * The retry / backoff *decisions* live in pure functions (`./backoff`) so they
 * are unit-tested without I/O; this module wires them to the repositories and
 * the Telegram client, both injectable for tests.
 */
import type { Author, NotificationOutbox } from '@prisma/client';

import {
  authorRepo as defaultAuthorRepo,
  invitationRepo as defaultInvitationRepo,
  outboxRepo as defaultOutboxRepo,
  telegramContactRepo as defaultTelegramContactRepo,
} from '@/lib/repositories';
import {
  DEFAULT_RETRY_POLICY,
  hasExhaustedRetries,
  type RetryPolicy,
} from './backoff';
import { getTelegramClient, type TelegramClient } from './telegram';

/** Outbox repository surface the worker depends on (subset). */
export interface WorkerOutboxRepo {
  findPending: typeof defaultOutboxRepo.findPending;
  markSent: typeof defaultOutboxRepo.markSent;
  incrementAttempts: typeof defaultOutboxRepo.incrementAttempts;
  markFailed: typeof defaultOutboxRepo.markFailed;
}

/** Author repository surface the worker depends on (subset). */
export interface WorkerAuthorRepo {
  findById: (id: string) => Promise<Author | null>;
}

/** Invitation repository surface the worker depends on (subset). */
export interface WorkerInvitationRepo {
  findById: (id: string) => Promise<{ notifyTelegram: string | null } | null>;
}

/** Telegram-contact repository surface the worker depends on (subset). */
export interface WorkerTelegramContactRepo {
  findByUsername: (username: string) => Promise<{ chatId: string } | null>;
}

/** Injectable dependencies (explicit so the worker is unit-testable). */
export interface OutboxWorkerDeps {
  outboxRepo: WorkerOutboxRepo;
  authorRepo: WorkerAuthorRepo;
  invitationRepo: WorkerInvitationRepo;
  telegramContactRepo: WorkerTelegramContactRepo;
  telegram: TelegramClient;
  policy?: RetryPolicy;
}

/** Outcome of a single delivery attempt for a row (returned for observability). */
export type DeliveryOutcome =
  | { id: string; result: 'sent' }
  | { id: string; result: 'skipped'; reason: 'no-telegram' }
  | { id: string; result: 'retry'; error: string }
  | { id: string; result: 'failed'; error: string };

/** Aggregate result of one {@link OutboxWorker.processPending} run. */
export interface ProcessResult {
  processed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  outcomes: DeliveryOutcome[];
}

/** Extract the human-readable message text stored on an outbox payload. */
function messageOf(row: NotificationOutbox): string {
  const payload = row.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return 'Новое событие по вашему приглашению.';
}

/**
 * The outbox delivery worker. Construct with explicit dependencies in tests;
 * the default {@link outboxWorker} singleton wires the real repositories and
 * the Bot API Telegram client.
 */
export class OutboxWorker {
  private readonly outboxRepo: WorkerOutboxRepo;
  private readonly authorRepo: WorkerAuthorRepo;
  private readonly invitationRepo: WorkerInvitationRepo;
  private readonly telegramContactRepo: WorkerTelegramContactRepo;
  private readonly telegram: TelegramClient;
  private readonly policy: RetryPolicy;

  constructor(deps: OutboxWorkerDeps) {
    this.outboxRepo = deps.outboxRepo;
    this.authorRepo = deps.authorRepo;
    this.invitationRepo = deps.invitationRepo;
    this.telegramContactRepo = deps.telegramContactRepo;
    this.telegram = deps.telegram;
    this.policy = deps.policy ?? DEFAULT_RETRY_POLICY;
  }

  /**
   * Process up to `limit` pending outbox rows, delivering each via Telegram and
   * applying the SENT / retry / FAILED / skip policy. Never throws on a single
   * row's delivery failure — failures are recorded on the row so the run can
   * make progress across the batch.
   */
  async processPending(limit = 50): Promise<ProcessResult> {
    const rows = await this.outboxRepo.findPending(limit);
    const outcomes: DeliveryOutcome[] = [];

    for (const row of rows) {
      outcomes.push(await this.deliver(row));
    }

    return {
      processed: rows.length,
      sent: outcomes.filter((o) => o.result === 'sent').length,
      skipped: outcomes.filter((o) => o.result === 'skipped').length,
      retried: outcomes.filter((o) => o.result === 'retry').length,
      failed: outcomes.filter((o) => o.result === 'failed').length,
      outcomes,
    };
  }

  /** Deliver a single row, returning the outcome (and mutating its DB state). */
  private async deliver(row: NotificationOutbox): Promise<DeliveryOutcome> {
    const chatId = await this.resolveChatId(row);

    // Requirement 9.5: no deliverable Telegram chat yet — either the author
    // hasn't linked Telegram and the invitation names no (known) nickname, or
    // the named person hasn't messaged the bot. Keep the event PENDING and skip
    // it; it'll be delivered once a chat becomes resolvable.
    if (!chatId) {
      return { id: row.id, result: 'skipped', reason: 'no-telegram' };
    }

    try {
      await this.telegram.sendMessage({
        chatId,
        text: messageOf(row),
      });
      await this.outboxRepo.markSent(row.id);
      return { id: row.id, result: 'sent' };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);

      // Requirement 9.4: once retries are exhausted, mark FAILED (keeping the
      // last error) — the event stays visible in the author's cabinet.
      if (hasExhaustedRetries(row.attempts, this.policy)) {
        await this.outboxRepo.markFailed(row.id, error);
        return { id: row.id, result: 'failed', error };
      }

      // Otherwise record the attempt and leave PENDING for a backoff retry.
      await this.outboxRepo.incrementAttempts(row.id, error);
      return { id: row.id, result: 'retry', error };
    }
  }

  /**
   * Resolve the target Telegram chat id for an outbox row, or null when none is
   * deliverable yet.
   *
   * Priority:
   *  1. The invitation's `notifyTelegram` nickname — the creator just typed a
   *     `@username`. We resolve it to a chat id via the contact mapping the
   *     webhook captured (the named person must have messaged the bot at least
   *     once, since the Bot API can't DM by `@username`).
   *  2. Fallback to the author's own linked `telegramChatId` (the cabinet
   *     linking flow), preserving the original behaviour.
   */
  private async resolveChatId(
    row: NotificationOutbox,
  ): Promise<string | null> {
    const invitation = await this.invitationRepo.findById(row.invitationId);
    const username = invitation?.notifyTelegram ?? null;
    if (username) {
      const contact = await this.telegramContactRepo.findByUsername(username);
      if (contact?.chatId) return contact.chatId;
    }

    const author = await this.authorRepo.findById(row.authorId);
    return author?.telegramChatId ?? null;
  }
}

/** Default worker wired with the real repos and the Bot API Telegram client. */
export const outboxWorker = new OutboxWorker({
  outboxRepo: defaultOutboxRepo,
  authorRepo: defaultAuthorRepo,
  invitationRepo: defaultInvitationRepo,
  telegramContactRepo: defaultTelegramContactRepo,
  telegram: getTelegramClient(),
});
