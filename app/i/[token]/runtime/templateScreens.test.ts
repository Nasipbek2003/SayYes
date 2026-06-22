/**
 * Unit tests for the Template 1 «Приглашение на свидание» (simple-date) screen
 * config helpers (task 8.1).
 *
 * These cover the pure data-extraction the detailed screen components rely on:
 *  - intro: photo / heart fallback, greeting, «Открыть» action;
 *  - invite: invitation text, signature, «Да» action, runaway attempt limit;
 *  - final: success copy lines + confetti effect detection.
 *
 * Run against the real `simple-date` schema so the helpers stay in sync with
 * the template definition.
 *
 * **Validates: Requirements 6.1, 6.4**
 */
import { describe, expect, it } from 'vitest';

import { simpleDate } from '@/templates/simple-date';
import type { ScreenSchema } from '@/templates/types';

import {
  findButtonAction,
  isSimpleDate,
  simpleDateFinalConfig,
  simpleDateIntroConfig,
  simpleDateInviteConfig,
} from './templateScreens';

function screen(id: string): ScreenSchema {
  const found = simpleDate.screens.find((s) => s.id === id);
  if (!found) throw new Error(`missing screen ${id}`);
  return found;
}

const VARS = {
  имя_адресата: 'Лео',
  фото: 'https://cdn.example/leo.jpg',
  текст_приглашения: 'Поужинаем вместе в субботу?',
  подпись: 'Аня',
};

describe('isSimpleDate', () => {
  it('matches only the simple-date template id', () => {
    expect(isSimpleDate('simple-date')).toBe(true);
    expect(isSimpleDate('story-fork')).toBe(false);
    expect(isSimpleDate(undefined)).toBe(false);
  });
});

describe('simpleDateIntroConfig (Экран 1 «Заставка»)', () => {
  it('resolves photo, greeting and the open action from vars', () => {
    const config = simpleDateIntroConfig(screen('intro'), VARS);
    expect(config.photo).toBe('https://cdn.example/leo.jpg');
    expect(config.heading).toBe('Привет, Лео!');
    expect(config.openLabel).toBe('Открыть');
    expect(config.openAction).toBe('click:open');
  });

  it('falls back to an empty photo (heart icon) when no photo is provided', () => {
    const config = simpleDateIntroConfig(screen('intro'), { имя_адресата: 'Лео' });
    expect(config.photo).toBe('');
    expect(config.heading).toBe('Привет, Лео!');
  });
});

describe('simpleDateInviteConfig (Экран 2 «Приглашение»)', () => {
  it('resolves invitation text, signature, yes action and attempt limit', () => {
    const config = simpleDateInviteConfig(screen('invite'), VARS);
    expect(config.inviteText).toBe('Поужинаем вместе в субботу?');
    expect(config.signature).toBe('— Аня');
    expect(config.yesLabel).toBe('Да!');
    expect(config.noLabel).toBe('Нет');
    expect(config.yesAction).toBe('click:yes');
    // The «Нет» button declares maxAttempts: 5 (Requirement 6.3).
    expect(config.attemptLimit).toBe(5);
  });

  it('defaults the attempt limit when the schema omits maxAttempts', () => {
    const base = screen('invite');
    const noProps: ScreenSchema = {
      ...base,
      elements: base.elements.map((el) =>
        el.id === 'no' ? { ...el, props: undefined } : el,
      ),
    };
    expect(simpleDateInviteConfig(noProps, VARS).attemptLimit).toBe(5);
  });
});

describe('simpleDateFinalConfig (Экран 3 «Согласие»)', () => {
  it('extracts the success copy and detects the confetti effect', () => {
    const config = simpleDateFinalConfig(screen('final'), VARS);
    expect(config.hasConfetti).toBe(true);
    expect(config.successLines).toEqual([
      'Ура! Я знал(а) :) Аня скоро напишет тебе.',
    ]);
  });
});

describe('findButtonAction', () => {
  it('finds the action whose value contains the needle', () => {
    expect(findButtonAction(screen('invite'), 'yes', 'fallback')).toBe('click:yes');
  });

  it('returns the fallback when no matching button exists', () => {
    expect(findButtonAction(screen('final'), 'yes', 'click:yes')).toBe('click:yes');
  });
});

