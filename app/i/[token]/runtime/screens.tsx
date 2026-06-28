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
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';

import type { ScreenElement, ScreenKind, ScreenSchema } from '@/templates/types';

import { substitute } from './controller';
import { Confetti, Countdown, FloatingHearts, RunawayButton, resolveNoBehavior } from './animations';
import { StickerMedia } from '@/app/components/StickerMedia';
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

/**
 * Шаблоны с одинаковой структурой «интро → приглашение → подтверждение →
 * финал» (общий редактор + общий рантайм DateAskInvite/DateAskFinal,
 * различается только анимированное интро и CSS-тема). Их экраны invite/final
 * рендерятся одинаково.
 */
const SHARED_INVITE_TEMPLATES = new Set([
  'date-ask',
  'secret-letter',
  'mission-date',
  'movie-poster',
  'wish-star',
  'recipe-date',
  'ex-message',
  'interrogation',
  'tinder-story',
  'breaking-news',
  'horoscope',
  'boarding',
  'quest',
  'time-machine',
]);

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
        <StickerMedia
          key={element.id ?? index}
          className="screen__image"
          src={src}
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
          <StickerMedia className="t1-intro__photo" src={config.photo} />
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
          behavior={resolveNoBehavior(vars['кнопка_нет_поведение'])}
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
                    <StickerMedia className="t2-place__photo" src={place.photo} />
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
/**
 * Шаблон «mission-date» — экран 1 «Секретная папка». Тёмный фон,
 * мигающий гриф «СОВЕРШЕННО СЕКРЕТНО», сканирующая линия, пульсирующая
 * кнопка «Принять миссию 🔓».
 */
function MissionDateIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const button = screen.elements.find((el) => el.kind === 'button');
  const openAction = button?.action ?? 'click:open';

  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="mi-intro">
        <div className="mi-scanline" aria-hidden />
        <motion.div
          className="mi-stamp"
          initial={{ scale: 2, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {substitute(heading?.text, vars) || 'СОВЕРШЕННО СЕКРЕТНО'}
        </motion.div>
        <motion.p
          className="mi-intro__text"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          {substitute(text?.text, vars)}
        </motion.p>
        <motion.button
          type="button"
          className="screen__button mi-intro__btn"
          data-action={openAction}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: [1, 1.05, 1] }}
          transition={{
            opacity: { delay: 0.8, duration: 0.4 },
            scale: { delay: 1.2, duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
          }}
          onClick={() => onAction(openAction)}
        >
          {substitute(button?.text, vars) || 'Принять миссию 🔓'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/** Шаблон «movie-poster» — экран 1 «Афиша фильма». */
function MoviePosterIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const button = screen.elements.find((el) => el.kind === 'button');
  const openAction = button?.action ?? 'click:open';

  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="mv-intro">
        <motion.div
          className="mv-poster"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="mv-poster__genre">Романтика · 2024</span>
          <h1 className="mv-poster__title">{substitute(heading?.text, vars)}</h1>
          <span className="mv-poster__stars">★★★★★</span>
          <span className="mv-poster__premiere">СКОРО В ПРОКАТЕ</span>
        </motion.div>
        <motion.button
          type="button"
          className="screen__button mv-intro__btn"
          data-action={openAction}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(openAction)}
        >
          {substitute(button?.text, vars) || 'Купить билет 🎬'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/** Шаблон «wish-star» — экран 1 «Ночное небо с падающими звёздами». */
function WishStarIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const button = screen.elements.find((el) => el.kind === 'button');
  const openAction = button?.action ?? 'click:open';

  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="ws-intro">
        {Array.from({ length: 5 }, (_, i) => (
          <motion.span
            key={i}
            className="ws-shooting"
            style={{ top: `${10 + i * 14}%`, left: `${-10 + i * 5}%` }}
            animate={{ x: ['0vw', '60vw'], y: ['0vh', '30vh'], opacity: [0, 1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: i * 1.1, ease: 'easeIn' }}
          />
        ))}
        <motion.div
          className="ws-bigstar"
          aria-hidden
          animate={{ scale: [1, 1.2, 1], rotate: [0, 12, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          🌟
        </motion.div>
        {heading?.text ? <h1 className="ws-intro__title">{substitute(heading.text, vars)}</h1> : null}
        <motion.button
          type="button"
          className="screen__button ws-intro__btn"
          data-action={openAction}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(openAction)}
        >
          {substitute(button?.text, vars) || 'Поймать звезду 🌠'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/** Шаблон «recipe-date» — экран 1 «Страница кулинарной книги». */
function RecipeIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const button = screen.elements.find((el) => el.kind === 'button');
  const openAction = button?.action ?? 'click:open';

  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <motion.div
        className="rc-card"
        initial={{ opacity: 0, rotate: -2, y: 16 }}
        animate={{ opacity: 1, rotate: 0, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="rc-card__badge">Рецепт №1</span>
        <h1 className="rc-card__title">{substitute(heading?.text, vars)}</h1>
        <div className="rc-card__divider" />
        {text?.text ? <p className="rc-card__ingredients">{substitute(text.text, vars)}</p> : null}
        <motion.button
          type="button"
          className="screen__button rc-card__btn"
          data-action={openAction}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(openAction)}
        >
          {substitute(button?.text, vars) || 'Приготовить 🍳'}
        </motion.button>
      </motion.div>
    </ScreenShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Тематические компоненты многоэкранных шаблонов (ex-message, interrogation,
   tinder-story, breaking-news, horoscope, boarding, time-machine).
   Каждый шаблон получает фирменное интро + стилизованный «сюжетный» экран
   (kind: fork) с собственной анимацией вместо обобщённого ElementList.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Плавный счётчик 0 → `to` (для гороскопа). requestAnimationFrame, ~1.6 с. */
function CountUp({ to, duration = 1600 }: { to: number; duration?: number }): ReactNode {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic для приятного замедления у финала
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{value}</>;
}

/* ── Секретное сообщение (ex-message) ─────────────────────────────────────── */

/** ex-message — экран блокировки телефона с пуш-уведомлением. */
function ExMessageLock({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="xm-lock">
        <motion.div
          className="xm-notif"
          initial={{ opacity: 0, y: -24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <span className="xm-notif__app">💬 Сообщения · сейчас</span>
          {heading ? <span className="xm-notif__title">{substitute(heading.text, vars)}</span> : null}
          {text ? <span className="xm-notif__preview">{substitute(text.text, vars)}</span> : null}
        </motion.div>
        <motion.button
          type="button"
          className="screen__button xm-lock__btn"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(action)}
        >
          {substitute(btn?.text, vars) || 'Разблокировать 🔓'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/** ex-message — пузырь чата с анимацией «печатает…» перед появлением текста. */
function ExMessageChat({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 1000);
    return () => clearTimeout(t);
  }, [screen.id]);
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="xm-chat">
        {heading ? <p className="xm-chat__sender">{substitute(heading.text, vars)}</p> : null}
        {typing ? (
          <div className="xm-chat__bubble xm-chat__bubble--typing" aria-label="печатает">
            <span /><span /><span />
          </div>
        ) : (
          <motion.div
            className="xm-chat__bubble"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {substitute(text?.text, vars)}
          </motion.div>
        )}
        {!typing ? (
          <motion.button
            type="button"
            className="screen__button xm-chat__btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            onClick={() => onAction(action)}
          >
            {substitute(btn?.text, vars) || 'Дальше'}
          </motion.button>
        ) : null}
      </div>
    </ScreenShell>
  );
}

/* ── Допрос с пристрастием (interrogation) ────────────────────────────────── */

/** interrogation — тёмная комната допроса с раскачивающейся лампой. */
function InterrogationIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="ir-intro">
        <motion.div
          className="ir-lamp"
          aria-hidden
          style={{ transformOrigin: 'top center' }}
          animate={{ rotate: [-7, 7, -7] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="ir-lamp__wire" />
          <span className="ir-lamp__bulb">💡</span>
        </motion.div>
        {heading ? (
          <motion.h1
            className="ir-intro__alert"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {substitute(heading.text, vars)}
          </motion.h1>
        ) : null}
        {text ? <p className="screen__text">{substitute(text.text, vars)}</p> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Начать допрос 🎤'}
        </button>
      </div>
    </ScreenShell>
  );
}

/** interrogation — экран вопроса со «светом в лицо» и вариантами ответа. */
function InterrogationQuestion({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text' && el.id === 't')
    ?? screen.elements.find((el) => el.kind === 'text');
  const buttons = screen.elements.filter((el) => el.kind === 'button');
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <motion.div
        className="ir-spotlight"
        aria-hidden
        animate={{ opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="ir-question">
        {heading ? <p className="ir-question__num">{substitute(heading.text, vars)}</p> : null}
        {text ? <p className="ir-question__text">{substitute(text.text, vars)}</p> : null}
        <div className="ir-question__options">
          {buttons.map((b, i) => (
            <motion.button
              key={b.id ?? i}
              type="button"
              className="ir-question__option"
              whileTap={{ scale: 0.96 }}
              onClick={() => b.action && onAction(b.action)}
            >
              {substitute(b.text, vars)}
            </motion.button>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

/* ── Тиндер-стори (tinder-story) ──────────────────────────────────────────── */

/** tinder-story — экран загрузки «поиска пары» с пульсирующим логотипом. */
function TinderLoading({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="td-loading">
        <motion.div
          className="td-loading__flame"
          aria-hidden
          animate={{ scale: [1, 1.18, 1], rotate: [-4, 4, -4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          🔥
        </motion.div>
        {heading ? <h1 className="td-loading__logo">{substitute(heading.text, vars)}</h1> : null}
        {text ? <p className="screen__text">{substitute(text.text, vars)}</p> : null}
        <motion.button
          type="button"
          className="screen__button td-loading__btn"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(action)}
        >
          {substitute(btn?.text, vars) || 'Начать поиск 💘'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/** tinder-story — карточка профиля (свайп) и экран «IT'S A MATCH!». */
function TinderFork({ screen, vars, onAction }: ScreenProps): ReactNode {
  const isMatch = screen.id === 'match';
  const image = screen.elements.find((el) => el.kind === 'image');
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  const imgSrc = substitute(image?.src, vars);

  if (isMatch) {
    return (
      <ScreenShell kind="fork" screenId={screen.id}>
        <FloatingHearts count={16} />
        <div className="td-match">
          <motion.h1
            className="td-match__title"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 11 }}
          >
            {substitute(heading?.text, vars) || "IT'S A MATCH!"}
          </motion.h1>
          {text ? <p className="td-match__text">{substitute(text.text, vars)}</p> : null}
          <motion.button
            type="button"
            className="screen__button td-match__btn"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            onClick={() => onAction(action)}
          >
            {substitute(btn?.text, vars) || 'Написать сообщение 💬'}
          </motion.button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <motion.div
        className="td-card"
        initial={{ opacity: 0, x: 64, rotate: 6 }}
        animate={{ opacity: 1, x: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      >
        <div className="td-card__photo">
          {imgSrc ? (
            <StickerMedia className="td-card__img" src={imgSrc} />
          ) : (
            <span className="td-card__placeholder" aria-hidden>💘</span>
          )}
          <div className="td-card__info">
            {heading ? <span className="td-card__name">{substitute(heading.text, vars)}</span> : null}
            {text ? <span className="td-card__bio">{substitute(text.text, vars)}</span> : null}
          </div>
        </div>
        <motion.button
          type="button"
          className="td-card__like"
          whileTap={{ scale: 0.9 }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(action)}
        >
          {substitute(btn?.text, vars) || '♥ Нравится'}
        </motion.button>
      </motion.div>
    </ScreenShell>
  );
}

/* ── Новость дня (breaking-news) ──────────────────────────────────────────── */

/** Бегущая строка новостей. */
function NewsTicker(): ReactNode {
  return (
    <div className="bn-ticker" aria-hidden>
      <motion.span
        className="bn-ticker__track"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      >
        СРОЧНО · СЕНСАЦИЯ · ЭКСКЛЮЗИВ · СРОЧНО · СЕНСАЦИЯ · ЭКСКЛЮЗИВ ·&nbsp;
        СРОЧНО · СЕНСАЦИЯ · ЭКСКЛЮЗИВ · СРОЧНО · СЕНСАЦИЯ · ЭКСКЛЮЗИВ ·&nbsp;
      </motion.span>
    </div>
  );
}

/** breaking-news — мигающий баннер экстренного выпуска. */
function BreakingIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="bn-intro">
        <motion.div
          className="bn-banner"
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        >
          {substitute(heading?.text, vars) || '🔴 BREAKING NEWS'}
        </motion.div>
        {text ? <p className="bn-intro__lead">{substitute(text.text, vars)}</p> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Смотреть выпуск 📺'}
        </button>
      </div>
      <NewsTicker />
    </ScreenShell>
  );
}

/** breaking-news — студийный «сюжет» с плашкой LIVE и заголовком. */
function BreakingFork({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="bn-report">
        <motion.span
          className="bn-report__live"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          ● LIVE
        </motion.span>
        {heading ? <p className="bn-report__label">{substitute(heading.text, vars)}</p> : null}
        {text ? <h1 className="bn-report__headline">{substitute(text.text, vars)}</h1> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Подробности →'}
        </button>
      </div>
      <NewsTicker />
    </ScreenShell>
  );
}

/* ── Гороскоп совместимости (horoscope) ───────────────────────────────────── */

/** horoscope — звёздное интро с вращающимся кольцом знаков зодиака. */
function HoroscopeIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="horo-intro">
        <div className="horo-orbit" aria-hidden>
          <motion.div
            className="horo-orbit__ring"
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          >
            ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓
          </motion.div>
          <motion.span
            className="horo-orbit__core"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            ✨
          </motion.span>
        </div>
        {heading ? <h1 className="screen__heading">{substitute(heading.text, vars)}</h1> : null}
        {text ? <p className="screen__text">{substitute(text.text, vars)}</p> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Узнать гороскоп ♈'}
        </button>
      </div>
    </ScreenShell>
  );
}

/** horoscope — расчёт (счётчик до 100%) и результат (бейдж 100%). */
function HoroscopeFork({ screen, vars, onAction }: ScreenProps): ReactNode {
  const isCalc = screen.id === 'calc';
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="horo-fork">
        {isCalc ? (
          <>
            <motion.div
              className="horo-fork__ring"
              aria-hidden
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            >
              ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓
            </motion.div>
            <div className="horo-fork__percent">
              <CountUp to={100} />%
            </div>
            {heading ? <p className="screen__text">{substitute(heading.text, vars)}</p> : null}
          </>
        ) : (
          <>
            <motion.div
              className="horo-fork__badge"
              initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 12 }}
            >
              100%
            </motion.div>
            {heading ? <h1 className="screen__heading">{substitute(heading.text, vars)}</h1> : null}
            {text ? <p className="screen__text">{substitute(text.text, vars)}</p> : null}
          </>
        )}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Дальше'}
        </button>
      </div>
    </ScreenShell>
  );
}

/* ── Авиабилет (boarding) ─────────────────────────────────────────────────── */

/** boarding — интро с летящим самолётом. */
function BoardingIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="bd-intro">
        <motion.div
          className="bd-plane"
          aria-hidden
          animate={{ x: ['-45%', '45%'], y: ['6%', '-6%'] }}
          transition={{ duration: 3.4, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        >
          ✈️
        </motion.div>
        {heading ? <h1 className="screen__heading">{substitute(heading.text, vars)}</h1> : null}
        {text ? <p className="screen__text">{substitute(text.text, vars)}</p> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Открыть билет'}
        </button>
      </div>
    </ScreenShell>
  );
}

/** boarding — посадочный талон с перфорацией и штрихкодом. */
function BoardingFork({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <motion.div
        className="bd-pass"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="bd-pass__head">
          <span>BOARDING PASS</span>
          <span aria-hidden>✈️</span>
        </div>
        {heading ? <p className="bd-pass__flight">{substitute(heading.text, vars)}</p> : null}
        {text ? <p className="bd-pass__details">{substitute(text.text, vars)}</p> : null}
        <div className="bd-pass__perf" aria-hidden />
        <div className="bd-pass__barcode" aria-hidden />
        <button type="button" className="screen__button bd-pass__btn" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Регистрация на рейс →'}
        </button>
      </motion.div>
    </ScreenShell>
  );
}

/* ── Машина времени (time-machine) ────────────────────────────────────────── */

/** time-machine — интро с вращающимся порталом. */
function TimeMachineIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="tm-intro">
        <div className="tm-portal" aria-hidden>
          <motion.span
            className="tm-portal__ring"
            animate={{ rotate: 360 }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            className="tm-portal__icon"
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            ⏳
          </motion.span>
        </div>
        {heading ? <h1 className="screen__heading">{substitute(heading.text, vars)}</h1> : null}
        {text ? <p className="screen__text">{substitute(text.text, vars)}</p> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Запустить ⏳'}
        </button>
      </div>
    </ScreenShell>
  );
}

/** time-machine — «эпоха»: фото-полароид с подписью, либо текстовый экран. */
function TimeMachineFork({ screen, vars, onAction }: ScreenProps): ReactNode {
  const image = screen.elements.find((el) => el.kind === 'image');
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:next';
  const imgSrc = substitute(image?.src, vars);
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="tm-fork">
        {imgSrc ? (
          <motion.div
            className="tm-polaroid"
            initial={{ opacity: 0, rotate: -4, y: 18 }}
            animate={{ opacity: 1, rotate: 0, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <StickerMedia className="tm-polaroid__img" src={imgSrc} />
            {heading ? <span className="tm-polaroid__caption">{substitute(heading.text, vars)}</span> : null}
          </motion.div>
        ) : heading ? (
          <h1 className="screen__heading">{substitute(heading.text, vars)}</h1>
        ) : null}
        {text ? <p className="tm-fork__text">{substitute(text.text, vars)}</p> : null}
        <button type="button" className="screen__button" onClick={() => onAction(action)}>
          {substitute(btn?.text, vars) || 'Дальше →'}
        </button>
      </div>
    </ScreenShell>
  );
}

/* ── Квест: Найди приглашение (quest) ──────────────────────────────────────── */

/**
 * Квест — вступительный экран.
 * Атмосферный детективный стиль: лупа-эмодзи, заголовок, кнопка «Начать».
 */
function QuestIntro({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:start';
  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <div className="quest-intro">
        <motion.div
          className="quest-intro__icon"
          aria-hidden
          animate={{ rotate: [-8, 8, -8] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          🔍
        </motion.div>
        {heading && (
          <h1 className="screen__heading">{substitute(heading.text, vars)}</h1>
        )}
        {text && (
          <p className="quest-intro__desc">{substitute(text.text, vars)}</p>
        )}
        <motion.button
          type="button"
          className="screen__button quest-intro__start"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(action)}
        >
          {substitute(btn?.text, vars) || 'Начать квест 🚀'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/**
 * Квест — экран загадки.
 *
 * Кнопки вариантов перемешиваются один раз при монтировании (useMemo + стабильный
 * seed), чтобы правильный ответ каждый раз оказывался на разной позиции.
 * Кнопки с пустым текстом (необязательный 3-й неверный вариант) скрываются.
 */
function QuestRiddle({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const question = screen.elements.find((el) => el.kind === 'text' && el.id === 'q');
  const buttons = screen.elements.filter((el) => el.kind === 'button');

  // Shuffle buttons once per screen mount so the correct answer isn't always first.
  const shuffled = useMemo(() => {
    const resolved = buttons
      .map((btn) => ({ text: substitute(btn.text, vars), action: btn.action ?? '' }))
      .filter((b) => b.text.trim() !== '');
    // Fisher-Yates with a fixed-ish seed (screen id length) to stay stable across renders.
    const arr = [...resolved];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(((i * 31 + screen.id.length * 7) % (i + 1)));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);

  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="quest-riddle">
        {heading && (
          <p className="quest-riddle__badge">{substitute(heading.text, vars)}</p>
        )}
        {question && (
          <p className="quest-riddle__question">{substitute(question.text, vars)}</p>
        )}
        <div className="quest-riddle__options" role="list">
          {shuffled.map((btn, i) => (
            <motion.button
              key={i}
              type="button"
              role="listitem"
              className="quest-riddle__option"
              whileTap={{ scale: 0.95 }}
              onClick={() => btn.action && onAction(btn.action)}
            >
              {btn.text}
            </motion.button>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

/**
 * Квест — экран «Не то! Попробовать ещё раз».
 * Показывает подсказку (если автор её задал) и кнопку возврата к загадке.
 */
function QuestWrong({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const hint = screen.elements.find((el) => el.kind === 'text' && el.id === 'hint');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:retry';
  const hintText = substitute(hint?.text, vars);
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="quest-wrong">
        <motion.div
          className="quest-wrong__icon"
          aria-hidden
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 18 }}
        >
          ❌
        </motion.div>
        {heading && (
          <h1 className="screen__heading">{substitute(heading.text, vars)}</h1>
        )}
        {hintText ? (
          <p className="quest-wrong__hint">{hintText}</p>
        ) : null}
        <button
          type="button"
          className="screen__button quest-wrong__retry"
          onClick={() => onAction(action)}
        >
          {substitute(btn?.text, vars) || 'Попробовать ещё раз 🔄'}
        </button>
      </div>
    </ScreenShell>
  );
}

/**
 * Квест — экран «Тайник найден!».
 * Атмосферный момент перед открытием приглашения.
 */
function QuestChest({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const text = screen.elements.find((el) => el.kind === 'text');
  const btn = screen.elements.find((el) => el.kind === 'button');
  const action = btn?.action ?? 'click:open';
  return (
    <ScreenShell kind="fork" screenId={screen.id}>
      <div className="quest-chest">
        <motion.div
          className="quest-chest__icon"
          aria-hidden
          animate={{ y: [0, -10, 0], rotate: [0, 3, 0, -3, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          🎁
        </motion.div>
        {heading && (
          <h1 className="screen__heading">{substitute(heading.text, vars)}</h1>
        )}
        {text && <p className="quest-chest__text">{substitute(text.text, vars)}</p>}
        <motion.button
          type="button"
          className="screen__button quest-chest__open"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(action)}
        >
          {substitute(btn?.text, vars) || 'Открыть 🔓'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/** Whether the current screen belongs to the quest template. */
function isQuest(templateId: string | undefined): boolean {
  return templateId === 'quest';
}

/**
 * Квест — выбор нужного компонента по id экрана:
 *  intro / chest → специфичный экран
 *  r1 / r2       → QuestRiddle (загадка)
 *  r1_wrong / r2_wrong → QuestWrong (неверный ответ)
 */
function QuestForkScreen(props: ScreenProps): ReactNode {
  const id = props.screen.id;
  if (id === 'chest') return QuestChest(props);
  if (id === 'r1_wrong' || id === 'r2_wrong') return QuestWrong(props);
  // r1, r2 и любые будущие экраны с вариантами ответа
  return QuestRiddle(props);
}

/* ── end quest ─────────────────────────────────────────────────────────────── */

function IntroScreen(props: ScreenProps): ReactNode {
  if (isQuest(props.templateId)) return QuestIntro(props);
  if (props.templateId === 'ex-message') return ExMessageLock(props);
  if (props.templateId === 'interrogation') return InterrogationIntro(props);
  if (props.templateId === 'tinder-story') return TinderLoading(props);
  if (props.templateId === 'breaking-news') return BreakingIntro(props);
  if (props.templateId === 'horoscope') return HoroscopeIntro(props);
  if (props.templateId === 'boarding') return BoardingIntro(props);
  if (props.templateId === 'time-machine') return TimeMachineIntro(props);
  if (props.templateId === 'mission-date') return MissionDateIntro(props);
  if (props.templateId === 'secret-letter') return SecretLetterEnvelope(props);
  if (props.templateId === 'movie-poster') return MoviePosterIntro(props);
  if (props.templateId === 'wish-star') return WishStarIntro(props);
  if (props.templateId === 'recipe-date') return RecipeIntro(props);
  if (isSimpleDate(props.templateId)) return SimpleDateIntro(props);
  if (isEventRsvp(props.templateId)) return EventRsvpCover(props);
  return (
    <ScreenShell kind="intro" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

/**
 * Шаблон «secret-letter» — экран 1 «Конверт». Анимированный запечатанный
 * конверт с восковой печатью-сердцем и плавающими сердечками; кнопка
 * «Открыть письмо» раскрывает приглашение (переход к следующему экрану).
 */
function SecretLetterEnvelope({ screen, vars, onAction }: ScreenProps): ReactNode {
  const heading = screen.elements.find((el) => el.kind === 'heading');
  const button = screen.elements.find((el) => el.kind === 'button');
  const headingText = substitute(heading?.text, vars);
  const openAction = button?.action ?? 'click:open';

  return (
    <ScreenShell kind="intro" screenId={screen.id}>
      <FloatingHearts count={10} />
      <div className="sl-intro">
        <motion.div
          className="sl-envelope"
          aria-hidden
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: [0, -8, 0] }}
          transition={{
            scale: { duration: 0.5 },
            opacity: { duration: 0.5 },
            y: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <div className="sl-envelope__body" />
          <div className="sl-envelope__flap" />
          <motion.div
            className="sl-envelope__seal"
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            ♥
          </motion.div>
        </motion.div>

        {headingText ? <h1 className="sl-intro__title">{headingText}</h1> : null}

        <motion.button
          type="button"
          className="screen__button sl-intro__open"
          data-action={openAction}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => onAction(openAction)}
        >
          {substitute(button?.text, vars) || 'Открыть письмо 💌'}
        </motion.button>
      </div>
    </ScreenShell>
  );
}

/**
 * Шаблоны «date-ask» / «secret-letter» — экраны приглашения и подтверждения.
 * Картинка, заголовок, пара «Да / убегающая Нет» ({@link RunawayButton}): «Да»
 * растёт и ведёт дальше, «Нет» убегает и исчезает после нескольких попыток.
 *
 * На экране подтверждения подзаголовок скрыт до нажатия «Да» — после клика
 * появляется с анимацией, и через 1.5 с идёт переход к финалу.
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
  // Экран подтверждения — тот, где положительная кнопка ведёт «click:confirm».
  const isConfirmScreen = (yesAction).includes('confirm');

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
          <StickerMedia className="da-image" src={imgSrc} />
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
            behavior={resolveNoBehavior(vars['кнопка_нет_поведение'])}
            onYes={handleYes}
          />
        ) : null}
      </div>
    </ScreenShell>
  );
}

function InviteScreen(props: ScreenProps): ReactNode {
  if (props.templateId && SHARED_INVITE_TEMPLATES.has(props.templateId)) {
    return DateAskInvite(props);
  }
  if (isSimpleDate(props.templateId)) return SimpleDateInvite(props);
  if (isStoryFork(props.templateId)) return StoryForkInvite(props);
  return (
    <ScreenShell kind="invite" screenId={props.screen.id}>
      <ElementList {...props} />
    </ScreenShell>
  );
}

function ForkScreen(props: ScreenProps): ReactNode {
  if (isQuest(props.templateId)) return QuestForkScreen(props);
  if (props.templateId === 'ex-message') return ExMessageChat(props);
  if (props.templateId === 'interrogation') return InterrogationQuestion(props);
  if (props.templateId === 'tinder-story') return TinderFork(props);
  if (props.templateId === 'breaking-news') return BreakingFork(props);
  if (props.templateId === 'horoscope') return HoroscopeFork(props);
  if (props.templateId === 'boarding') return BoardingFork(props);
  if (props.templateId === 'time-machine') return TimeMachineFork(props);
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
  if (props.templateId && SHARED_INVITE_TEMPLATES.has(props.templateId)) {
    return DateAskFinal(props);
  }
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
