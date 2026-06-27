/**
 * Telegram contact data-access (repository) layer.
 *
 * Thin wrappers over Prisma for the `TelegramContact` model — the
 * `@username → chat.id` mapping captured by the bot webhook. The outbox worker
 * uses {@link findByUsername} to resolve the chat id for an invitation's
 * `notifyTelegram` nickname, since the Bot API cannot message a user by their
 * `@username` directly.
 */
import type { TelegramContact } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/**
 * Record (or refresh) the chat id for a normalised Telegram username. Called by
 * the webhook whenever a user messages the bot, so a later invitation that
 * names this `@username` can be delivered.
 */
export function upsert(
  username: string,
  chatId: string,
): Promise<TelegramContact> {
  return prisma.telegramContact.upsert({
    where: { username },
    create: { username, chatId },
    update: { chatId },
  });
}

/** Resolve a contact by its normalised username, or null if we've never seen it. */
export function findByUsername(
  username: string,
): Promise<TelegramContact | null> {
  return prisma.telegramContact.findUnique({ where: { username } });
}