/* --- Template 2 «Ты реально мне отказала?» (story-fork) helpers (task 8.2) ---
 *
 * Cover the pure config/selection logic the detailed Template 2 screens rely
 * on, against the real `story-fork` schema:
 *  - screen-1 invite: intro text + «Давай!»/«Нет, спасибо» actions (Req 7.1/7.2);
 *  - screen-2 fork: prompt + «Да»/«Нет» actions (Req 7.2/7.3);
 *  - screen-3 soft decline: copy + «Передумала?» action (Req 7.4);
 *  - screen-4 place picker: cards from список_мест / empty fallback (Req 7.5/7.6);
 *  - screen-5 time picker: prompt + confirm action;
 *  - selection readiness + dispatch payload (place/time → engine), Req 7.7.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**
 */
import { storyFork } from '@/templates/story-fork';

import {
  DEFAULT_PLACE_FIELD,
  DEFAULT_TIME_FIELD,
  buildSelectionPayload,
  finalScreenConfig,
  isSelectionReady,
  isSoftDeclineScreen,
  isStoryFork,
  storyForkConfirmConfig,
  storyForkInviteConfig,
  storyForkPlacePickerConfig,
  storyForkSoftDeclineConfig,
  storyForkTimePickerConfig,
  toPlaceCards,
} from './templateScreens';

function forkScreen(id: string): ScreenSchema {
  const found = storyFork.screens.find((s) => s.id === id);
  if (!found) throw new Error(`missing screen ${id}`);
  return found;
}

const FORK_VARS = {
  имя_адресата: 'Айгуль',
  вступительный_текст: 'Сходим куда-нибудь вдвоём?',
  подпись: 'Айбек',
  выбранное_место: 'Парк',
  выбранное_время: 'Суббота 18:00',
};

describe('isStoryFork', () => {
  it('matches only the story-fork template id', () => {
    expect(isStoryFork('story-fork')).toBe(true);
    expect(isStoryFork('simple-date')).toBe(false);
    expect(isStoryFork(undefined)).toBe(false);
  });
});

describe('storyForkInviteConfig (Экран 1 «Приглашение»)', () => {
  it('resolves intro text and both branch actions (Req 7.1/7.2)', () => {
    const config = storyForkInviteConfig(forkScreen('screen-1'), FORK_VARS);
    expect(config.introText).toBe('Сходим куда-нибудь вдвоём?');
    expect(config.yesLabel).toBe('Давай!');
    expect(config.yesAction).toBe('click:yes');
    expect(config.noLabel).toBe('Нет, спасибо');
    expect(config.noAction).toBe('click:no');
  });
});

describe('storyForkConfirmConfig (Экран 2 «Ты реально мне отказала?»)', () => {
  it('resolves the prompt and the Да/Нет actions (Req 7.2/7.3)', () => {
    const config = storyForkConfirmConfig(forkScreen('screen-2'), FORK_VARS);
    expect(config.prompt).toBe('Ты реально мне отказала?? 🥺');
    // «Да» confirms the decline, «Нет» changes her mind.
    expect(config.confirmLabel).toBe('Да');
    expect(config.confirmAction).toBe('click:yes');
    expect(config.cancelLabel).toBe('Нет');
    expect(config.cancelAction).toBe('click:no');
  });
});

describe('storyForkSoftDeclineConfig (Экран 3 «Мягкий финал отказа»)', () => {
  it('extracts the respectful copy and the «Передумала?» action (Req 7.4)', () => {
    const screen = forkScreen('screen-3');
    expect(isSoftDeclineScreen(screen)).toBe(true);
    const config = storyForkSoftDeclineConfig(screen, FORK_VARS);
    expect(config.textLines).toEqual([
      'Окей, понял(а). Но если передумаешь — ссылка всегда тут 💛',
    ]);
    expect(config.reconsiderLabel).toBe('Передумала?');
    expect(config.reconsiderAction).toBe('click:reconsider');
  });
});

describe('toPlaceCards', () => {
  it('maps localized place objects into cards (name/photo/description)', () => {
    const cards = toPlaceCards([
      { название: 'Парк', фото: 'p.jpg', описание: 'Прогулка' },
      { название: 'Кафе' },
    ]);
    expect(cards).toEqual([
      { name: 'Парк', photo: 'p.jpg', description: 'Прогулка' },
      { name: 'Кафе' },
    ]);
  });

  it('accepts bare strings and drops nameless/blank entries', () => {
    const cards = toPlaceCards(['Парк', { описание: 'no name' }, '   ', 5 as never]);
    expect(cards).toEqual([{ name: 'Парк' }]);
  });

  it('returns an empty array for a missing list', () => {
    expect(toPlaceCards(undefined)).toEqual([]);
  });
});

