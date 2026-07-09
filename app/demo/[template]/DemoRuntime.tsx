'use client';

/**
 * Live template demo — "try as guest" (growth / conversion lever).
 *
 * Lets a visitor play through a template's full scenario interactively *before*
 * creating or paying. It reuses the exact guest runtime pieces — the
 * {@link ScenarioEngine}, {@link ScreenRenderer} and the pure controller
 * helpers — but with **no network**: opens/responses are never posted and no
 * token exists. Author data is generated locally ({@link buildDemoData}).
 *
 * A slim "Демо" banner and a persistent "Создать своё" CTA turn the try-out
 * into the top of the creation funnel.
 */
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

import { ScenarioEngine } from '@/lib/scenario/engine';
import type { TemplateSchema } from '@/templates/types';

import {
  INITIAL_MUTED,
  LOADING_MS,
  buildScreenVars,
  dispatchAction,
} from '@/app/i/[token]/runtime/controller';
import { LoadingScreen } from '@/app/i/[token]/runtime/LoadingScreen';
import { MuteButton } from '@/app/i/[token]/runtime/MuteButton';
import { ScreenRenderer } from '@/app/i/[token]/runtime/screens';
import { useDelayedFlag } from '@/app/i/[token]/runtime/useDelayedFlag';

export interface DemoRuntimeProps {
  /** Full template schema to play. */
  schema: TemplateSchema;
  /** Colour theme id to render with. */
  themeId: string;
  /** Locally-generated demo author data. */
  data: Record<string, unknown>;
  /** Deep link to create a real invitation from this template. */
  createHref: string;
}

/** Interactive, network-free playthrough of a template. */
export function DemoRuntime({ schema, themeId, data, createHref }: DemoRuntimeProps) {
  const engineRef = useRef<ScenarioEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new ScenarioEngine(schema);
  }
  const engine = engineRef.current;

  const [, setTick] = useState(0);
  const [muted, setMuted] = useState(INITIAL_MUTED);
  const ready = useDelayedFlag(LOADING_MS);

  // Place cards for Template-2-style pickers come straight from the demo data.
  const places = useMemo(() => {
    const field = schema.fields.find((f) => f.type === 'placesList');
    const value = field ? data[field.key] : undefined;
    return Array.isArray(value) ? value : [];
  }, [schema.fields, data]);

  const screen = engine.current;
  const vars = useMemo(
    () => buildScreenVars(data, engine.context),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, screen.id],
  );

  const handleAction = (action: string, payload?: unknown) => {
    const result = dispatchAction(engine, action, payload);
    if (result.moved) setTick((n) => n + 1);
  };

  const restart = () => {
    engine.goTo(schema.startScreen);
    setTick((n) => n + 1);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.72)',
          color: '#fff',
          fontSize: 13,
        }}
      >
        <span>Демо · так это увидит адресат</span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={restart}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            Сначала
          </button>
          <Link
            href={createHref}
            style={{
              background: '#e8367a',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: 999,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Создать своё →
          </Link>
        </span>
      </div>

      <main
        className="invitation-runtime"
        data-template={schema.id}
        data-theme={themeId}
        style={{ paddingTop: 44 }}
      >
        <MuteButton muted={muted} onToggle={() => setMuted((m) => !m)} />

        <AnimatePresence mode="wait" initial={false}>
          {!ready ? (
            <motion.div
              key="__loading"
              className="screen-motion"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <LoadingScreen />
            </motion.div>
          ) : (
            <motion.div
              key={screen.id}
              className="screen-motion"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <ScreenRenderer
                screen={screen}
                vars={vars}
                onAction={handleAction}
                templateId={schema.id}
                places={places}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
