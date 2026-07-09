/**
 * Tests for the tilt-card puzzle pure logic (шаблон `tilt-card` / «Наклони
 * телефон»).
 */
import { describe, expect, it } from 'vitest';

import {
  buildTiltParticles,
  clamp,
  combineGlintPosition,
  computeCardRotation,
  glintDrift,
  initialTiltPuzzleState,
  isGlintCentered,
  normalizeOrientation,
  normalizePointerOffset,
  TILT_HOLD_MS,
  updateTiltPuzzleState,
} from './tilt';

describe('clamp', () => {
  it('keeps values within range unchanged', () => {
    expect(clamp(0.4, -1, 1)).toBe(0.4);
  });

  it('clamps below the minimum', () => {
    expect(clamp(-5, -1, 1)).toBe(-1);
  });

  it('clamps above the maximum', () => {
    expect(clamp(5, -1, 1)).toBe(1);
  });

  it('treats NaN as the minimum', () => {
    expect(clamp(Number.NaN, -1, 1)).toBe(-1);
  });
});

describe('normalizeOrientation', () => {
  it('maps gamma/beta at maxAngle to ±1', () => {
    expect(normalizeOrientation(45, 45, 45)).toEqual({ x: 1, y: 1 });
    expect(normalizeOrientation(-45, -45, 45)).toEqual({ x: -1, y: -1 });
  });

  it('saturates beyond maxAngle instead of overshooting', () => {
    expect(normalizeOrientation(90, 90, 45)).toEqual({ x: 1, y: 1 });
  });

  it('treats missing readings as centred (0)', () => {
    expect(normalizeOrientation(null, undefined, 45)).toEqual({ x: 0, y: 0 });
  });

  it('falls back to a sane maxAngle when given a non-positive one', () => {
    expect(normalizeOrientation(45, 0, 0)).toEqual({ x: 0, y: 1 });
  });
});

describe('normalizePointerOffset', () => {
  it('maps the container centre to (0, 0)', () => {
    expect(normalizePointerOffset(50, 50, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  it('maps corners to ±1', () => {
    expect(normalizePointerOffset(0, 0, 100, 100)).toEqual({ x: -1, y: -1 });
    expect(normalizePointerOffset(100, 100, 100, 100)).toEqual({ x: 1, y: 1 });
  });

  it('returns centre for a zero-sized container (no NaN/Infinity)', () => {
    expect(normalizePointerOffset(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('computeCardRotation', () => {
  it('rotates right when tilted right (x > 0)', () => {
    const { rotateY } = computeCardRotation({ x: 1, y: 0 }, 16);
    expect(rotateY).toBe(16);
  });

  it('rotates the other way when leaning back (y < 0)', () => {
    const { rotateX } = computeCardRotation({ x: 0, y: -1 }, 16);
    expect(rotateX).toBe(16);
  });

  it('stays within ±maxDeg for any tilt in range', () => {
    const { rotateX, rotateY } = computeCardRotation({ x: 1, y: 1 }, 20);
    expect(Math.abs(rotateX)).toBeLessThanOrEqual(20);
    expect(Math.abs(rotateY)).toBeLessThanOrEqual(20);
  });
});

describe('glintDrift', () => {
  it('is deterministic for a given timestamp', () => {
    expect(glintDrift(1234)).toEqual(glintDrift(1234));
  });

  it('stays within the given amplitude', () => {
    for (let ms = 0; ms < 20000; ms += 137) {
      const { x, y } = glintDrift(ms, 22);
      expect(Math.abs(x)).toBeLessThanOrEqual(22);
      expect(Math.abs(y)).toBeLessThanOrEqual(22 * 0.8 + 1e-9);
    }
  });
});

describe('combineGlintPosition', () => {
  it('lets a full opposite tilt cancel out drift within the clamp range', () => {
    const drift = { x: 20, y: 0 };
    const tilt = { x: -1, y: 0 };
    const result = combineGlintPosition(drift, tilt, 55, 48);
    expect(result.x).toBeCloseTo(20 - 55, 5);
  });

  it('clamps the combined position to the given bound', () => {
    const result = combineGlintPosition({ x: 100, y: 100 }, { x: 1, y: 1 }, 55, 48);
    expect(result.x).toBe(48);
    expect(result.y).toBe(48);
  });
});

describe('isGlintCentered', () => {
  it('is true within the threshold', () => {
    expect(isGlintCentered({ x: 4, y: -4 }, 9)).toBe(true);
  });

  it('is false outside the threshold on either axis', () => {
    expect(isGlintCentered({ x: 10, y: 0 }, 9)).toBe(false);
    expect(isGlintCentered({ x: 0, y: 10 }, 9)).toBe(false);
  });
});

describe('tilt puzzle hold-timer state machine', () => {
  it('starts uncentred and unsolved', () => {
    const state = initialTiltPuzzleState();
    expect(state).toEqual({ centeredSinceMs: null, progress: 0, solved: false });
  });

  it('starts the hold timer the instant centring begins', () => {
    const s1 = updateTiltPuzzleState(initialTiltPuzzleState(), true, 1000);
    expect(s1.centeredSinceMs).toBe(1000);
    expect(s1.progress).toBe(0);
    expect(s1.solved).toBe(false);
  });

  it('resets progress (no partial credit) when centring is lost', () => {
    const held = updateTiltPuzzleState(initialTiltPuzzleState(), true, 1000);
    const midway = updateTiltPuzzleState(held, true, 1000 + TILT_HOLD_MS / 2);
    expect(midway.progress).toBeCloseTo(0.5, 1);

    const lost = updateTiltPuzzleState(midway, false, 1000 + TILT_HOLD_MS / 2 + 10);
    expect(lost).toEqual(initialTiltPuzzleState());
  });

  it('solves once held centred for the full duration', () => {
    const held = updateTiltPuzzleState(initialTiltPuzzleState(), true, 0);
    const solved = updateTiltPuzzleState(held, true, TILT_HOLD_MS);
    expect(solved.solved).toBe(true);
    expect(solved.progress).toBe(1);
  });

  it('stays solved (sticky) even if centring is later lost', () => {
    const held = updateTiltPuzzleState(initialTiltPuzzleState(), true, 0);
    const solved = updateTiltPuzzleState(held, true, TILT_HOLD_MS);
    const afterLoss = updateTiltPuzzleState(solved, false, TILT_HOLD_MS + 500);
    expect(afterLoss).toBe(solved);
  });
});

describe('buildTiltParticles', () => {
  it('builds the requested number of particles with unique ids', () => {
    const particles = buildTiltParticles(15, () => 0.5);
    expect(particles).toHaveLength(15);
    expect(new Set(particles.map((p) => p.id)).size).toBe(15);
  });

  it('returns no particles for non-positive counts', () => {
    expect(buildTiltParticles(0)).toHaveLength(0);
    expect(buildTiltParticles(-2)).toHaveLength(0);
  });

  it('keeps every particle within its intended ranges', () => {
    const particles = buildTiltParticles(50);
    for (const p of particles) {
      expect(p.leftPct).toBeGreaterThanOrEqual(0);
      expect(p.leftPct).toBeLessThanOrEqual(100);
      expect(p.topPct).toBeGreaterThanOrEqual(0);
      expect(p.topPct).toBeLessThanOrEqual(100);
      expect(p.sizeRem).toBeGreaterThanOrEqual(0.7);
      expect(p.sizeRem).toBeLessThanOrEqual(1.6);
      expect(p.depth).toBeGreaterThanOrEqual(0.3);
      expect(p.depth).toBeLessThanOrEqual(1);
    }
  });
});
