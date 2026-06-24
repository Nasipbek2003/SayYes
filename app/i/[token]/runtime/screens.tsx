'use client';

/**
 * Screen components and the `kind` → component mapping (task 7.2).
 *
 * {@link ScreenRenderer} maps a {@link ScreenSchema.kind} to the React
 * component that renders it (`intro`, `invite`, `fork`, `placePicker`,
 * `timePicker`, `rsvp`, `eventDetails`, `final`). At this stage these are
 * intentionally *basic / scaffold* versions: they render the screen's declared
 * elements (texts, buttons) and wire buttons to the engine via `onAction`.
 * The detailed, template-specific UI of each screen is tasks 8.x, and the
 * special interactive elements (RunawayButton, Confetti, FloatingHearts,
 * Countdown) are task 7.3.
 *
 * Every screen is driven by the same declarative {@link ScreenSchema.elements}
 * list, so adding screen detail later means enriching these components, not
 * changing the renderer or the engine.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';

import type { ScreenElement, ScreenKind, ScreenSchema } from '@/templates/types';

import { substitute } from './controller';
import { Confetti, Countdown, FloatingHearts, RunawayButton } from './animations';
import {
  buildRsvpPayload,
  buildSelectionPayload,
  eventRsvpConfirmationConfig,
  eventRsvpCoverConfig,
  eventRsvpDetailsConfig,
  eventRsvpFormConfig,
  finalScreenConfig,
  isEventRsvp,
  isRsvpReady,
  isSelectionReady,
  isSimpleDate,
  isSoftDeclineScreen,
  isStoryFork,
  type RsvpFormState,
  type RsvpStatus,
  simpleDateFinalConfig,
  simpleDateIntroConfig,
  simpleDateInviteConfig,
  storyForkConfirmConfig,
  storyForkInviteConfig,
  storyForkPlacePickerConfig,
  storyForkSoftDeclineConfig,
  storyForkTimePickerConfig,
} from './templateScreens';

/** Props shared by every screen component. */
export interface ScreenProps {
  /** The screen schema being rendered. */
  screen: ScreenSchema;
  /** Variable bag for `{{...}}` substitution (author data + guest answers). */
  vars: Record<string, unknown>;
  /**
   * Dispatch a screen action (button click, selection, submit) to the engine.
   * The runtime maps the resulting engine state into an animated transition.
   */
  onAction: (action: string, payload?: unknown) => void;
  /**
   * Id of the template being played. Screen components use it to select the
   * detailed, template-specific UI (tasks 8.x) while sharing the same renderer
   * and engine. When omitted, the element-driven scaffold is rendered.
   */
  templateId?: string;
  /**
   * Normalised place cards for the template (Template 2 «Выбор места»). Empty
   * for templates without a place list; an empty list drives the free-text
   * «Напиши, куда хочешь» fallback (Requirement 7.6).
   */
  places?: ReadonlyArray<{ название?: unknown; name?: unknown; title?: unknown; фото?: unknown; photo?: unknown; image?: unknown; описание?: unknown; description?: unknown } | string>;
  /**
   * Stable per-guest key for RSVP idempotency (Template 3 / Requirement 8.5).
   * The RSVP screen sends it with the answer so a repeat submit from the same
   * browser updates that guest's record instead of duplicating it. Resolved by
   * the runtime from `localStorage`; omitted for templates without RSVP.
   */
  guestKey?: string;
}

/** Render an element's text with `{{...}}` substitution applied. */
function elementText(element: ScreenElement, vars: Record<string, unknown>): string {
  return substitute(element.text, vars);
}

