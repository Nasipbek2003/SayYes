/**
 * Barrel for the reusable scenario animation components (task 7.3).
 *
 * These are the special interactive elements described in the design doc
 * ("Components and Interfaces → 3. Специальные интерактивные элементы"):
 *  - {@link RunawayButton} — the runaway "Нет" / growing "Да" pair (Req 6.2/6.3),
 *  - {@link Confetti} — full-screen celebration on agreement/final screens,
 *  - {@link FloatingHearts} — ambient background hearts,
 *  - {@link Countdown} — live countdown to the event date (Template 3).
 *
 * Their integration into concrete template screens is tasks 8.x; this barrel
 * lets `ScreenRenderer`/screen components import them from one place.
 */
export { RunawayButton, resolveNoBehavior, NO_BEHAVIORS } from './RunawayButton';
export type { RunawayButtonProps, NoBehavior } from './RunawayButton';
export { Confetti } from './Confetti';
export type { ConfettiProps } from './Confetti';
export { FloatingHearts, buildHearts } from './FloatingHearts';
export type { FloatingHeartsProps, HeartSpec } from './FloatingHearts';
export { Countdown } from './Countdown';
export type { CountdownProps } from './Countdown';
