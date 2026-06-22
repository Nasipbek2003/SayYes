/**
 * Debounced auto-save core for the creation form (task 10.2, Requirement 2.6).
 *
 * The form auto-saves the draft as the author types (`PATCH /api/invitations/:id`).
 * To avoid a request per keystroke we debounce saves. The *timing* logic is
 * kept here as a small framework-independent class driven by an injectable
 * timer, so it can be unit-tested deterministically (fake timers) without React
 * or a real network — the React component only wires it to `setTimeout` and the
 * fetch call.
 */

/** Minimal timer surface so tests can inject fake timers. */
export interface DebouncerTimer {
  setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

/** Default timer bound to the host environment. */
const defaultTimer: DebouncerTimer = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** Debounce interval (ms) between the last edit and an auto-save. */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Coalesces rapid `schedule()` calls into a single deferred `flush`. Each new
 * `schedule` cancels the pending one and restarts the timer, so the saved
 * value is always the most recent. `cancel()` stops any pending save (e.g. on
 * unmount); `flushNow()` runs it immediately (e.g. before checkout).
 */
export class Debouncer<T> {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private pending: T | null = null;
  private hasPending = false;

  constructor(
    private readonly onFlush: (value: T) => void,
    private readonly delayMs: number = AUTOSAVE_DEBOUNCE_MS,
    private readonly timer: DebouncerTimer = defaultTimer,
  ) {}

  /** Schedule `value` to be flushed after the debounce delay. */
  schedule(value: T): void {
    this.pending = value;
    this.hasPending = true;
    if (this.handle !== null) {
      this.timer.clearTimeout(this.handle);
    }
    this.handle = this.timer.setTimeout(() => {
      this.handle = null;
      this.flushNow();
    }, this.delayMs);
  }

  /** Whether a save is currently pending. */
  get isPending(): boolean {
    return this.hasPending;
  }

  /** Flush any pending value immediately, cancelling the timer. */
  flushNow(): void {
    if (this.handle !== null) {
      this.timer.clearTimeout(this.handle);
      this.handle = null;
    }
    if (this.hasPending) {
      const value = this.pending as T;
      this.hasPending = false;
      this.pending = null;
      this.onFlush(value);
    }
  }

  /** Cancel any pending save without flushing it. */
  cancel(): void {
    if (this.handle !== null) {
      this.timer.clearTimeout(this.handle);
      this.handle = null;
    }
    this.hasPending = false;
    this.pending = null;
  }
}
