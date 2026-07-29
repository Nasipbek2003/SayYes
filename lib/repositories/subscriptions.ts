/**
 * Subscription data-access (repository) layer.
 *
 * Подписка — интервал `[startedAt, expiresAt)`, внутри которого автор публикует
 * приглашения без отдельной оплаты. Продление создаёт не новую строку, а
 * сдвигает `expiresAt` вперёд: так у автора всегда одна актуальная подписка.
 */
import type { Subscription } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/** Активная (непросроченная) подписка автора, либо null. */
export function findActiveByAuthor(
  authorId: string,
  now: Date = new Date(),
): Promise<Subscription | null> {
  return prisma.subscription.findFirst({
    where: { authorId, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
  });
}

/**
 * Продлевает подписку автора на `days` дней: от текущего `expiresAt`, если он
 * ещё в будущем, иначе — от «сейчас». Возвращает актуальную подписку.
 */
export async function extend(
  authorId: string,
  days: number,
  now: Date = new Date(),
): Promise<Subscription> {
  const current = await findActiveByAuthor(authorId, now);
  const from = current ? current.expiresAt : now;
  const expiresAt = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  if (current) {
    return prisma.subscription.update({
      where: { id: current.id },
      data: { expiresAt },
    });
  }

  return prisma.subscription.create({
    data: { authorId, startedAt: now, expiresAt },
  });
}
