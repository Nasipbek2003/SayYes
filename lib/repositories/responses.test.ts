/**
 * Unit tests for the response repository, focused on the idempotency invariant
 * of a guest's answer keyed by `(invitationId, guestKey)`
 * (Property 3 / Requirement 8.5).
 *
 * ## Testing approach
 * These tests do NOT require a live PostgreSQL instance. The Prisma singleton
 * from `@/lib/prisma` is replaced with a deep mock (`vitest-mock-extended`), so
 * we assert the repository calls `prisma.response.upsert` with the correct
 * compound where-key and create/update payloads. A small stateful fake keyed by
 * the serialized where-clause additionally proves that repeated answers with the
 * same key update one row rather than inserting duplicates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient, Response } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  SINGLE_GUEST_KEY,
  findByGuestKey,
  resolveGuestKey,
  upsertResponse,
} from './responses';

vi.mock('@/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('resolveGuestKey', () => {
  it('keeps a provided guest key (multi-guest RSVP templates)', () => {
    expect(resolveGuestKey('guest-123')).toBe('guest-123');
  });

  it('maps null/undefined/empty to the stable single-guest sentinel', () => {
    expect(resolveGuestKey(null)).toBe(SINGLE_GUEST_KEY);
    expect(resolveGuestKey(undefined)).toBe(SINGLE_GUEST_KEY);
    expect(resolveGuestKey('')).toBe(SINGLE_GUEST_KEY);
  });
});

describe('upsertResponse', () => {
  it('upserts using the (invitationId, guestKey) compound key for RSVP guests', async () => {
    const row = { id: 'r1' } as Response;
    prismaMock.response.upsert.mockResolvedValue(row);

    await upsertResponse({
      invitationId: 'inv-1',
      guestKey: 'guest-a',
      guestName: 'Aisha',
      outcome: { type: 'rsvp', rsvp: 'yes', guests: 2 },
    });

    expect(prismaMock.response.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.response.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      invitationId_guestKey: { invitationId: 'inv-1', guestKey: 'guest-a' },
    });
    expect(arg.create).toMatchObject({
      invitationId: 'inv-1',
      guestKey: 'guest-a',
      guestName: 'Aisha',
    });
    expect(arg.update).toMatchObject({ guestName: 'Aisha' });
  });

  it('normalises a missing guestKey to the single-guest sentinel', async () => {
    prismaMock.response.upsert.mockResolvedValue({ id: 'r1' } as Response);

    await upsertResponse({
      invitationId: 'inv-1',
      outcome: { type: 'accepted' },
    });

    const arg = prismaMock.response.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      invitationId_guestKey: {
        invitationId: 'inv-1',
        guestKey: SINGLE_GUEST_KEY,
      },
    });
  });

  it('is idempotent: repeated answers update one row, never duplicate', async () => {
    // Stateful fake store keyed by the serialized compound where-clause.
    const store = new Map<string, Response>();
    let idSeq = 0;

    prismaMock.response.upsert.mockImplementation((async (args: {
      where: { invitationId_guestKey: { invitationId: string; guestKey: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const key = JSON.stringify(args.where.invitationId_guestKey);
      const existing = store.get(key);
      if (existing) {
        const updated = { ...existing, ...args.update } as Response;
        store.set(key, updated);
        return updated;
      }
      const created = { id: `r${++idSeq}`, ...args.create } as Response;
      store.set(key, created);
      return created;
    }) as never);

    const first = await upsertResponse({
      invitationId: 'inv-1',
      guestKey: 'guest-a',
      guestName: 'Aisha',
      outcome: { type: 'rsvp', rsvp: 'yes' },
    });

    const second = await upsertResponse({
      invitationId: 'inv-1',
      guestKey: 'guest-a',
      guestName: 'Aisha Updated',
      outcome: { type: 'rsvp', rsvp: 'no' },
    });

    // Same logical row (same id), no duplicate created.
    expect(second.id).toBe(first.id);
    expect(store.size).toBe(1);
    expect(second.guestName).toBe('Aisha Updated');
    expect(second.outcome).toEqual({ type: 'rsvp', rsvp: 'no' });

    // A different guest on the same invitation gets its own row.
    await upsertResponse({
      invitationId: 'inv-1',
      guestKey: 'guest-b',
      outcome: { type: 'rsvp', rsvp: 'yes' },
    });
    expect(store.size).toBe(2);
  });
});

describe('findByGuestKey', () => {
  it('looks up by the normalised compound key', async () => {
    prismaMock.response.findUnique.mockResolvedValue(null);

    await findByGuestKey('inv-1', null);

    expect(prismaMock.response.findUnique).toHaveBeenCalledWith({
      where: {
        invitationId_guestKey: {
          invitationId: 'inv-1',
          guestKey: SINGLE_GUEST_KEY,
        },
      },
    });
  });
});
