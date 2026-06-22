/**
 * Stable per-guest key for RSVP idempotency (task 8.3, Template 3 / Requirement
 * 8.5).
 *
 * Template 3 ships one link to many guests, so the *same browser* must keep
 * answering as the *same guest*: a repeat RSVP has to update that guest's row
 * instead of creating a duplicate. The server already upserts a {@link Response}
 * by `(invitationId, guestKey)` (task 7.4 / repositories), so the client only
 * needs to send a key that is **stable across reloads for one guest** and
 * **distinct between guests**.
 *
 * Decision: generate a random {@link makeGuestKey} (prefer `crypto.randomUUID`)
 * the first time a guest opens the link and persist it in `localStorage` keyed
 * by the invitation token ({@link guestKeyStorageKey}). Subsequent visits in the
 * same browser reuse the stored key, so re-submitting updates the same record.
 * A different guest (different device/browser) gets a different key and a
 * separate row. The key is per-token so two invitations don't collide.
 *
 * The logic is split into pure functions over a minimal {@link KeyValueStore}
 * so it is unit-testable without a DOM (the project's test env is node).
 */

/** Prefix for the localStorage entry holding a guest key. */
export const GUEST_KEY_STORAGE_PREFIX = 'sayyes:guestKey:';

/** localStorage key under which the guest key for `token` is stored. */
export function guestKeyStorageKey(token: string): string {
  return `${GUEST_KEY_STORAGE_PREFIX}${token}`;
}

/**
 * Generate a fresh, unique guest key. Uses `crypto.randomUUID()` when available
 * (browsers and modern Node) and falls back to a time + random string so it
 * still works in older runtimes.
 */
export function makeGuestKey(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Minimal storage contract (a subset of the Web Storage API), for testability. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Load the guest key for `token` from `store`, creating and persisting a new one
 * on first use. The same browser therefore reuses one key per invitation, so a
 * repeated RSVP updates the same guest record (Requirement 8.5). A blank stored
 * value is treated as missing and replaced.
 *
 * @param make factory for a new key (injectable for tests; defaults to
 *   {@link makeGuestKey}).
 */
export function loadOrCreateGuestKey(
  token: string,
  store: KeyValueStore,
  make: () => string = makeGuestKey,
): string {
  const storageKey = guestKeyStorageKey(token);
  const existing = store.getItem(storageKey);
  if (typeof existing === 'string' && existing.trim() !== '') {
    return existing;
  }
  const created = make();
  store.setItem(storageKey, created);
  return created;
}

/**
 * Resolve the guest key in a browser, backed by `localStorage`. SSR/no-storage
 * safe: when `localStorage` is unavailable (server render, privacy mode) it
 * returns a fresh, non-persisted key so the RSVP still carries an identity.
 */
export function resolveGuestKey(token: string): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return loadOrCreateGuestKey(token, window.localStorage);
    }
  } catch {
    /* localStorage may throw (privacy mode / blocked) — fall through */
  }
  return makeGuestKey();
}
