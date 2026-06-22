'use client';

/**
 * Confetti — full-screen celebratory confetti (task 7.3).
 *
 * Fired on the agreement / final screens (Template 1 acceptance, Template 2
 * agreement). Wraps the `canvas-confetti` library (already in node_modules):
 * the burst runs once on mount and is cleaned up on unmount. The import is
 * dynamic so this client-only effect never runs during SSR.
 *
 * Rendering nothing visible itself, it draws onto a fixed full-screen canvas the
 * library manages, so it can be dropped onto any screen.
 */
import { useEffect } from 'react';

export interface ConfettiProps {
  /** Number of confetti particles per burst. */
  particleCount?: number;
  /** How many staggered bursts to fire. */
  bursts?: number;
  /** Spread angle of the confetti. */
  spread?: number;
}

/** Fire a one-shot confetti celebration on mount. */
export function Confetti({ particleCount = 120, bursts = 3, spread = 70 }: ConfettiProps) {
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      for (let i = 0; i < bursts; i += 1) {
        timers.push(
          setTimeout(() => {
            confetti({
              particleCount,
              spread,
              origin: { y: 0.6 },
              // Spread successive bursts left/right of centre.
              angle: 90 + (i - (bursts - 1) / 2) * 25,
            });
          }, i * 250),
        );
      }
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [particleCount, bursts, spread]);

  // The confetti canvas is created/managed by the library; nothing to render.
  return null;
}
