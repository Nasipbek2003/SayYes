'use client';

/**
 * Pre-payment invitation preview (task 10.2, Requirement 2.5).
 *
 * Renders the same interactive scenario the guest will see, but driven from the
 * author's *draft* preview payload (`GET /api/invitations/:id/preview`) instead
 * of a public token. It reuses the runtime engine ({@link ScenarioEngine}),
 * screen mapping ({@link ScreenRenderer}) and `{{...}}` substitution
 * ({@link buildScreenVars}) from the guest runtime so the preview is faithful —
 * but it deliberately does NOT call the open/respond endpoints (nothing is
 * recorded for a preview) and skips the intro loading delay so the author can
 * iterate quickly.
 *
 * The author can replay the scenario from the start (`Сначала`) since they may
 * walk a fork to a final screen while editing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { ScenarioEngine } from '@/lib/scenario/engine';
import type { PreviewPayload } from '@/lib/services/invitation';
import type { TemplateSchema } from '@/templates/types';

import { buildScreenVars, dispatchAction } from '@/app/i/[token]/runtime/controller';
import { ScreenRenderer } from '@/app/i/[token]/runtime/screens';

export interface PreviewPaneProps {
  /** Draft preview payload from the preview endpoint. */
  preview: PreviewPayload;
  /**
   * When set, drives the preview to this screen (a direct {@link
   * ScenarioEngine.goTo} jump). The author form uses it so focusing a field
   * shows the screen that field affects. Ignored when the screen id is unknown.
   */
  activeScreenId?: string;
}

/** Reconstruct a template schema sufficient to drive the engine for preview. */
function schemaFromPreview(preview: PreviewPayload): TemplateSchema {
  return {
    id: preview.templateId,
    name: preview.template.name,
    description: preview.template.description,
    themes: [preview.themeId],
    fields: [],
    startScreen: preview.template.startScreen,
    screens: preview.template.screens,
    premiumFeatures: preview.template.premiumFeatures,
  };
}

/** Interactive, non-recording preview of the invitation scenario. */
export function PreviewPane({ preview, activeScreenId }: PreviewPaneProps) {
  const engineRef = useRef<ScenarioEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new ScenarioEngine(schemaFromPreview(preview));
  }
  const engine = engineRef.current;

  const [, setTick] = useState(0);
  const screen = engine.current;

  // Follow the editor: when the author focuses a field, jump the preview to the
  // screen that field affects. A no-op when already there or the id is unknown.
  useEffect(() => {
    if (!activeScreenId || engine.current.id === activeScreenId) return;
    try {
      engine.goTo(activeScreenId);
      setTick((n) => n + 1);
    } catch {
      // Unknown screen id — ignore and keep the current screen.
    }
  }, [activeScreenId, engine]);

  const vars = useMemo(
    () => buildScreenVars(preview.data, engine.context),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview.data, screen.id],
  );

  const handleAction = (action: string, payload?: unknown) => {
    const result = dispatchAction(engine, action, payload);
    if (result.moved) setTick((n) => n + 1);
  };

  const restart = () => {
    engine.reset();
    setTick((n) => n + 1);
  };

  return (
    <div className="preview-pane">
      <div className="preview-pane__toolbar">
        <span className="preview-pane__hint">Предпросмотр</span>
        <button type="button" className="preview-pane__restart" onClick={restart}>
          ↺ Сначала
        </button>
      </div>

      {/* Телефонная рамка */}
      <div className="preview-pane__phone">
        <div className="preview-pane__notch" aria-hidden="true" />
        <div className="preview-pane__screen">
          <main
            className="invitation-runtime"
            data-template={preview.templateId}
            data-theme={preview.themeId}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={screen.id}
                className="screen-motion"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <ScreenRenderer
                  screen={screen}
                  vars={vars}
                  onAction={handleAction}
                  templateId={preview.templateId}
                  places={preview.places}
                />
              </motion.div>
            </AnimatePresence>

            {preview.features.showBrandSignature ? (
              <footer className="brand-signature">Сделано с ♥ на SayYes</footer>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
