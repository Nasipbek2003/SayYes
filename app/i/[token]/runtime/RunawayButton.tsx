'use client';

/**
 * RunawayButton — the signature "Да / Нет" pair of the romantic templates
 * (task 7.3, Requirements 6.2 / 6.3).
 *
 * The "Да" button is a normal accent button; the "Нет" button evades the guest.
 * The *way* it evades is configurable via {@link RunawayButtonProps.behavior},
 * chosen by the author when editing the template:
 *
 *  - `runaway`  — darts to a random spot inside the container and shrinks each
 *                 attempt, disappearing after the attempt limit (classic).
 *  - `vanish`   — evaporates on the first touch: fades out, blurs and shrinks
 *                 to nothing ("испаряется").
 *  - `teleport` — instantly blinks to a new random spot (no smooth glide).
 *  - `shrink`   — stays put but shrinks each attempt until it's gone.
 *  - `spin`     — flies away spinning while it darts around.
 *
 * The attempt counter / position / scale come from the pure, unit-tested state
 * machine in {@link runaway}; this component is the DOM wrapper that measures
 * the container, binds escape to pre-click events (so it escapes before a tap
 * lands on touch) and maps the state to behavior-specific motion.
 */
import { useCallback, useRef, useState } from 'react';
import { motion, type TargetAndTransition, type Transition } from 'framer-motion';

import {
  type ContainerBox,
  type RunawayState,
  RUNAWAY_ATTEMPT_LIMIT,
  initialRunawayState,
  registerRunawayAttempt,
} from './runaway';

/** Available evade behaviors for the "Нет" button (author-selectable). */
export type NoBehavior = 'runaway' | 'vanish' | 'teleport' | 'shrink' | 'spin';

/** All behaviors, in the order shown to the author in the editor dropdown. */
export const NO_BEHAVIORS: NoBehavior[] = ['runaway', 'vanish', 'teleport', 'shrink', 'spin'];

/** Coerce an arbitrary author-data value into a valid behavior (default runaway). */
export function resolveNoBehavior(value: unknown): NoBehavior {
  return typeof value === 'string' && (NO_BEHAVIORS as string[]).includes(value)
    ? (value as NoBehavior)
    : 'runaway';
}

export interface RunawayButtonProps {
  /** Label for the accent "Да" button. */
  yesLabel?: string;
  /** Label for the runaway "Нет" button. */
  noLabel?: string;
  /** Called when the guest taps "Да". */
  onYes: () => void;
  /** Attempts before "Нет" disappears (defaults to {@link RUNAWAY_ATTEMPT_LIMIT}). */
  attemptLimit?: number;
  /** How the "Нет" button evades (defaults to `runaway`). */
  behavior?: NoBehavior;
}

/** "Да / Нет" pair where "Нет" evades the guest (Requirements 6.2 / 6.3). */
export function RunawayButton({
  yesLabel = 'Да!',
  noLabel = 'Нет',
  onYes,
  attemptLimit = RUNAWAY_ATTEMPT_LIMIT,
  behavior = 'runaway',
}: RunawayButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const noRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<RunawayState>(initialRunawayState);

  // "Испарение" завершается с первой попытки; остальные используют свой лимит.
  const effectiveLimit = behavior === 'vanish' ? 1 : attemptLimit;

  /** Read the live container/button box so "Нет" stays inside its bounds. */
  const measure = useCallback((): ContainerBox => {
    const container = containerRef.current;
    const button = noRef.current;
    return {
      containerWidth: container?.clientWidth ?? 0,
      containerHeight: container?.clientHeight ?? 0,
      buttonWidth: button?.offsetWidth ?? 0,
      buttonHeight: button?.offsetHeight ?? 0,
    };
  }, []);

  /**
   * Escape handler. Fired by pointerdown/touchstart/mouseenter — i.e. before a
   * click can land on touch devices — so "Нет" never actually gets "pressed".
   */
  const evade = useCallback(
    (event: { preventDefault?: () => void }) => {
      event.preventDefault?.();
      setState((prev) =>
        prev.noHidden ? prev : registerRunawayAttempt(prev, measure(), Math.random, effectiveLimit),
      );
    },
    [measure, effectiveLimit],
  );

  // "Испарение" остаётся в DOM, чтобы доиграть анимацию исчезновения; остальные
  // поведения убирают кнопку, как только достигнут лимит.
  const evaporated = behavior === 'vanish' && state.attempts > 0;
  const showNo = behavior === 'vanish' ? true : !state.noHidden;

  let noAnimate: TargetAndTransition;
  let noTransition: Transition = { type: 'spring', stiffness: 500, damping: 30 };

  switch (behavior) {
    case 'shrink':
      // Стоит на месте и сжимается до исчезновения.
      noAnimate = { x: 0, y: 0, scale: state.noScale };
      break;
    case 'teleport':
      // Мгновенный «телепорт» с короткой вспышкой прозрачности.
      noAnimate = { x: state.position.x, y: state.position.y, scale: state.noScale, opacity: [0.15, 1] };
      noTransition = { duration: 0.14, ease: 'easeOut' };
      break;
    case 'spin':
      // Улетает кувырком, накручивая обороты с каждой попыткой.
      noAnimate = {
        x: state.position.x,
        y: state.position.y,
        scale: state.noScale,
        rotate: state.attempts * 170,
      };
      noTransition = { type: 'spring', stiffness: 320, damping: 18 };
      break;
    case 'vanish':
      // Испаряется: проявляется → размывается, сжимается и тает.
      noAnimate = evaporated
        ? { opacity: 0, scale: 0.2, filter: 'blur(10px)' }
        : { opacity: 1, scale: 1, filter: 'blur(0px)' };
      noTransition = { duration: 0.55, ease: 'easeOut' };
      break;
    default:
      // Классический побег: случайная позиция + сжатие.
      noAnimate = { x: state.position.x, y: state.position.y, scale: state.noScale };
  }

  return (
    <div ref={containerRef} className="runaway" data-attempts={state.attempts} data-no-behavior={behavior}>
      <motion.button
        type="button"
        className="screen__button runaway__yes"
        data-action="click:yes"
        animate={{ scale: state.yesScale }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        onClick={onYes}
      >
        {yesLabel}
      </motion.button>

      {showNo ? (
        <motion.button
          ref={noRef}
          type="button"
          className="screen__button runaway__no"
          data-runaway-no
          style={evaporated ? { pointerEvents: 'none' } : undefined}
          animate={noAnimate}
          transition={noTransition}
          onPointerDown={evade}
          onTouchStart={evade}
          onMouseEnter={evade}
          // If a click somehow lands, evade rather than accept a "no".
          onClick={evade}
        >
          {noLabel}
        </motion.button>
      ) : null}
    </div>
  );
}
