'use client';

/**
 * FloatingHearts — ambient hearts drifting up the background (task 7.3).
 *
 * A decorative, mobile-first background layer used on romantic screens
 * (Templates 1 & 2). Each heart gets a randomised horizontal position, size,
 * duration and delay so the field looks organic, then floats from the bottom to
 * the top on a Framer Motion loop. It is purely decorative (`aria-hidden`) and
 * sits behind the screen content.
 *
 * The randomised layout is produced by the pure {@link buildHearts} helper so it
 * can be unit-tested without a DOM; the component only renders the result.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';

/** A single heart's randomised layout/animation parameters. */
export interface HeartSpec {
  id: number;
  /** Horizontal position as a percentage of the container width (0–100). */
  leftPct: number;
  /** Font size in rem. */
  sizeRem: number;
  /** Float duration in seconds. */
  durationSec: number;
  /** Start delay in seconds (negative so some hearts start mid-flight). */
  delaySec: number;
}

/**
 * Build `count` randomised heart specs (pure; `rng` is injectable for tests).
 * Values are spread across sensible ranges so hearts vary in position, size and
 * speed without overlapping into an obvious grid.
 */
export function buildHearts(count: number, rng: () => number = Math.random): HeartSpec[] {
  const hearts: HeartSpec[] = [];
  for (let id = 0; id < Math.max(0, count); id += 1) {
    hearts.push({
      id,
      leftPct: Math.round(rng() * 100),
      sizeRem: 1 + rng() * 1.5,
      durationSec: 6 + rng() * 6,
      // Negative delay so the screen starts with hearts already in flight.
      delaySec: -(rng() * 8),
    });
  }
  return hearts;
}

export interface FloatingHeartsProps {
  /** How many hearts to render. */
  count?: number;
  /** Heart glyph to use. */
  glyph?: string;
}

/** Decorative floating-hearts background layer. */
export function FloatingHearts({ count = 12, glyph = '♥' }: FloatingHeartsProps) {
  // Compute the layout once per mount/count so hearts don't reshuffle on every
  // re-render of the parent screen.
  const hearts = useMemo(() => buildHearts(count), [count]);

  return (
    <div className="floating-hearts" aria-hidden>
      {hearts.map((heart) => (
        <motion.span
          key={heart.id}
          className="floating-hearts__heart"
          style={{ left: `${heart.leftPct}%`, fontSize: `${heart.sizeRem}rem` }}
          initial={{ y: '10vh', opacity: 0 }}
          animate={{ y: '-110vh', opacity: [0, 0.9, 0.9, 0] }}
          transition={{
            duration: heart.durationSec,
            delay: heart.delaySec,
            repeat: Infinity,
            ease: 'easeIn',
          }}
        >
          {glyph}
        </motion.span>
      ))}
    </div>
  );
}
