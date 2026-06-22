/**
 * Tests for the runaway "Нет" button logic (task 7.3, Requirements 6.2 / 6.3).
 *
 * The runaway behaviour is implemented as a pure state machine in `runaway.ts`
 * (the React component is a thin DOM wrapper around it), so these tests drive
 * the logic directly — matching the project's node test env and the
 * controller-style "pure core, thin component" split. They cover:
 *  - the attempt counter and the limit at which "Нет" disappears (Req 6.3);
 *  - "Да" growing while "Нет" shrinks on each attempt (Req 6.2);
 *  - the runaway position staying inside its container (Req 6.2);
 *  - the touch contract: escape binds to events that fire before `click`, so on
 *    touch devices the button moves before a tap can register (Req 6.2).
 *
 * **Validates: Requirements 6.2, 6.3**
 */
import { describe, expect, it } from 'vitest';

import {
  type ContainerBox,
  MAX_YES_SCALE,
  MIN_NO_SCALE,
  RUNAWAY_ATTEMPT_LIMIT,
  RUNAWAY_EVADE_EVENTS,
  computeNoScale,
  computeRunawayPosition,
  computeYesScale,
  initialRunawayState,
  isNoHidden,
  registerRunawayAttempt,
} from './runaway';

const BOX: ContainerBox = {
  containerWidth: 300,
  containerHeight: 200,
  buttonWidth: 80,
  buttonHeight: 40,
};

/** Deterministic RNG cycling through given values. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('runaway initial state', () => {
  it('starts with no attempts, both buttons at natural size, visible', () => {
    const state = initialRunawayState();
    expect(state.attempts).toBe(0);
    expect(state.noScale).toBe(1);
    expect(state.yesScale).toBe(1);
    expect(state.noHidden).toBe(false);
    expect(state.position).toEqual({ x: 0, y: 0 });
  });
});

describe('attempt limit (Requirement 6.3)', () => {
  it('hides "Нет" exactly when attempts reach the limit', () => {
    expect(isNoHidden(RUNAWAY_ATTEMPT_LIMIT - 1)).toBe(false);
    expect(isNoHidden(RUNAWAY_ATTEMPT_LIMIT)).toBe(true);
    expect(isNoHidden(RUNAWAY_ATTEMPT_LIMIT + 1)).toBe(true);
  });

  it('keeps "Нет" visible until the limit, then removes it', () => {
    let state = initialRunawayState();
    const rng = seqRng([0.5]);
    for (let i = 1; i < RUNAWAY_ATTEMPT_LIMIT; i += 1) {
      state = registerRunawayAttempt(state, BOX, rng, RUNAWAY_ATTEMPT_LIMIT);
      expect(state.attempts).toBe(i);
      expect(state.noHidden).toBe(false);
    }
    // The limit-th attempt removes "Нет".
    state = registerRunawayAttempt(state, BOX, rng, RUNAWAY_ATTEMPT_LIMIT);
    expect(state.attempts).toBe(RUNAWAY_ATTEMPT_LIMIT);
    expect(state.noHidden).toBe(true);
  });

  it('respects a custom (4) attempt limit', () => {
    let state = initialRunawayState();
    const rng = seqRng([0.3, 0.7]);
    for (let i = 0; i < 3; i += 1) {
      state = registerRunawayAttempt(state, BOX, rng, 4);
      expect(state.noHidden).toBe(false);
    }
    state = registerRunawayAttempt(state, BOX, rng, 4);
    expect(state.noHidden).toBe(true);
  });
});

describe('"Да" grows while "Нет" shrinks (Requirement 6.2)', () => {
  it('increases yes scale and decreases no scale monotonically per attempt', () => {
    let state = initialRunawayState();
    const rng = seqRng([0.5]);
    let prevYes = state.yesScale;
    let prevNo = state.noScale;
    for (let i = 0; i < RUNAWAY_ATTEMPT_LIMIT - 1; i += 1) {
      state = registerRunawayAttempt(state, BOX, rng, RUNAWAY_ATTEMPT_LIMIT);
      expect(state.yesScale).toBeGreaterThan(prevYes);
      expect(state.noScale).toBeLessThan(prevNo);
      prevYes = state.yesScale;
      prevNo = state.noScale;
    }
  });

  it('clamps no scale at the floor and yes scale at the cap', () => {
    expect(computeNoScale(100)).toBe(MIN_NO_SCALE);
    expect(computeYesScale(100)).toBe(MAX_YES_SCALE);
    // Guards against negative inputs.
    expect(computeNoScale(-5)).toBe(1);
    expect(computeYesScale(-5)).toBe(1);
  });
});

describe('runaway position stays inside the container (Requirement 6.2)', () => {
  it('never places the button outside the available area', () => {
    const rng = seqRng([0, 0.25, 0.5, 0.75, 0.999, 1]);
    for (let i = 0; i < 12; i += 1) {
      const pos = computeRunawayPosition(BOX, rng);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(BOX.containerWidth - BOX.buttonWidth);
      expect(pos.y).toBeLessThanOrEqual(BOX.containerHeight - BOX.buttonHeight);
    }
  });

  it('does not move the button once it is hidden', () => {
    let state = initialRunawayState();
    const rng = seqRng([0.9]);
    for (let i = 0; i < RUNAWAY_ATTEMPT_LIMIT; i += 1) {
      state = registerRunawayAttempt(state, BOX, rng, RUNAWAY_ATTEMPT_LIMIT);
    }
    const hiddenPos = state.position;
    const after = registerRunawayAttempt(state, BOX, rng, RUNAWAY_ATTEMPT_LIMIT);
    expect(after.position).toEqual(hiddenPos);
  });

  it('handles a container smaller than the button (clamps to 0)', () => {
    const tight: ContainerBox = {
      containerWidth: 40,
      containerHeight: 20,
      buttonWidth: 80,
      buttonHeight: 40,
    };
    const pos = computeRunawayPosition(tight, seqRng([0.9]));
    expect(pos).toEqual({ x: 0, y: 0 });
  });
});

describe('touch contract (Requirement 6.2)', () => {
  it('escapes on events that fire before a click on touch devices', () => {
    // pointerdown / touchstart precede the synthesized click, so binding these
    // makes "Нет" run away before a tap can land on it.
    expect(RUNAWAY_EVADE_EVENTS).toContain('pointerdown');
    expect(RUNAWAY_EVADE_EVENTS).toContain('touchstart');
  });
});
