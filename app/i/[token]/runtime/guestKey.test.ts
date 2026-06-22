/**
 * Unit tests for the per-guest RSVP idempotency key (task 8.3 / Requirement
 * 8.5).
 *
 * Cover the pure storage logic without a DOM (the project's test env is node):
 *  - a new key is generated and persisted on first use, per invitation token;
 *  - the same browser reuses the stored key (so a repeat RSVP updates the same
 *    record rather than duplicating it);
 *  - different tokens get different keys;
 *  - a blank stored value is treated as missing.
 *
 * **Validates: Requirements 8.5**
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type KeyValueStore,
  guestKeyStorageKey,
  loadOrCreateGuestKey,
  makeGuestKey,
} from './guestKey';

/** Minimal in-memory store implementing the {@link KeyValueStore} contract. */
function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('guestKeyStorageKey', () => {
  it('namespaces the key per invitation token', () => {
    expect(guestKeyStorageKey('abc')).toBe('sayyes:guestKey:abc');
    expect(guestKeyStorageKey('abc')).not.toBe(guestKeyStorageKey('xyz'));
  });
});

describe('makeGuestKey', () => {
  it('generates non-empty, unique keys', () => {
    const a = makeGuestKey();
    const b = makeGuestKey();
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });
});

describe('loadOrCreateGuestKey', () => {
  it('creates and persists a new key on first use', () => {
    const store = memoryStore();
    const make = vi.fn(() => 'fixed-key');
    const key = loadOrCreateGuestKey('tok', store, make);
    expect(key).toBe('fixed-key');
    expect(store.data[guestKeyStorageKey('tok')]).toBe('fixed-key');
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('reuses the stored key for the same token (idempotency)', () => {
    const store = memoryStore();
    const first = loadOrCreateGuestKey('tok', store, () => 'k1');
    const second = loadOrCreateGuestKey('tok', store, () => 'k2');
    expect(first).toBe('k1');
    // Second call must not overwrite — the same guest keeps the same key.
    expect(second).toBe('k1');
  });

  it('keeps separate keys for different tokens', () => {
    const store = memoryStore();
    const a = loadOrCreateGuestKey('tok-a', store, () => 'ka');
    const b = loadOrCreateGuestKey('tok-b', store, () => 'kb');
    expect(a).toBe('ka');
    expect(b).toBe('kb');
  });

  it('treats a blank stored value as missing and replaces it', () => {
    const store = memoryStore({ [guestKeyStorageKey('tok')]: '   ' });
    const key = loadOrCreateGuestKey('tok', store, () => 'fresh');
    expect(key).toBe('fresh');
  });
});