/** A single declarative element (heading/text/button/image) → React node. */
function Element({
  element,
  vars,
  onAction,
  index,
}: {
  element: ScreenElement;
  vars: Record<string, unknown>;
  onAction: ScreenProps['onAction'];
  index: number;
}): ReactNode {
  switch (element.kind) {
    case 'heading':
      return (
        <h1 key={element.id ?? index} className="screen__heading">
          {elementText(element, vars)}
        </h1>
      );
    case 'text':
      return (
        <p key={element.id ?? index} className="screen__text">
          {elementText(element, vars)}
        </p>
      );
    case 'image': {
      const src = substitute(element.src, vars);
      if (!src) return null;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={element.id ?? index}
          className="screen__image"
          src={src}
          alt=""
        />
      );
    }
    case 'button':
      return (
        <button
          key={element.id ?? index}
          type="button"
          className="screen__button"
          data-action={element.action}
          onClick={() => element.action && onAction(element.action)}
        >
          {elementText(element, vars)}
        </button>
      );
    case 'input':
    case 'placesGrid':
    case 'countdown':
      // Detailed interactive UI for these elements is tasks 7.3 / 8.x. The
      // scaffold renders any declared label text so the screen is not empty.
      return element.text ? (
        <p key={element.id ?? index} className="screen__text">
          {elementText(element, vars)}
        </p>
      ) : null;
    default:
      return null;
  }
}

/**
 * Default screen body: renders the screen's declared elements in order. Most
 * scaffold screens share this; specialised screens (task 8.x) can replace the
 * per-kind component below with richer UI.
 */
function ElementList({ screen, vars, onAction }: ScreenProps): ReactNode {
  return (
    <>
      {screen.elements.map((element, index) => (
        <Element
          key={element.id ?? index}
          element={element}
          vars={vars}
          onAction={onAction}
          index={index}
        />
      ))}
    </>
  );
}

/** Wrap a screen body in the standard mobile-first screen container. */
function ScreenShell({
  kind,
  screenId,
  children,
}: {
  kind: ScreenKind;
  screenId: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section
      className="screen"
      data-screen-kind={kind}
      data-screen-id={screenId}
    >
      {children}
    </section>
  );
}

/* --- Template 1 «Приглашение на свидание» (simple-date) detailed UI (task 8.1) --- */

/**
 * Template 1 — Экран 1 «Заставка». Photo (or a pulsing heart icon when no
 * photo), greeting heading «Привет, {{имя_адресата}}!», a pulsing «Открыть»
 * button, and the floating-hearts background. (scenarii-shablonov-spec Шаблон 1
 * / Requirement 6.1.)
 */
function SimpleDateIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = simpleDateIntroConfig(screen, vars);
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <FloatingHearts count={10} />
      <div className="t1-intro">
        {config.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="t1-intro__photo" src={config.photo} alt="" />
        ) : (
          <motion.div
            className="t1-intro__heart"
            aria-hidden
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            💗
          </motion.div>
        )}
        {config.heading ? <h1 className="screen__heading">{config.heading}</h1> : null}
        <motion.button
          type="button"
          className="screen__button t1-intro__open"
          data-action={config.openAction}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(config.openAction)}
        >
          {config.openLabel}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 1 — Экран 2 «Приглашение». Large invitation text, signature line,
 * and the «Да» / runaway «Нет» pair ({@link RunawayButton}) where «Да» grows as
 * «Нет» runs away and disappears after the attempt limit (Requirements 6.1–6.3).
 */
