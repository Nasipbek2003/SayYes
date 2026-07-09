'use client';

/**
 * TiltCard — «Наклони телефон» 📱 (шаблон `tilt-card`).
 *
 * A holographic-postcard 3D card: tilting the phone (or, as a graceful
 * fallback, dragging a mouse/finger over the card) makes a glint slide across
 * its surface and rocks the card in 3D, like a foil trading card. The guest's
 * task — «Поймай блеск в центр карточки, чтобы открыть приглашение» — is to
 * counter the glint's autonomous drift by tilting until it holds still in the
 * centre for a moment.
 *
 * All the maths (orientation → tilt vector, drift, combined glint position,
 * card rotation, hold-timer state machine) lives in the pure {@link tilt}
 * module so it is unit-testable without a DOM; this component is the thin DOM
 * layer: it owns the animation-frame loop, the sensor/pointer listeners and
 * the iOS permission gesture, and renders the result.
 *
 * ## Sensor strategy
 *  - **Primary**: `DeviceOrientationEvent` (gyroscope). iOS 13+ requires an
 *    explicit `requestPermission()` call from a user gesture, so the card
 *    starts in a "Наклони — или нажми, чтобы разрешить" prompt state; tapping
 *    it calls `requestPermission()` (Safari/iOS) if present, otherwise moves
 *    straight to listening (Android/desktop browsers expose the event with no
 *    permission gate).
 *  - **Fallback**: if permission is denied, the API doesn't exist, or no
 *    orientation events arrive within a short grace window (some desktop
 *    browsers "have" the API but never fire it), `pointermove`/`touchmove`
 *    over the card simulates the same tilt vector — the mouse plays the role
 *    of the gyroscope, so desktop visitors get the full effect.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { StickerMedia } from '@/app/components/StickerMedia';

import {
  buildTiltParticles,
  combineGlintPosition,
  computeCardRotation,
  glintDrift,
  initialTiltPuzzleState,
  isGlintCentered,
  normalizeOrientation,
  normalizePointerOffset,
  type TiltPuzzleState,
  type TiltVector,
  updateTiltPuzzleState,
} from './tilt';

/** How long (ms) to wait for a real orientation event before offering the fallback. */
const ORIENTATION_GRACE_MS = 1200;

/** `DeviceOrientationEvent` with the non-standard iOS permission gate. */
interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

/** Whether this browser needs an explicit gesture-triggered permission request. */
function needsOrientationPermission(): boolean {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  const ctor = DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
  return typeof ctor.requestPermission === 'function';
}

export interface TiltCardProps {
  /** Front image (photo/text card face); empty falls back to a heart glyph. */
  photo?: string;
  /** Heading rendered on the card face. */
  heading?: string;
  /** Body text rendered on the card face. */
  text?: string;
  /** Called once the guest holds the glint centred long enough to "catch" it. */
  onCaught: () => void;
  /** Number of ambient reactive particles (snow/hearts) behind the card. */
  particleCount?: number;
  /** Particle glyph. */
  particleGlyph?: string;
}

