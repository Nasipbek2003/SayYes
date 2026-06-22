/**
 * Unit tests for the debounced auto-save core (task 10.2, Requirement 2.6).
 *
 * Drive the {@link Debouncer} with Vitest fake timers so the coalescing,
 * latest-value-wins, flush and cancel behaviours are verified deterministically
 * without React or a real network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTOSAVE_DEBOUNCE_MS, Debouncer } from './autosave';

describe('Debouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes once after the debounce delay with the latest value', () => {
    const flush = vi.fn();
    const d = new Debouncer<string>(flush, AUTOSAVE_DEBOUNCE_MS);

    d.schedule('a');
    d.schedule('b');
    d.schedule('c');
    expect(flush).not.toHaveBeenCalled();
    expect(d.isPending).toBe(true);

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('c');
    expect(d.isPending).toBe(false);
  });

  it('restarts the timer on each schedule', () => {
    const flush = vi.fn();
    const d = new Debouncer<number>(flush, 1000);

    d.schedule(1);
    vi.advanceTimersByTime(600);
    d.schedule(2);
    vi.advanceTimersByTime(600);
    // Not yet 1000ms since the last schedule.
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(2);
  });

  it('flushNow runs the pending save immediately', () => {
    const flush = vi.fn();
    const d = new Debouncer<string>(flush, 1000);
    d.schedule('x');
    d.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('x');
    // No further call when the timer would have fired.
    vi.advanceTimersByTime(1000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flushNow is a no-op with nothing pending', () => {
    const flush = vi.fn();
    const d = new Debouncer<string>(flush, 1000);
    d.flushNow();
    expect(flush).not.toHaveBeenCalled();
  });

  it('cancel discards the pending save', () => {
    const flush = vi.fn();
    const d = new Debouncer<string>(flush, 1000);
    d.schedule('x');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
    expect(d.isPending).toBe(false);
  });
});
