/**
 * Telegram @username normalisation.
 *
 * Telegram usernames are case-insensitive, 5–32 chars, and may contain only
 * latin letters, digits and underscores. We store them normalised (lowercase,
 * without a leading `@`) so the creator's typed nickname and the value captured
 * from a webhook update always compare equal.
 */

/** Telegram's own constraint on usernames. */
const USERNAME_RE = /^[a-z0-9_]{5,32}$/;

/**
 * Normalise a user-supplied Telegram nickname to its canonical form, or return
 * `null` when the input is empty or not a valid username. A `https://t.me/<user>`
 * or `t.me/<user>` link is accepted too — we extract the username.
 */
export function normalizeTelegramUsername(
  input: string | null | undefined,
): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().toLowerCase();
  if (value === '') return null;

  // Tolerate a pasted t.me link.
  const linkMatch = /(?:https?:\/\/)?t\.me\/(@?[a-z0-9_]+)/.exec(value);
  if (linkMatch) value = linkMatch[1];

  value = value.replace(/^@/, '');
  return USERNAME_RE.test(value) ? value : null;
}
