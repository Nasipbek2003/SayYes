'use client';

/**
 * `useDelayedFlag` — returns `false` initially and flips to `true` after
 * `delayMs` (task 7.2).
 *
 * Used to gate the first scenario screen behind the intro loading screen for
 * ~1–1.5 s (Requirement 5.1). The timer is cleared on unmount so a guest who
 * navigates away mid-load does not trigger a state update on an unmounted tree.
 */
import { useEffect, useState } from 'react';

/**
 * @param delayMs delay before the flag becomes `true`.
 * @returns `false` until `delayMs` has elapsed, then `true`.
 */
export function useDelayedFlag(delayMs: number): boolean {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return done;
}