describe('storyForkPlacePickerConfig (Экран 4 «Выбор места»)', () => {
  it('builds place cards and the «Готово» action (Req 7.5)', () => {
    const config = storyForkPlacePickerConfig(
      forkScreen('screen-4'),
      [{ название: 'Парк' }, { название: 'Кафе' }],
      FORK_VARS,
    );
    expect(config.prompt).toBe('Отлично! Тогда выбери, куда хотим 👇');
    expect(config.placeField).toBe(DEFAULT_PLACE_FIELD);
    expect(config.doneAction).toBe('select:place');
    expect(config.isEmpty).toBe(false);
    expect(config.places.map((p) => p.name)).toEqual(['Парк', 'Кафе']);
  });

  it('falls back to a free input with the schema label when empty (Req 7.6)', () => {
    const config = storyForkPlacePickerConfig(forkScreen('screen-4'), [], FORK_VARS);
    expect(config.isEmpty).toBe(true);
    expect(config.places).toEqual([]);
    expect(config.emptyLabel).toBe('Напиши, куда хочешь');
  });
});

describe('storyForkTimePickerConfig (Экран 5 «Выбор времени»)', () => {
  it('resolves the prompt, confirm action and (empty) options', () => {
    const config = storyForkTimePickerConfig(forkScreen('screen-5'), FORK_VARS);
    expect(config.prompt).toBe('Когда тебе удобно?');
    expect(config.timeField).toBe(DEFAULT_TIME_FIELD);
    expect(config.confirmAction).toBe('select:time');
    // The schema declares free input (no fixed slots).
    expect(config.options).toEqual([]);
  });
});

describe('finalScreenConfig (Экран 6 «Финал согласия»)', () => {
  it('renders the success copy with chosen place/time and confetti (Req 7.7)', () => {
    const config = finalScreenConfig(forkScreen('screen-6'), FORK_VARS);
    expect(config.hasConfetti).toBe(true);
    expect(config.successLines).toEqual([
      'Свидание назначено! 🎉 Парк, Суббота 18:00.',
    ]);
  });

  it('treats the agreement final (screen-6) as not a soft-decline screen', () => {
    expect(isSoftDeclineScreen(forkScreen('screen-6'))).toBe(false);
  });
});

describe('selection readiness and dispatch payload (Req 7.5/7.7)', () => {
  it('is ready only for a trimmed, non-empty value', () => {
    expect(isSelectionReady('Парк')).toBe(true);
    expect(isSelectionReady('   ')).toBe(false);
    expect(isSelectionReady('')).toBe(false);
    expect(isSelectionReady(undefined)).toBe(false);
  });

  it('builds a single-key payload for the engine (place/time)', () => {
    expect(buildSelectionPayload('выбранное_место', '  Кафе ')).toEqual({
      выбранное_место: 'Кафе',
    });
    expect(buildSelectionPayload('выбранное_время', 'Вечер')).toEqual({
      выбранное_время: 'Вечер',
    });
  });

  it('returns null for an empty selection so callers never dispatch it', () => {
    expect(buildSelectionPayload('выбранное_место', '  ')).toBeNull();
    expect(buildSelectionPayload('выбранное_место', undefined)).toBeNull();
  });
});

/* --- Template 3 «Той / праздник» (event-rsvp) helpers (task 8.3) ---
 *
 * Cover the pure config/derivation + RSVP payload logic the detailed Template 3
 * screens rely on, against the real `event-rsvp` schema:
 *  - screen-1 cover: photo / title / «Открыть приглашение» action (Req 8.1);
 *  - screen-2 details: invite text, meta line, dress code (optional), countdown
 *    target, map URL from {{адрес}} (Req 8.1/8.2);
 *  - screen-3 form: attend/decline labels, party-size visibility, readiness;
 *  - RSVP payload → engine keys (имя_гостя/статус_rsvp/число_гостей/guestKey),
 *    so a repeat answer updates the same record (Req 8.3/8.5);
 *  - screen-4 confirmation: attend (confetti) vs decline (polite copy) (Req 8.4).
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 */
import { eventRsvp } from '@/templates/event-rsvp';

import {
  buildMapUrl,
  buildRsvpPayload,
  eventRsvpConfirmationConfig,
  eventRsvpCoverConfig,
  eventRsvpDetailsConfig,
  eventRsvpFormConfig,
  isEventRsvp,
  isRsvpReady,
  parseGuests,
  RSVP_DECLINE_TEXT,
  type RsvpFormState,
} from './templateScreens';

