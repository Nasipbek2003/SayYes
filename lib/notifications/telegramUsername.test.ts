/**
 * Unit tests for {@link normalizeTelegramUsername}.
 */
import { describe, expect, it } from 'vitest';

import { normalizeTelegramUsername } from './telegramUsername';

describe('normalizeTelegramUsername', () => {
  it('strips a leading @ and lowercases', () => {
    expect(normalizeTelegramUsername('@Alice')).toBe('alice');
    expect(normalizeTelegramUsername('Bob_99')).toBe('bob_99');
  });

  it('extracts the username from a t.me link', () => {
    expect(normalizeTelegramUsername('https://t.me/Carol')).toBe('carol');
    expect(normalizeTelegramUsername('t.me/@dave_x')).toBe('dave_x');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeTelegramUsername('  @evelyn  ')).toBe('evelyn');
  });

  it('returns null for empty or non-string input', () => {
    expect(normalizeTelegramUsername('')).toBeNull();
    expect(normalizeTelegramUsername('   ')).toBeNull();
    expect(normalizeTelegramUsername(null)).toBeNull();
    expect(normalizeTelegramUsername(undefined)).toBeNull();
  });

  it('rejects usernames that violate Telegram constraints', () => {
    expect(normalizeTelegramUsername('ab')).toBeNull(); // too short (<5)
    expect(normalizeTelegramUsername('has spaces')).toBeNull();
    expect(normalizeTelegramUsername('bad-dash')).toBeNull();
    expect(normalizeTelegramUsername('a'.repeat(33))).toBeNull(); // too long (>32)
  });
});
