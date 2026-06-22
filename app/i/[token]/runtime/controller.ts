/**
 * Pure runtime helpers for the invitation scenario client (task 7.2).
 *
 * This module holds the *framework-independent* logic the client runtime
 * ({@link InvitationRuntime}) relies on, kept free of React/DOM so it can be
 * unit-tested directly:
 *
 *  - {@link INITIAL_MUTED} — background music is OFF by default (Requirement
 *    5.6: autoplay is blocked in messenger in-app browsers, so the guest opts
 *    in via the mute/unmute control).
 *  - {@link LOADING_MS} — duration of the intro loading screen shown before the
 *    first scenario screen (Requirement 5.1: 1–1.5 s).
 *  - {@link substitute} / {@link buildScreenVars} — `{{переменная}}`
 *    substitution from the author's data and the guest's accumulated answers,
 *    used to render screen texts.
 *  - {@link dispatchAction} — drives a {@link ScenarioEngine} from a screen
 *    action and reports the resulting screen state, so a UI action provably
 *    moves the engine (Requirement 5.3 transitions / 5.4 forks).
 *
 * Rendering, animated transitions (Framer Motion `AnimatePresence`) and the
 * mute control live in the `.tsx` components; this file is their pure core.
 */
import type { ScenarioEngine } from '@/lib/scenario/engine';
import type { GuestContext } from '@/templates/types';

/**
 * Background music starts muted (Requirement 5.6). Messengers block autoplay,
 * so the guest must explicitly unmute via the mute/unmute control.
 */
export const INITIAL_MUTED = true;

/**
 * Duration (ms) of the intro loading screen shown before the first scenario
 * screen (Requirement 5.1 — 1–1.5 s). Picked at the midpoint of the range.
 */
export const LOADING_MS = 1200;

/** Matches `{{ ключ }}` placeholders (with optional surrounding whitespace). */
const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Substitute `{{переменная}}` placeholders in `text` from `vars`. Unknown keys
 * are replaced with an empty string so half-filled drafts never leak raw
 * `{{...}}` markup to the guest. Returns the input unchanged when it has no
 * placeholders.
 */
export function substitute(
  text: string | undefined,
  vars: Record<string, unknown>,
): string {
  if (!text) return '';
  return text.replace(PLACEHOLDER, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Build the variable bag used for `{{...}}` substitution on a screen: the
 * author's `{{переменные}}` overlaid with the guest's accumulated answers
 * (so a chosen place/time can appear on later screens). Guest answers win on
 * key collisions because they are the most recent, guest-specific values.
 */
export function buildScreenVars(
  data: Record<string, unknown>,
  context: Pick<GuestContext, 'answers'>,
): Record<string, unknown> {
  return { ...data, ...context.answers };
}

/** Result of driving the engine with an action. */
export interface DispatchResult {
  /** Id of the screen the engine is on after the action. */
  screenId: string;
  /** Whether that screen is the final one. */
  isFinal: boolean;
  /** Whether the action actually moved the engine to another screen. */
  moved: boolean;
}

/**
 * Drive a {@link ScenarioEngine} from a screen action and report the resulting
 * screen state (Requirement 5.3 transitions / 5.4 forks). A thin, pure wrapper
 * over {@link ScenarioEngine.dispatch} that the React runtime calls and then
 * mirrors into component state to trigger an animated transition.
 *
 * Actions without an outgoing transition on the current screen (e.g. the
 * runaway "Нет" button, whose behaviour is task 7.3) leave the screen unchanged
 * and report `moved: false`.
 */
export function dispatchAction(
  engine: ScenarioEngine,
  action: string,
  payload?: unknown,
): DispatchResult {
  const moved = engine.dispatch(action, payload);
  return {
    screenId: engine.current.id,
    isFinal: engine.isFinal(),
    moved,
  };
}
