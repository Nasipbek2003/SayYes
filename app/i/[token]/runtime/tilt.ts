/**
 * Pure logic for the «Наклони телефон» tilt-card puzzle (шаблон `tilt-card`).
 *
 * Mirrors the split used by {@link ../runaway} — every bit of maths here is
 * framework-independent (no DOM/React) so it is directly unit-testable; the
 * React component ({@link TiltCard}) only reads device sensors / pointer
 * events, feeds them through these pure functions on every animation frame,
 * and mirrors the result into a 3D card + a "glint" that slides across its
 * surface like a holographic sticker.
 *
 * ## The puzzle
 * The glint's on-card position is the sum of two things:
 *  - an autonomous, deterministic **drift** ({@link glintDrift}) — a slow
 *    Lissajous-style wander so the glint is never simply sitting still;
 *  - the guest's live **tilt** (device orientation, or pointer/touch on
 *    desktop/denied-permission) scaled by {@link combineGlintPosition}.
 *
 * The guest must tilt the phone (or drag a finger/mouse) to counter the drift
 * and hold the combined position inside the centre zone
 * ({@link isGlintCentered}) for {@link TILT_HOLD_MS} — "Поймай блеск в центр
 * карточки, чтобы открыть приглашение". {@link updateTiltPuzzleState} is the
 * small hold-timer state machine, same shape as `registerRunawayAttempt`.
 */

/** A 2D vector normalised to roughly [-1, 1] on each axis. */
export interface TiltVector {
  x: number;
  y: number;
}

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Normalise `DeviceOrientationEvent.beta/gamma` (degrees) into a
 * {@link TiltVector}. `gamma` (left/right tilt, -90..90) drives `x`; `beta`
 * (front/back tilt) drives `y`. Values beyond `maxAngle` saturate at ±1 so a
 * deliberate tilt reaches the full range without needing to nearly invert the
 * phone.
 */
export function normalizeOrientation(
  beta: number | null | undefined,
  gamma: number | null | undefined,
  maxAngle = 45,
): TiltVector {
  const safeMax = maxAngle > 0 ? maxAngle : 45;
  return {
    x: clamp((gamma ?? 0) / safeMax, -1, 1),
    y: clamp((beta ?? 0) / safeMax, -1, 1),
  };
}

/**
 * Normalise a pointer/touch position inside a container (desktop mouse or
 * touch-drag fallback when there is no gyroscope / permission was denied) into
 * the same {@link TiltVector} shape as {@link normalizeOrientation}: centre of
 * the container is `(0, 0)`, edges are `±1`.
 */
export function normalizePointerOffset(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): TiltVector {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp((offsetX / width) * 2 - 1, -1, 1),
    y: clamp((offsetY / height) * 2 - 1, -1, 1),
  };
}

/**
 * 3D rotation applied to the card from the current tilt (Requirement: light
 * glides over the surface like a holographic postcard). Tilting right
 * (`x > 0`) rotates the card around its vertical axis; tilting the top away
 * (`y < 0`, phone leaning back) rotates it around its horizontal axis.
 */
export function computeCardRotation(
  tilt: TiltVector,
  maxDeg = 16,
): { rotateX: number; rotateY: number } {
  return {
    rotateX: clamp(-tilt.y * maxDeg, -maxDeg, maxDeg),
    rotateY: clamp(tilt.x * maxDeg, -maxDeg, maxDeg),
  };
}

/**
 * Autonomous wander of the glint's base position, in percent offset from the
 * card's centre. Deterministic function of elapsed time (not `Math.random`)
 * so the same instant always produces the same drift — keeps the puzzle fair
 * and this function unit-testable.
 */
export function glintDrift(elapsedMs: number, amplitudePct = 22): TiltVector {
  const t = elapsedMs / 1000;
  return {
    x: Math.sin(t * 0.62) * amplitudePct,
    y: Math.cos(t * 0.45) * amplitudePct * 0.8,
  };
}

/**
 * Combine the autonomous {@link glintDrift} with the guest's live tilt into the
 * glint's final position (percent offset from centre). The guest counters the
 * drift by tilting the opposite way; `tiltWeightPct` controls how much a full
 * tilt (`±1`) can move the glint — it must be large enough that the guest can
 * always cancel out `amplitudePct` of drift with a comfortable tilt.
 */
export function combineGlintPosition(
  drift: TiltVector,
  tilt: TiltVector,
  tiltWeightPct = 55,
  clampPct = 48,
): TiltVector {
  return {
    x: clamp(drift.x + tilt.x * tiltWeightPct, -clampPct, clampPct),
    y: clamp(drift.y + tilt.y * tiltWeightPct, -clampPct, clampPct),
  };
}

/** Whether the glint's current position counts as "centred" on the card. */
export function isGlintCentered(position: TiltVector, thresholdPct = 9): boolean {
  return Math.abs(position.x) <= thresholdPct && Math.abs(position.y) <= thresholdPct;
}

/** How long (ms) the glint must stay centred to "catch" it and open the invite. */
export const TILT_HOLD_MS = 900;

/** Hold-timer state for the centring puzzle (mirrors {@link RunawayState}'s shape). */
export interface TiltPuzzleState {
  /** Timestamp the glint became centred, or `null` while it's off-centre. */
  centeredSinceMs: number | null;
  /** Progress toward catching it, 0–1 (drives the visual ring/glow). */
  progress: number;
  /** True once held centred for the full {@link TILT_HOLD_MS}. */
  solved: boolean;
}

/** Initial puzzle state: nothing held yet. */
export function initialTiltPuzzleState(): TiltPuzzleState {
  return { centeredSinceMs: null, progress: 0, solved: false };
}

/**
 * Pure hold-timer transition, called every animation frame with the current
 * centred/not-centred reading and a timestamp. Losing centring resets progress
 * to 0 (no partial credit) so the puzzle stays an active "catch and hold", not
 * a cumulative meter. Once solved, the state is sticky (never un-solves).
 */
export function updateTiltPuzzleState(
  state: TiltPuzzleState,
  centered: boolean,
  nowMs: number,
  holdMs: number = TILT_HOLD_MS,
): TiltPuzzleState {
  if (state.solved) return state;
  if (!centered) {
    return state.centeredSinceMs === null ? state : initialTiltPuzzleState();
  }
  const since = state.centeredSinceMs ?? nowMs;
  const progress = clamp((nowMs - since) / Math.max(1, holdMs), 0, 1);
  return { centeredSinceMs: since, progress, solved: progress >= 1 };
}

/** A single decorative particle's randomised, tilt-reactive layout. */
export interface TiltParticleSpec {
  id: number;
  /** Horizontal position as a percentage of the container width (0–100). */
  leftPct: number;
  /** Vertical position as a percentage of the container height (0–100). */
  topPct: number;
  /** Font size in rem. */
  sizeRem: number;
  /** Parallax strength (0–1): how much the particle shifts with tilt. */
  depth: number;
}

/**
 * Build `count` randomised particle specs (pure; `rng` injectable for tests).
 * Depth varies per particle so the tilt-parallax reads as actual depth rather
 * than a flat sheet moving together.
 */
export function buildTiltParticles(
  count: number,
  rng: () => number = Math.random,
): TiltParticleSpec[] {
  const particles: TiltParticleSpec[] = [];
  for (let id = 0; id < Math.max(0, count); id += 1) {
    particles.push({
      id,
      leftPct: Math.round(rng() * 100),
      topPct: Math.round(rng() * 100),
      sizeRem: 0.7 + rng() * 0.9,
      depth: 0.3 + rng() * 0.7,
    });
  }
  return particles;
}
