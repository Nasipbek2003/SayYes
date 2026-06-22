/**
 * Pure logic for the runaway "Нет" button (task 7.3, Requirements 6.2 / 6.3).
 *
 * The runaway button is the signature interaction of Template 1: every time the
 * guest tries to tap/hover "Нет" it darts to a new random spot inside its
 * container and shrinks, while the "Да" button grows by a factor derived from
 * the same attempt counter. After a small number of attempts (4–5) "Нет"
 * disappears entirely, leaving only "Да".
 *
 * This module is the *framework-independent* core, kept free of React/DOM so it
 * can be unit-tested directly (same split as {@link controller}). The React
 * component ({@link RunawayButton}) is a thin wrapper that measures the DOM and
 * mirrors this state machine into render output.
 *
 *  - Requirement 6.2: tapping "Нет" moves it to a random point and shrinks it,
 *    while "Да" grows slightly.
 *  - Requirement 6.3: once attempts reach the limit, "Нет" is removed.
 *
 * On touch devices the component reacts to `touchstart`/`pointerdown` (see
 * {@link RUNAWAY_EVADE_EVENTS}) so the button escapes *before* a `click` can
 * land — the dispatch logic itself is the same pure transition here.
 */

/** Default number of "Нет" attempts before the button disappears (4–5 range). */
export const RUNAWAY_ATTEMPT_LIMIT = 5;

/** Smallest scale "Нет" shrinks to, so it never collapses to nothing. */
export const MIN_NO_SCALE = 0.45;

/** Multiplicative shrink applied to "Нет" per attempt. */
export const NO_SHRINK_FACTOR = 0.82;

/** Linear growth added to "Да" per attempt. */
export const YES_GROWTH_STEP = 0.18;

/** Upper bound on the "Да" growth factor. */
export const MAX_YES_SCALE = 2;

/**
 * Events the component binds to trigger an escape. Both `pointerdown` and
 * `touchstart` fire *before* `click`, so on touch devices the button moves away
 * before the tap can register as a click (Requirement 6.2). `mouseenter`
 * handles hover on pointer devices.
 */
export const RUNAWAY_EVADE_EVENTS = ['pointerdown', 'touchstart', 'mouseenter'] as const;

/** Offset of the runaway button within its container, in pixels. */
export interface RunawayPosition {
  x: number;
  y: number;
}

/** Snapshot of the runaway interaction state. */
export interface RunawayState {
  /** How many times the guest has tried to hit "Нет". */
  attempts: number;
  /** Current scale of the "Нет" button (shrinks toward {@link MIN_NO_SCALE}). */
  noScale: number;
  /** Current scale of the "Да" button (grows toward {@link MAX_YES_SCALE}). */
  yesScale: number;
  /** Whether "Нет" has been removed (attempt limit reached). */
  noHidden: boolean;
  /** Current offset of "Нет" inside its container. */
  position: RunawayPosition;
}

/** Measured box used to keep the runaway button inside its container. */
export interface ContainerBox {
  containerWidth: number;
  containerHeight: number;
  buttonWidth: number;
  buttonHeight: number;
}

/** Clamp a (possibly out-of-range) random value into [0, 1). */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value >= 1) return 0.999999;
  return value;
}

/** Initial state: nothing tried yet, both buttons at their natural size. */
export function initialRunawayState(): RunawayState {
  return {
    attempts: 0,
    noScale: 1,
    yesScale: 1,
    noHidden: false,
    position: { x: 0, y: 0 },
  };
}

/**
 * Scale of "Нет" after `attempts` tries: shrinks multiplicatively but never
 * below {@link MIN_NO_SCALE}.
 */
export function computeNoScale(attempts: number): number {
  return Math.max(MIN_NO_SCALE, NO_SHRINK_FACTOR ** Math.max(0, attempts));
}

/**
 * Growth factor for "Да" after `attempts` tries on "Нет" (Requirement 6.2):
 * grows linearly from 1, capped at {@link MAX_YES_SCALE}.
 */
export function computeYesScale(attempts: number): number {
  return Math.min(MAX_YES_SCALE, 1 + Math.max(0, attempts) * YES_GROWTH_STEP);
}

/**
 * Whether "Нет" should be hidden after `attempts` tries (Requirement 6.3): true
 * once attempts reach `limit`.
 */
export function isNoHidden(attempts: number, limit: number = RUNAWAY_ATTEMPT_LIMIT): boolean {
  return attempts >= limit;
}

/**
 * Pick a random position for "Нет" that keeps it fully inside its container
 * (Requirement 6.2). `rng` is injectable so tests are deterministic.
 */
export function computeRunawayPosition(
  box: ContainerBox,
  rng: () => number = Math.random,
): RunawayPosition {
  const maxX = Math.max(0, box.containerWidth - box.buttonWidth);
  const maxY = Math.max(0, box.containerHeight - box.buttonHeight);
  return {
    x: Math.round(clamp01(rng()) * maxX),
    y: Math.round(clamp01(rng()) * maxY),
  };
}

/**
 * Apply one escape attempt and return the next state (pure transition).
 *
 * Increments the attempt counter, shrinks "Нет" and grows "Да" from the new
 * count, and moves "Нет" to a fresh random spot — unless the limit is reached,
 * in which case "Нет" is hidden and left where it was.
 */
export function registerRunawayAttempt(
  state: RunawayState,
  box: ContainerBox,
  rng: () => number = Math.random,
  limit: number = RUNAWAY_ATTEMPT_LIMIT,
): RunawayState {
  const attempts = state.attempts + 1;
  const noHidden = isNoHidden(attempts, limit);
  return {
    attempts,
    noScale: computeNoScale(attempts),
    yesScale: computeYesScale(attempts),
    noHidden,
    position: noHidden ? state.position : computeRunawayPosition(box, rng),
  };
}
