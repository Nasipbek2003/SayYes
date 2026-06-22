/**
 * Response data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `Response` model. The key invariant here is
 * idempotency of a guest's answer (Property 3 / Requirement 8.5): for any
 * `(invitationId, guestKey)` there is at most one `Response`, and answering
 * again updates the existing row instead of creating a duplicate.
 *
 * ## guestKey = null behaviour
 * Templates 1 and 2 ("simple-date", "story-fork") have a single addressee, so a
 * single invitation should hold a single answer. PostgreSQL treats NULL as
 * distinct in unique indexes, so `@@unique([invitationId, guestKey])` would NOT
 * deduplicate rows when `guestKey` is null — every repeat answer would insert a
 * new row. To keep one-answer-per-invitation semantics we normalise a missing
 * guest key to the stable sentinel `SINGLE_GUEST_KEY` ("__single__"). Callers
 * for single-addressee templates simply omit `guestKey` and rely on this.
 *
 * Template 3 ("event-rsvp") is multi-guest: callers MUST pass a stable
 * per-guest `guestKey` (e.g. a slug of the guest name or a client-generated id)
 * so each guest gets their own idempotent row.
 */
import type { Prisma, Response } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/**
 * Stable sentinel used in place of a null guest key so that single-addressee
 * templates keep exactly one response per invitation (see module docs).
 */
export const SINGLE_GUEST_KEY = '__single__';

export interface UpsertResponseInput {
  invitationId: string;
  /** Omit (or pass null/undefined) for single-addressee templates. */
  guestKey?: string | null;
  guestName?: string | null;
  outcome: Prisma.InputJsonValue;
}

/** Normalise a possibly-null guest key to a stable, non-null value. */
export function resolveGuestKey(guestKey?: string | null): string {
  return guestKey == null || guestKey === '' ? SINGLE_GUEST_KEY : guestKey;
}

/**
 * Idempotently store a guest's answer keyed by `(invitationId, guestKey)`.
 *
 * Repeat calls with the same key update the existing row (outcome, guestName)
 * rather than inserting a duplicate.
 *
 * Pass a Prisma transaction client (`tx`) to upsert in the same transaction as
 * the matching outbox enqueue (Property 8 — every domain event yields exactly
 * one outbox row, atomically).
 */
export function upsertResponse(
  input: UpsertResponseInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<Response> {
  const guestKey = resolveGuestKey(input.guestKey);

  return tx.response.upsert({
    where: {
      invitationId_guestKey: {
        invitationId: input.invitationId,
        guestKey,
      },
    },
    create: {
      invitationId: input.invitationId,
      guestKey,
      guestName: input.guestName ?? null,
      outcome: input.outcome,
    },
    update: {
      guestName: input.guestName ?? null,
      outcome: input.outcome,
    },
  });
}

/** List all responses for an invitation (oldest first). */
export function findByInvitation(invitationId: string): Promise<Response[]> {
  return prisma.response.findMany({
    where: { invitationId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Count how many responses an invitation has collected. Used by the author's
 * cabinet to derive the "отвечено" status without loading every row
 * (Requirement 10.1).
 */
export function countByInvitation(invitationId: string): Promise<number> {
  return prisma.response.count({ where: { invitationId } });
}

/**
 * Fetch a single response by its idempotency key, or null if absent. Accepts an
 * optional transaction client so create-vs-update detection can share the
 * recording transaction (Property 8 / Requirement 8.5).
 */
export function findByGuestKey(
  invitationId: string,
  guestKey?: string | null,
  tx: Prisma.TransactionClient = prisma,
): Promise<Response | null> {
  return tx.response.findUnique({
    where: {
      invitationId_guestKey: {
        invitationId,
        guestKey: resolveGuestKey(guestKey),
      },
    },
  });
}