function rsvpScreen(id: string): ScreenSchema {
  const found = eventRsvp.screens.find((s) => s.id === id);
  if (!found) throw new Error(`missing screen ${id}`);
  return found;
}

const EVENT_VARS = {
  название_события: 'Свадьба Айбека и Айгуль',
  дата: '2025-09-01T16:00:00Z',
  время: '16:00',
  место: 'Ресторан «Достар»',
  адрес: 'Алматы, ул. Достык 1',
  текст_приглашения: 'Будем рады видеть вас на нашем празднике!',
  фото_обложка: 'https://cdn.example/cover.jpg',
  дресс_код: 'Чёрный галстук',
  сбор_числа_гостей: true,
};

describe('isEventRsvp', () => {
  it('matches only the event-rsvp template id', () => {
    expect(isEventRsvp('event-rsvp')).toBe(true);
    expect(isEventRsvp('simple-date')).toBe(false);
    expect(isEventRsvp(undefined)).toBe(false);
  });
});

describe('eventRsvpCoverConfig (Экран 1 «Обложка»)', () => {
  it('resolves cover photo, title and open action (Req 8.1)', () => {
    const config = eventRsvpCoverConfig(rsvpScreen('screen-1'), EVENT_VARS);
    expect(config.cover).toBe('https://cdn.example/cover.jpg');
    expect(config.title).toBe('Свадьба Айбека и Айгуль');
    expect(config.openLabel).toBe('Открыть приглашение');
    expect(config.openAction).toBe('click:open');
  });

  it('falls back to an empty cover when no photo is provided', () => {
    const config = eventRsvpCoverConfig(rsvpScreen('screen-1'), {
      название_события: 'Той',
    });
    expect(config.cover).toBe('');
    expect(config.title).toBe('Той');
  });
});

describe('buildMapUrl (Req 8.2)', () => {
  it('builds a maps search URL for an address', () => {
    expect(buildMapUrl('Алматы, ул. Достык 1')).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D0%90%D0%BB%D0%BC%D0%B0%D1%82%D1%8B%2C%20%D1%83%D0%BB.%20%D0%94%D0%BE%D1%81%D1%82%D1%8B%D0%BA%201',
    );
  });

  it('returns an empty string for a blank/missing address', () => {
    expect(buildMapUrl('   ')).toBe('');
    expect(buildMapUrl(undefined)).toBe('');
    expect(buildMapUrl(null)).toBe('');
  });
});

describe('eventRsvpDetailsConfig (Экран 2 «Детали события»)', () => {
  it('resolves invite text, meta line, dress code, countdown and map URL', () => {
    const config = eventRsvpDetailsConfig(rsvpScreen('screen-2'), EVENT_VARS);
    expect(config.inviteText).toBe('Будем рады видеть вас на нашем празднике!');
    expect(config.details).toBe('📅 2025-09-01T16:00:00Z · 🕐 16:00 · 📍 Ресторан «Достар»');
    expect(config.dressCode).toBe('Дресс-код: Чёрный галстук');
    expect(config.countdownTarget).toBe('2025-09-01T16:00:00Z');
    expect(config.mapUrl).toContain('https://www.google.com/maps/search/');
    expect(config.mapLabel).toBe('Показать на карте');
    expect(config.confirmAction).toBe('click:rsvp');
  });

  it('hides the dress code line when the author left it blank (optional)', () => {
    const config = eventRsvpDetailsConfig(rsvpScreen('screen-2'), {
      ...EVENT_VARS,
      дресс_код: '',
    });
    expect(config.dressCode).toBe('');
  });

  it('hides the map link when there is no address', () => {
    const config = eventRsvpDetailsConfig(rsvpScreen('screen-2'), {
      ...EVENT_VARS,
      адрес: '',
    });
    expect(config.mapUrl).toBe('');
  });
});

describe('eventRsvpFormConfig (Экран 3 «RSVP»)', () => {
  it('resolves choice labels and submit action, and reflects guest collection', () => {
    const config = eventRsvpFormConfig(rsvpScreen('screen-3'), EVENT_VARS);
    expect(config.attendLabel).toBe('Приду');
    expect(config.declineLabel).toBe('Не смогу');
    expect(config.submitAction).toBe('submit:rsvp');
    expect(config.collectsGuests).toBe(true);
  });

  it('reports no guest collection when the author disabled it', () => {
    const config = eventRsvpFormConfig(rsvpScreen('screen-3'), {
      ...EVENT_VARS,
      сбор_числа_гостей: false,
    });
    expect(config.collectsGuests).toBe(false);
  });
});