function SimpleDateInvite({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = simpleDateInviteConfig(screen, vars);
  return (
    <ScreenShell kind="invite" screenId={screen.id}>
      <div className="t1-invite">
        {config.inviteText ? (
          <p className="t1-invite__text">{config.inviteText}</p>
        ) : null}
        {config.signature ? (
          <p className="t1-invite__signature">{config.signature}</p>
        ) : null}
        <RunawayButton
          yesLabel={config.yesLabel}
          noLabel={config.noLabel}
          attemptLimit={config.attemptLimit}
          onYes={() => onAction(config.yesAction)}
        />
      </div>
    </ScreenShell>
  );
}

/**
 * Template 1 — Экран 3 «Согласие». Full-screen confetti + floating hearts and
 * the success copy «Ура! Я знал(а)...» (Requirement 6.4). The author event
 * «🎉 {{имя_адресата}} согласилась!» (Requirement 6.5) is emitted server-side
 * when the runtime posts the response on reaching this final screen (task 7.4).
 */
function SimpleDateFinal({ screen, vars }: ScreenProps): ReactNode {
  const config = simpleDateFinalConfig(screen, vars);
  return (
    <ScreenShell kind="final" screenId={screen.id}>
      <FloatingHearts count={14} />
      {config.hasConfetti ? <Confetti /> : null}
      <div className="t1-final">
        {config.successLines.map((line, index) => (
          <p key={index} className="t1-final__text">
            {line}
          </p>
        ))}
      </div>
    </ScreenShell>
  );
}

/* --- Template 2 «Ты реально мне отказала?» (story-fork) detailed UI (task 8.2) --- */

/**
 * Template 2 — Экран 1 «Приглашение». Intro text and two choices: «Давай!»
 * → выбор места (Requirement 7.1), «Нет, спасибо» → «реально отказала?»
 * (Requirement 7.2). (scenarii-shablonov-spec Шаблон 2, Экран 1.)
 */
function StoryForkInvite({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = storyForkInviteConfig(screen, vars);
  return (
    <ScreenShell kind="invite" screenId={screen.id}>
      <FloatingHearts count={8} />
      <div className="t2-invite">
        {config.introText ? (
          <p className="t2-invite__text">{config.introText}</p>
        ) : null}
        <div className="t2-actions">
          <button
            type="button"
            className="screen__button t2-actions__yes"
            data-action={config.yesAction}
            onClick={() => onAction(config.yesAction)}
          >
            {config.yesLabel}
          </button>
          <button
            type="button"
            className="screen__button t2-actions__no"
            data-action={config.noAction}
            onClick={() => onAction(config.noAction)}
          >
            {config.noLabel}
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 2 — Экран 2 «Ты реально мне отказала?». Sad emoji animation and the
 * «Да» (confirm decline → soft final) / «Нет» (changed her mind → place picker)
 * pair (Requirements 7.2, 7.3).
 */
function StoryForkConfirm({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = storyForkConfirmConfig(screen, vars);
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="t2-confirm">
        <motion.div
          className="t2-confirm__emoji"
          aria-hidden
          animate={{ y: [0, -8, 0], rotate: [-4, 4, -4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          🥺
        </motion.div>
        {config.prompt ? <p className="t2-confirm__text">{config.prompt}</p> : null}
        <div className="t2-actions">
          <button
            type="button"
            className="screen__button t2-actions__no"
            data-action={config.confirmAction}
            onClick={() => onAction(config.confirmAction)}
          >
            {config.confirmLabel}
          </button>
          <button
            type="button"
            className="screen__button t2-actions__yes"
            data-action={config.cancelAction}
            onClick={() => onAction(config.cancelAction)}
          >
            {config.cancelLabel}
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 2 — Экран 3 «Мягкий финал отказа». Respectful decline copy and a
 * «Передумала?» button that returns to screen-1 (Requirement 7.4). The author
 * event «{{имя_адресата}} пока отказалась» is emitted server-side when the
 * runtime posts the response on reaching this final screen (task 7.4).
 */
function StoryForkSoftDecline({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = storyForkSoftDeclineConfig(screen, vars);
  return (
    <ScreenShell kind="final" screenId={screen.id}>
      <div className="t2-soft-decline">
        <div className="t2-soft-decline__emoji" aria-hidden>
          💛
        </div>
        {config.textLines.map((line, index) => (
          <p key={index} className="t2-soft-decline__text">
            {line}
          </p>
        ))}
        <button
          type="button"
          className="screen__button t2-soft-decline__reconsider"
          data-action={config.reconsiderAction}
          onClick={() => onAction(config.reconsiderAction)}
        >
          {config.reconsiderLabel}
        </button>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 2 — Экран 4 «Выбор места». A grid of place cards from the author's
 * `{{список_мест}}` (photo + name + description); tapping a card highlights it
 * and the «Готово» button activates only after a selection (Requirement 7.5).
 * When the list is empty the grid is replaced by a free «Напиши, куда хочешь»
 * input (Requirement 7.6). Selection is local state until «Готово» dispatches
 * `{ выбранное_место }` to the engine, so the response carries `place`.
 */
function StoryForkPlacePicker({
  screen,
  vars,
  onAction,
  places,
}: ScreenProps): ReactNode {
  const config = storyForkPlacePickerConfig(screen, places, vars);
  const [selected, setSelected] = useState('');
  const ready = isSelectionReady(selected);

  const submit = () => {
    const payload = buildSelectionPayload(config.placeField, selected);
    if (payload) onAction(config.doneAction, payload);
  };

  return (
    <ScreenShell kind="placePicker" screenId={screen.id}>
      <div className="t2-place">
        {config.prompt ? <p className="t2-place__prompt">{config.prompt}</p> : null}

        {config.isEmpty ? (
          <input
            type="text"
            className="t2-place__free"
            placeholder={config.emptyLabel}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          />
        ) : (
          <div className="t2-place__grid" role="listbox">
            {config.places.map((place) => {
              const isActive = place.name === selected;
              return (
                <button
                  type="button"
                  key={place.name}
                  role="option"
                  aria-selected={isActive}
                  className={
                    isActive ? 't2-place__card t2-place__card--active' : 't2-place__card'
                  }
                  data-place={place.name}
                  onClick={() => setSelected(place.name)}
                >
                  {place.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="t2-place__photo" src={place.photo} alt="" />
                  ) : null}
                  <span className="t2-place__name">{place.name}</span>
                  {place.description ? (
                    <span className="t2-place__desc">{place.description}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="screen__button t2-place__done"
          data-action={config.doneAction}
          disabled={!ready}
          onClick={submit}
        >
          {config.doneLabel}
        </button>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 2 — Экран 5 «Выбор времени» (optional). Fixed slots (when the schema
 * declares them) or a free-text input; «Подтвердить» activates after a choice
 * and dispatches `{ выбранное_время }` to the engine so the response carries
 * `time` (scenarii-shablonov-spec Шаблон 2, Экран 5).
 */
function StoryForkTimePicker({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = storyForkTimePickerConfig(screen, vars);
  const [selected, setSelected] = useState('');
  const ready = isSelectionReady(selected);

  const submit = () => {
    const payload = buildSelectionPayload(config.timeField, selected);
    if (payload) onAction(config.confirmAction, payload);
  };

  return (
    <ScreenShell kind="timePicker" screenId={screen.id}>
      <div className="t2-time">
        {config.prompt ? <p className="t2-time__prompt">{config.prompt}</p> : null}

        {config.options.length > 0 ? (
          <div className="t2-time__slots" role="listbox">
            {config.options.map((option) => {
              const isActive = option === selected;
              return (
                <button
                  type="button"
                  key={option}
                  role="option"
                  aria-selected={isActive}
                  className={
                    isActive ? 't2-time__slot t2-time__slot--active' : 't2-time__slot'
                  }
                  onClick={() => setSelected(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            type="text"
            className="t2-time__free"
            placeholder="Напиши, когда удобно"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          />
        )}

        <button
          type="button"
          className="screen__button t2-time__confirm"
          data-action={config.confirmAction}
          disabled={!ready}
          onClick={submit}
        >
          {config.confirmLabel}
        </button>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 2 — Экран 6 «Финал согласия». Confetti + floating hearts and the
 * «Свидание назначено! {{выбранное_место}}, {{выбранное_время}}» copy
 * (Requirement 7.7). The accepted author event with the chosen place/time is
 * emitted server-side when the runtime posts the response (task 7.4).
 */
function StoryForkFinal({ screen, vars }: ScreenProps): ReactNode {
  const config = finalScreenConfig(screen, vars);
  return (
    <ScreenShell kind="final" screenId={screen.id}>
      <FloatingHearts count={14} />
      {config.hasConfetti ? <Confetti /> : null}
      <div className="t2-final">
        {config.successLines.map((line, index) => (
          <p key={index} className="t2-final__text">
            {line}
          </p>
        ))}
      </div>
    </ScreenShell>
  );
}

/* --- Template 3 «Той / праздник» (event-rsvp) detailed UI (task 8.3) --- */

/**
 * Template 3 — Экран 1 «Обложка». Full-screen cover photo `{{фото_обложка}}`
 * with the event title `{{название_события}}`, soft floating particles and the
 * «Открыть приглашение» button (scenarii-shablonov-spec Шаблон 3, Экран 1 /
 * Requirement 8.1).
 */
function EventRsvpCover({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = eventRsvpCoverConfig(screen, vars);
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <FloatingHearts count={12} />
      <div
        className={config.cover ? 't3-cover t3-cover--photo' : 't3-cover'}
        style={config.cover ? { backgroundImage: `url(${config.cover})` } : undefined}
      >
        <div className="t3-cover__inner">
          {config.title ? <h1 className="t3-cover__title">{config.title}</h1> : null}
          <motion.button
            type="button"
            className="screen__button t3-cover__open"
            data-action={config.openAction}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            onClick={() => onAction(config.openAction)}
          >
            {config.openLabel}
          </motion.button>
        </div>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 3 — Экран 2 «Детали события». Invitation text, the 📅 дата · 🕐 время
 * · 📍 место block, an optional «Показать на карте» link that opens `{{адрес}}`
 * in maps (Requirement 8.2), the optional dress code, an animated
 * {@link Countdown} to the event date, and «Подтвердить участие» → RSVP form
 * (Requirement 8.1).
 */
function EventRsvpDetails({ screen, vars, onAction }: ScreenProps): ReactNode {
  const config = eventRsvpDetailsConfig(screen, vars);
  return (
    <ScreenShell kind="eventDetails" screenId={screen.id}>
      <div className="t3-details">
        {config.inviteText ? (
          <p className="t3-details__invite">{config.inviteText}</p>
        ) : null}
        {config.details ? (
          <p className="t3-details__meta">{config.details}</p>
        ) : null}
        {config.mapUrl ? (
          <a
            className="screen__button t3-details__map"
            href={config.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {config.mapLabel}
          </a>
        ) : null}
        {config.dressCode ? (
          <p className="t3-details__dresscode">{config.dressCode}</p>
        ) : null}
        {config.countdownTarget ? (
          <Countdown target={config.countdownTarget} />
        ) : null}
        <button
          type="button"
          className="screen__button t3-details__confirm"
          data-action={config.confirmAction}
          onClick={() => onAction(config.confirmAction)}
        >
          {config.confirmLabel}
        </button>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 3 — Экран 3 «RSVP». Guest-name field, «Приду»/«Не смогу» choice and
 * (when the author enabled it) a «Сколько вас будет?» number field; «Отправить»
 * dispatches `submit:rsvp` with `{ имя_гостя, статус_rsvp, число_гостей?,
 * guestKey }` so the engine builds a correct {@link GuestResponse} and the
 * repeat answer from the same browser updates the same record (Requirements
 * 8.3, 8.5). Choosing «Не смогу» hides the party-size field.
 */
function EventRsvpForm({ screen, vars, onAction, guestKey }: ScreenProps): ReactNode {
  const config = eventRsvpFormConfig(screen, vars);
  const [state, setState] = useState<RsvpFormState>({ name: '', status: '', guests: '' });
  const ready = isRsvpReady(state, config.collectsGuests);

  const pick = (status: RsvpStatus) => setState((s) => ({ ...s, status }));

  const submit = () => {
    const payload = buildRsvpPayload(state, config.collectsGuests, guestKey ?? '');
    if (payload) onAction(config.submitAction, payload);
  };

  const showGuests = config.collectsGuests && state.status === 'yes';

  return (
    <ScreenShell kind="rsvp" screenId={screen.id}>
      <div className="t3-rsvp">
        <input
          type="text"
          className="t3-rsvp__name"
          placeholder={config.namePlaceholder}
          value={state.name}
          onChange={(event) => setState((s) => ({ ...s, name: event.target.value }))}
        />

        <div className="t3-rsvp__choice" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={state.status === 'yes'}
            className={
              state.status === 'yes'
                ? 'screen__button t3-rsvp__attend t3-rsvp__attend--active'
                : 'screen__button t3-rsvp__attend'
            }
            onClick={() => pick('yes')}
          >
            {config.attendLabel}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={state.status === 'no'}
            className={
              state.status === 'no'
                ? 'screen__button t3-rsvp__decline t3-rsvp__decline--active'
                : 'screen__button t3-rsvp__decline'
            }
            onClick={() => pick('no')}
          >
            {config.declineLabel}
          </button>
        </div>

        {showGuests ? (
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="t3-rsvp__guests"
            placeholder={config.guestsPlaceholder}
            value={state.guests}
            onChange={(event) => setState((s) => ({ ...s, guests: event.target.value }))}
          />
        ) : null}

        <button
          type="button"
          className="screen__button t3-rsvp__submit"
          data-action={config.submitAction}
          disabled={!ready}
          onClick={submit}
        >
          {config.submitLabel}
        </button>
      </div>
    </ScreenShell>
  );
}

/**
 * Template 3 — Экран 4 «Подтверждение». «Приду» → confetti + floating hearts and
 * the thank-you copy; «Не смогу» → a polite decline message with no confetti
 * (Requirement 8.4). The author event «{{имя_гостя}}: Приду/Не смогу
 * (+{{число_гостей}})» is emitted server-side when the runtime posts the
 * response on reaching this final screen (task 7.4).
 */
function EventRsvpConfirmation({ screen, vars }: ScreenProps): ReactNode {
  const config = eventRsvpConfirmationConfig(screen, vars);
  return (
    <ScreenShell kind="final" screenId={screen.id}>
      {config.attending ? <FloatingHearts count={14} /> : null}
      {config.hasConfetti ? <Confetti /> : null}
      <div className="t3-final">
        {config.lines.map((line, index) => (
          <p key={index} className="t3-final__text">
            {line}
          </p>
        ))}
      </div>
    </ScreenShell>
  );
}

/**
 * Scaffold screen components. They currently share the same element-driven body
 * via {@link ElementList}; each is a distinct component so tasks 8.x can flesh
 * out the template-specific UI per kind without touching the renderer mapping.
 */
function IntroScreen(props: ScreenProps): ReactNode {
  if (isSimpleDate(props.templateId)) return SimpleDateIntro(props);
  if (isEventRsvp(props.templateId)) return EventRsvpCover(props);
  return (
    <ScreenShell kind="intro" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

/**
 * Шаблон «date-ask» — экраны приглашения и подтверждения. Картинка, заголовок,
 * пара «Да / убегающая Нет» ({@link RunawayButton}): «Да» растёт и ведёт
 * дальше, «Нет» убегает и исчезает после нескольких попыток.
 *
 * На экране 2 (подтверждение): подзаголовок скрыт до нажатия «Да» — после
 * клика появляется с анимацией, и через 1.5 с идёт переход к финалу.
 */
function DateAskInvite({ screen, vars, onAction }: ScreenProps): ReactNode {
  const image = screen.elements.find((el) => el.kind === 'image');
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const subtitle = screen.elements.find((el) => el.kind === 'text');
  const yesBtn = screen.elements.find((el) => el.kind === 'button' && el.id === 'yes');
  const noBtn = screen.elements.find((el) => el.kind === 'button' && el.id === 'no');

  const imgSrc = substitute(image?.src, vars);
  const headingText = substitute(heading?.text, vars);
  const subtitleText = substitute(subtitle?.text, vars);
  const yesAction = yesBtn?.action ?? 'click:yes';
  const isConfirmScreen = screen.id === 'screen-2';

  const [showSubtitle, setShowSubtitle] = useState(false);

  const handleYes = () => {
    if (isConfirmScreen && subtitleText) {
      setShowSubtitle(true);
      setTimeout(() => onAction(yesAction), 1500);
    } else {
      onAction(yesAction);
    }
  };

  return (
    <ScreenShell kind="invite" screenId={screen.id}>
      <FloatingHearts count={8} />
      <div className="da-screen">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="da-image" src={imgSrc} alt="" />
        ) : null}
        {headingText ? <h1 className="screen__heading">{headingText}</h1> : null}
        {showSubtitle && subtitleText ? (
          <motion.p
            className="screen__text"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {subtitleText}
          </motion.p>
        ) : null}
        {!showSubtitle ? (
          <RunawayButton
            yesLabel={substitute(yesBtn?.text, vars) || 'Да'}
            noLabel={substitute(noBtn?.text, vars) || 'Нет'}
            onYes={handleYes}
          />
        ) : null}
      </div>
    </ScreenShell>
  );
}

function InviteScreen(props: ScreenProps): ReactNode {
  if (props.templateId === 'date-ask') return DateAskInvite(props);
  if (isSimpleDate(props.templateId)) return SimpleDateInvite(props);
  if (isStoryFork(props.templateId)) return StoryForkInvite(props);
  return (
    <ScreenShell kind="invite" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

function ForkScreen(props: ScreenProps): ReactNode {
  if (isStoryFork(props.templateId)) return StoryForkConfirm(props);
  return (
    <ScreenShell kind="fork" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

function PlacePickerScreen(props: ScreenProps): ReactNode {
  if (isStoryFork(props.templateId)) return StoryForkPlacePicker(props);
  return (
    <ScreenShell kind="placePicker" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

function TimePickerScreen(props: ScreenProps): ReactNode {
  if (isStoryFork(props.templateId)) return StoryForkTimePicker(props);
  return (
    <ScreenShell kind="timePicker" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

function RsvpScreen(props: ScreenProps): ReactNode {
  if (isEventRsvp(props.templateId)) return EventRsvpForm(props);
  return (
    <ScreenShell kind="rsvp" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

function EventDetailsScreen(props: ScreenProps): ReactNode {
  if (isEventRsvp(props.templateId)) return EventRsvpDetails(props);
  return (
    <ScreenShell kind="eventDetails" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

/**
 * Шаблон «date-ask» — финал согласия. Конфетти + плавающие сердечки и
 * успешный текст (рендерится обобщённым конфигом финала).
 */
function DateAskFinal({ screen, vars }: ScreenProps): ReactNode {
  const config = finalScreenConfig(screen, vars);
  return (
    <ScreenShell kind="final" screenId={screen.id}>
      <FloatingHearts count={14} />
      {config.hasConfetti ? <Confetti /> : null}
      <div className="t1-final">
        {config.successLines.map((line, index) => (
          <p key={index} className="t1-final__text">{line}</p>
        ))}
      </div>
    </ScreenShell>
  );
}

function FinalScreen(props: ScreenProps): ReactNode {
  if (props.templateId === 'date-ask') return DateAskFinal(props);
  if (isSimpleDate(props.templateId)) return SimpleDateFinal(props);
  if (isStoryFork(props.templateId)) {
    return isSoftDeclineScreen(props.screen)
      ? StoryForkSoftDecline(props)
      : StoryForkFinal(props);
  }
  if (isEventRsvp(props.templateId)) return EventRsvpConfirmation(props);
  return (
    <ScreenShell kind="final" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

/**
 * Mapping from a screen {@link ScreenKind} to its React component. This is the
 * single source of truth the {@link ScreenRenderer} uses to pick a component —
 * adding/replacing a screen kind means editing this map only.
 */
export const SCREEN_COMPONENTS: Record<
  ScreenKind,
  (props: ScreenProps) => ReactNode
> = {
  intro: IntroScreen,
  invite: InviteScreen,
  fork: ForkScreen,
  placePicker: PlacePickerScreen,
  timePicker: TimePickerScreen,
  rsvp: RsvpScreen,
  eventDetails: EventDetailsScreen,
  final: FinalScreen,
};

/**
 * Render a single scenario screen by mapping its `kind` to the matching
 * component (task 7.2). The engine decides *which* screen is current; this maps
 * that screen to UI.
 */
export function ScreenRenderer(props: ScreenProps): ReactNode {
  const Component = SCREEN_COMPONENTS[props.screen.kind];
  if (!Component) {
    // Unknown kind is a schema error; render nothing rather than crash the run.
    return null;
  }
  return <Component {...props} />;
}
