'use client';

/**
 * Client scenario runtime (task 7.2).
 *
 * This is the interactive entry point rendered inside the SSR invitation page.
 * It is the *scaffold* that ties the pieces together — detailed template UI is
 * tasks 8.x, the special animated elements are task 7.3, and recording
 * open/respond on the server is task 7.4. Responsibilities here:
 *
 *  1. **Loading screen** (Requirement 5.1): show a short animated loader for
 *     {@link LOADING_MS} (1–1.5 s) before the first scenario screen.
 *  2. **Engine-driven render**: build a {@link ScenarioEngine} from the public
 *     invitation's template schema and use it as the source of truth for which
 *     screen is current. {@link ScreenRenderer} maps the screen `kind` to a
 *     component.
 *  3. **Animated transitions** (Requirement 5.3): move between screens with
 *     Framer Motion's `AnimatePresence`, with no page reload — a UI action
 *     dispatches to the engine and the new `current` screen animates in.
 *  4. **Mute control** (Requirement 5.6): background music is OFF by default
 *     ({@link INITIAL_MUTED}); an always-available mute/unmute toggle lets the
 *     guest opt in.
 *
 * The layout is mobile-first (~390 px, Requirement 5.2) and works inside the
 * in-app browsers of Telegram / WhatsApp / Instagram.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { ScenarioEngine } from '@/lib/scenario/engine';
import type { PublicInvitation } from '@/lib/services/invitation';
import type { TemplateSchema } from '@/templates/types';

import { postOpen, postRespond } from './client';
import { INITIAL_MUTED, LOADING_MS, buildScreenVars, dispatchAction } from './controller';
import { resolveGuestKey } from './guestKey';
import { LoadingScreen } from './LoadingScreen';
import { MuteButton } from './MuteButton';
import { ScreenRenderer } from './screens';
import { useDelayedFlag } from './useDelayedFlag';

export interface InvitationRuntimeProps {
  /** Public, guest-facing projection resolved by the SSR page. */
  invitation: PublicInvitation;
}

/**
 * Reconstruct a {@link TemplateSchema} sufficient to drive the engine from the
 * public invitation projection. `getByToken` strips the schema down to what the
 * runtime needs (name/description/startScreen/screens); the engine only reads
 * `id`, `startScreen` and `screens`, so the remaining fields are filled with
 * inert defaults.
 */
function schemaFromPublic(invitation: PublicInvitation): TemplateSchema {
  return {
    id: invitation.templateId,
    name: invitation.template.name,
    description: invitation.template.description,
    themes: [invitation.themeId],
    fields: [],
    startScreen: invitation.template.startScreen,
    screens: invitation.template.screens,
    premiumFeatures: [],
  };
}

/** First `final`-kind screen of the template, used to jump to "уже отвечено". */
function findFinalScreenId(schema: TemplateSchema): string | undefined {
  return schema.screens.find((screen) => screen.kind === 'final')?.id;
}

/** Interactive scenario runtime for an available invitation. */
export function InvitationRuntime({ invitation }: InvitationRuntimeProps) {
  // The engine is the source of truth for the current screen. It is mutable and
  // long-lived, so keep it in a ref; a render counter forces re-render after a
  // dispatch moves it.
  const engineRef = useRef<ScenarioEngine | null>(null);
  if (engineRef.current === null) {
    const engine = new ScenarioEngine(schemaFromPublic(invitation));
    // Requirement 5.7: if this guest already answered, skip the scenario and
    // land on the final "уже отвечено" screen instead of replaying it.
    if (invitation.alreadyResponded) {
      const finalId = findFinalScreenId(engine.schema);
      if (finalId) engine.goTo(finalId);
    }
    engineRef.current = engine;
  }
  const engine = engineRef.current;

  // Bumped on every engine move to re-render with the new current screen.
  const [, setTick] = useState(0);
  const [muted, setMuted] = useState(INITIAL_MUTED);

  // Stable per-guest key for RSVP idempotency (Template 3 / Requirement 8.5).
  // Resolved once from localStorage so a repeat RSVP from the same browser
  // updates the same guest record instead of duplicating it. Harmless (unused)
  // for templates without an RSVP screen.
  const guestKeyRef = useRef<string | null>(null);
  if (guestKeyRef.current === null) {
    guestKeyRef.current = resolveGuestKey(invitation.token);
  }
  const guestKey = guestKeyRef.current;

  // Loading screen for 1–1.5 s before the first scenario screen (Req 5.1).
  const ready = useDelayedFlag(LOADING_MS);

  // Record the open exactly once when the runtime mounts (Requirement 9.1).
  // Best-effort: a failed call must not block the scenario.
  useEffect(() => {
    void postOpen(invitation.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Submit the guest's answer once when the engine first reaches a final screen
  // (Requirements 5.5 server validation, 8.5 idempotent upsert). Guarded so a
  // re-render never re-posts. Skipped when the guest had already answered (we
  // jumped straight to the final screen without producing a new answer).
  const submittedRef = useRef(invitation.alreadyResponded);
  useEffect(() => {
    if (submittedRef.current) return;
    if (!engine.isFinal()) return;
    submittedRef.current = true;
    void postRespond(invitation.token, engine.buildResponse());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.current.id]);

  const screen = engine.current;
  const vars = useMemo(
    () => buildScreenVars(invitation.data, engine.context),
    // Recompute when the screen changes (tick) or invitation data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invitation.data, screen.id],
  );

  const handleAction = (action: string, payload?: unknown) => {
    const result = dispatchAction(engine, action, payload);
    if (result.moved) {
      // Re-render so AnimatePresence swaps to the new current screen.
      setTick((n) => n + 1);
    }
  };

  return (
    <main
      className="invitation-runtime"
      data-template={invitation.templateId}
      data-theme={invitation.themeId}
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
              templateId={invitation.templateId}
              places={invitation.places}
              guestKey={guestKey}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {invitation.features.showBrandSignature ? (
        <footer className="brand-signature">Сделано с ♥ на SayYes</footer>
      ) : null}
    </main>
  );
}
