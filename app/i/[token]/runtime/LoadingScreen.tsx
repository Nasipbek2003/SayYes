'use client';

/**
 * Intro loading screen (task 7.2, Requirement 5.1).
 *
 * Shown for ~1–1.5 s before the first scenario screen with a short looping
 * animation (a gently pulsing heart). Purely presentational; the parent runtime
 * controls how long it is visible via {@link LOADING_MS}.
 */
import { motion } from 'framer-motion';

/** Animated loader displayed before the scenario starts. */
export function LoadingScreen() {
  return (
    <section className="screen screen--loading" data-screen-kind="loading">
      <motion.div
        className="loading__mark"
        aria-hidden
        animate={{ scale: [1, 1.18, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: '3rem' }}
      >
        💗
      </motion.div>
      <p className="screen__text" role="status">
        Загружаем...
      </p>
    </section>
  );
}
