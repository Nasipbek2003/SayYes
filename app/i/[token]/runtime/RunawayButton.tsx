'use client';

/**
 * RunawayButton — the signature "Да / Нет" pair of Template 1 (task 7.3,
 * Requirements 6.2 / 6.3).
 *
 * The "Да" button is a normal accent button; the "Нет" button runs away. Each
 * time the guest tries to tap, hover or point at "Нет" it darts to a new random
 * spot inside the shared container and shrinks, while "Да" grows — both driven
 * by the same attempt counter. After {@link RUNAWAY_ATTEMPT_LIMIT} attempts
 * "Нет" disappears, leaving only "Да".
 *
 * The state machine lives in {@link runaway} (pure, unit-tested); this component
 * is the thin DOM wrapper that:
 *  - measures the container/button to keep "Нет" inside bounds,
 *  - binds escape to `pointerdown`/`touchstart`/`mouseenter` so on touch devices
 *    the button escapes *before* a `click` lands (Requirement 6.2),
 *  - calls `onYes` when (and only when) the guest taps "Да".
 *
 * `onYes` typically dispatches the engine's "yes" action (e.g. `click:yes`).
 */
import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import {
  type ContainerBox,
  type RunawayState,
  RUNAWAY_ATTEMPT_LIMIT,
  initialRunawayState,
  registerRunawayAttempt,
} from './runaway';

export interface RunawayButtonProps {
  /** Label for the accent "Да" button. */
  yesLabel?: string;
  /** Label for the runaway "Нет" button. */
  noLabel?: string;
  /** Called when the guest taps "Да". */
  onYes: () => void;
  /** Attempts before "Нет" disappears (defaults to {@link RUNAWAY_ATTEMPT_LIMIT}). */
  attemptLimit?: number;
}

/** "Да / Нет" pair where "Нет" evades the guest (Requirements 6.2 / 6.3). */
export function RunawayButton({
  yesLabel = 'Да!',
  noLabel = 'Нет',
  onYes,
  attemptLimit = RUNAWAY_ATTEMPT_LIMIT,
}: RunawayButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const noRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<RunawayState>(initialRunawayState);

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
      // Prevent the synthesized click / default tap behaviour on touch.
      event.preventDefault?.();
      setState((prev) =>
        prev.noHidden ? prev : registerRunawayAttempt(prev, measure(), Math.random, attemptLimit),
      );
    },
    [measure, attemptLimit],
  );

  return (
    <div ref={containerRef} className="runaway" data-attempts={state.attempts}>
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

      {state.noHidden ? null : (
        <motion.button
          ref={noRef}
          type="button"
          className="screen__button runaway__no"
          data-runaway-no
          animate={{ x: state.position.x, y: state.position.y, scale: state.noScale }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onPointerDown={evade}
          onTouchStart={evade}
          onMouseEnter={evade}
          // If a click somehow lands, evade rather than accept a "no".
          onClick={evade}
        >
          {noLabel}
        </motion.button>
      )}
    </div>
  );
}