describe('parseGuests', () => {
  it('parses a positive integer string', () => {
    expect(parseGuests('2')).toBe(2);
    expect(parseGuests('  3 ')).toBe(3);
  });

  it('rejects non-numeric, zero, negative and blank values', () => {
    expect(parseGuests('two')).toBeNull();
    expect(parseGuests('0')).toBeNull();
    expect(parseGuests('-1')).toBeNull();
    expect(parseGuests('1.5')).toBeNull();
    expect(parseGuests('')).toBeNull();
    expect(parseGuests(undefined)).toBeNull();
  });
});

describe('isRsvpReady (Req 8.3)', () => {
  const ready = (state: Partial<RsvpFormState>, collects: boolean) =>
    isRsvpReady({ name: '', status: '', guests: '', ...state }, collects);

  it('requires a name and a decision', () => {
    expect(ready({ name: '', status: 'yes' }, false)).toBe(false);
    expect(ready({ name: 'Данияр', status: '' }, false)).toBe(false);
    expect(ready({ name: 'Данияр', status: 'no' }, false)).toBe(true);
  });

  it('requires a valid party size only when collecting and attending', () => {
    expect(ready({ name: 'Данияр', status: 'yes' }, true)).toBe(false);
    expect(ready({ name: 'Данияр', status: 'yes', guests: '2' }, true)).toBe(true);
    // Declining never needs a party size.
    expect(ready({ name: 'Данияр', status: 'no' }, true)).toBe(true);
    // Not collecting → no party size needed even when attending.
    expect(ready({ name: 'Данияр', status: 'yes' }, false)).toBe(true);
  });
});

describe('buildRsvpPayload (Req 8.3/8.5)', () => {
  it('builds engine keys for an attending RSVP with party size + guestKey', () => {
    const payload = buildRsvpPayload(
      { name: '  Данияр ', status: 'yes', guests: '3' },
      true,
      'guest-key-1',
    );
    expect(payload).toEqual({
      имя_гостя: 'Данияр',
      статус_rsvp: 'yes',
      число_гостей: 3,
      guestKey: 'guest-key-1',
    });
  });

  it('omits party size for a declining RSVP', () => {
    const payload = buildRsvpPayload(
      { name: 'Данияр', status: 'no', guests: '3' },
      true,
      'guest-key-1',
    );
    expect(payload).toEqual({
      имя_гостя: 'Данияр',
      статус_rsvp: 'no',
      guestKey: 'guest-key-1',
    });
  });

  it('omits party size when the author did not collect it', () => {
    const payload = buildRsvpPayload(
      { name: 'Данияр', status: 'yes', guests: '3' },
      false,
      'guest-key-1',
    );
    expect(payload).toEqual({
      имя_гостя: 'Данияр',
      статус_rsvp: 'yes',
      guestKey: 'guest-key-1',
    });
  });

  it('returns null when the form is not ready', () => {
    expect(buildRsvpPayload({ name: '', status: 'yes', guests: '' }, false, 'k')).toBeNull();
    expect(
      buildRsvpPayload({ name: 'Д', status: 'yes', guests: 'x' }, true, 'k'),
    ).toBeNull();
  });
});

describe('eventRsvpConfirmationConfig (Экран 4 «Подтверждение», Req 8.4)', () => {
  it('shows the success copy + confetti when attending', () => {
    const config = eventRsvpConfirmationConfig(rsvpScreen('screen-4'), {
      ...EVENT_VARS,
      статус_rsvp: 'yes',
    });
    expect(config.attending).toBe(true);
    expect(config.hasConfetti).toBe(true);
    expect(config.lines).toEqual(['Спасибо! Будем рады видеть тебя 🎉']);
  });

  it('shows the polite decline copy with no confetti when not attending', () => {
    const config = eventRsvpConfirmationConfig(rsvpScreen('screen-4'), {
      ...EVENT_VARS,
      статус_rsvp: 'no',
    });
    expect(config.attending).toBe(false);
    expect(config.hasConfetti).toBe(false);
    expect(config.lines).toEqual([RSVP_DECLINE_TEXT]);
  });
});