/** «Наклони телефон» — holographic tilt card with a catch-the-glint puzzle. */
export function TiltCard({
  photo,
  heading,
  text,
  onCaught,
  particleCount = 18,
  particleGlyph = '✨',
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  // Live tilt vector (from gyroscope or pointer fallback), read by the RAF loop
  // via a ref so listeners don't need to re-render on every sensor tick.
  const tiltRef = useRef<TiltVector>({ x: 0, y: 0 });

  // Whether we're actively pointer-dragging (desktop/touch fallback) — while
  // dragging we ignore any stray orientation events so the two inputs don't fight.
  const draggingRef = useRef(false);

  // Whether the guest has passed the (possibly no-op) permission gate and the
  // stage/animation loop should be live. Only iOS 13+ Safari actually needs a
  // gesture first; everywhere else this starts `true`.
  const [active, setActive] = useState(!needsOrientationPermission());
  // Whether we've fallen back to pointer/touch input instead of the gyroscope
  // (permission denied, API missing, or no orientation events ever arrived).
  const [usingFallback, setUsingFallback] = useState(false);
  const [render, setRender] = useState({
    rotateX: 0,
    rotateY: 0,
    glint: { x: 0, y: 0 } as TiltVector,
    puzzle: initialTiltPuzzleState() as TiltPuzzleState,
  });
  const solvedRef = useRef(false);

  const particles = useRef(buildTiltParticles(particleCount)).current;

  // --- Orientation listener -------------------------------------------------
  useEffect(() => {
    if (!active || usingFallback) return;

    let gotOrientation = false;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (draggingRef.current) return;
      if (event.beta === null && event.gamma === null) return;
      gotOrientation = true;
      tiltRef.current = normalizeOrientation(event.beta, event.gamma);
    };
    window.addEventListener('deviceorientation', handleOrientation);

    // Some desktop browsers expose the API but never actually fire it. Offer
    // the pointer fallback if nothing arrives within a short grace window.
    const graceTimer = setTimeout(() => {
      if (!gotOrientation) setUsingFallback(true);
    }, ORIENTATION_GRACE_MS);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      clearTimeout(graceTimer);
    };
  }, [active, usingFallback]);

  // --- Pointer fallback (desktop mouse / explicit fallback / denied perm) --
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    draggingRef.current = true;
    tiltRef.current = normalizePointerOffset(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
  }, []);

  const handlePointerLeave = useCallback(() => {
    draggingRef.current = false;
    tiltRef.current = { x: 0, y: 0 };
  }, []);

  // --- Animation-frame loop: drift + tilt → glint position + hold-timer ----
  useEffect(() => {
    if (!active) return;
    const startedAt = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const drift = glintDrift(elapsed);
      const glint = combineGlintPosition(drift, tiltRef.current);
      const centered = isGlintCentered(glint);
      const rotation = computeCardRotation(tiltRef.current);

      setRender((prev) => {
        const puzzle = updateTiltPuzzleState(prev.puzzle, centered, now);
        if (puzzle.solved && !solvedRef.current) {
          solvedRef.current = true;
          // Defer so we don't call back mid-render.
          queueMicrotask(onCaught);
        }
        return { rotateX: rotation.rotateX, rotateY: rotation.rotateY, glint, puzzle };
      });

      if (!solvedRef.current) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /** The first-tap gesture required by iOS 13+ before orientation events fire. */
  const requestSensorAccess = useCallback(() => {
    if (needsOrientationPermission()) {
      const ctor = DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
      void ctor
        .requestPermission?.()
        .then((result) => {
          if (result !== 'granted') setUsingFallback(true);
          setActive(true);
        })
        .catch(() => {
          setUsingFallback(true);
          setActive(true);
        });
    } else {
      setActive(true);
    }
  }, []);

  const { rotateX, rotateY, glint, puzzle } = render;

  if (!active) {
    return (
      <div className="tc-permission">
        <div className="tc-permission__icon" aria-hidden>
          📱✨
        </div>
        <p className="tc-permission__text">
          Наклони телефон, чтобы поймать блеск на карточке
        </p>
        <button type="button" className="screen__button tc-permission__btn" onClick={requestSensorAccess}>
          Разрешить датчик наклона
        </button>
      </div>
    );
  }

  return (
    <div
      className="tc-stage"
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="tc-particles" aria-hidden>
        {particles.map((p) => (
          <span
            key={p.id}
            className="tc-particles__item"
            style={{
              left: `${p.leftPct}%`,
              top: `${p.topPct}%`,
              fontSize: `${p.sizeRem}rem`,
              transform: reduceMotion
                ? undefined
                : `translate3d(${(-glint.x + rotateY) * p.depth * 0.6}px, ${(-glint.y - rotateX) * p.depth * 0.6}px, 0)`,
            }}
          >
            {particleGlyph}
          </span>
        ))}
      </div>

      <motion.div
        ref={cardRef}
        className="tc-card"
        data-solved={puzzle.solved ? 'true' : undefined}
        style={{
          transform: reduceMotion
            ? undefined
            : `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        }}
      >
        <div className="tc-card__face">
          {photo ? (
            <StickerMedia className="tc-card__photo" src={photo} />
          ) : (
            <div className="tc-card__heart" aria-hidden>💗</div>
          )}
          {heading ? <h1 className="tc-card__heading">{heading}</h1> : null}
          {text ? <p className="tc-card__text">{text}</p> : null}

          <div
            className="tc-card__glint"
            aria-hidden
            style={{
              left: `${50 + glint.x}%`,
              top: `${50 + glint.y}%`,
              opacity: reduceMotion ? 0.35 : undefined,
            }}
          />
          <div
            className="tc-card__center-zone"
            data-active={isGlintCentered(glint) ? 'true' : undefined}
          />
        </div>

        {!puzzle.solved ? (
          <div className="tc-progress" role="progressbar" aria-valuenow={Math.round(puzzle.progress * 100)}>
            <div className="tc-progress__fill" style={{ width: `${puzzle.progress * 100}%` }} />
          </div>
        ) : null}
      </motion.div>

      {!puzzle.solved ? (
        <p className="tc-hint">Поймай блеск в центр карточки ✨</p>
      ) : null}
    </div>
  );
}
