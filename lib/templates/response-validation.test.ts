/**
 * Server-side response validation tests for the three MVP templates (task 3.3).
 *
 * Property 5 — Серверная валидация ответа: любой принятый `respond` проходит
 * `validateResponse` против схемы шаблона и author data приглашения; ответ, не
 * соответствующий схеме (несуществующее место, неверный тип, отсутствующие
 * обязательные поля RSVP), отклоняется.
 *
 * **Validates: Requirements 5.5, 7.5, 8.3** (and Requirement 7.6 for the empty
 * places-list free-form path).
 *
 * Tests run against the real MVP schemas via {@link InMemoryTemplateRegistry},
 * exercising the optional `authorData` argument so author-dependent rules
 * (place must be in the author's list, party size required when collected) are
 * covered.
 */
import { describe, expect, it } from 'vitest';

import { eventRsvp } from '@/templates/event-rsvp';
import { simpleDate } from '@/templates/simple-date';
import { storyFork } from '@/templates/story-fork';
import { InMemoryTemplateRegistry } from './registry';

const registry = new InMemoryTemplateRegistry([simpleDate, storyFork, eventRsvp]);

const hasError = (
  result: { errors: { field?: string; code: string }[] },
  field: string,
  code?: string,
) =>
  result.errors.some((e) => e.field === field && (code === undefined || e.code === code));

describe('story-fork (Template 2) — place selection (Requirements 7.5, 7.6)', () => {
  const authorWithPlaces = {
    имя_адресата: 'Айгуль',
    вступительный_текст: 'Сходим куда-нибудь вдвоём?',
    подпись: 'Айбек',
    список_мест: [{ название: 'Парк' }, { название: 'Кафе «Уют»' }],
  };

  it('accepts an "accepted" answer with a place from the author list', () => {
    const result = registry.validateResponse(
      'story-fork',
      { type: 'accepted', place: 'Кафе «Уют»', time: 'суббота 19:00' },
      authorWithPlaces,
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects an "accepted" answer with a place NOT in the author list', () => {
    const result = registry.validateResponse(
      'story-fork',
      { type: 'accepted', place: 'Кино' },
      authorWithPlaces,
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'place', 'enum')).toBe(true);
  });

  it('rejects an "accepted" answer with no place when the list is non-empty', () => {
    const result = registry.validateResponse(
      'story-fork',
      { type: 'accepted' },
      authorWithPlaces,
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'place', 'required')).toBe(true);
  });

  it('accepts a free-form place when the author list is empty (Requirement 7.6)', () => {
    const authorNoPlaces = {
      имя_адресата: 'Айгуль',
      вступительный_текст: 'Сходим куда-нибудь вдвоём?',
      подпись: 'Айбек',
      список_мест: [],
    };
    const result = registry.validateResponse(
      'story-fork',
      { type: 'accepted', place: 'Куда-нибудь к морю' },
      authorNoPlaces,
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects an empty free-form place when the author list is empty', () => {
    const result = registry.validateResponse(
      'story-fork',
      { type: 'accepted', place: '   ' },
      { список_мест: [] },
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'place', 'required')).toBe(true);
  });

  it('accepts a "declined" answer without a place', () => {
    const result = registry.validateResponse(
      'story-fork',
      { type: 'declined' },
      authorWithPlaces,
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('still requires a place for "accepted" when authorData is omitted', () => {
    const result = registry.validateResponse('story-fork', { type: 'accepted' });
    expect(result.ok).toBe(false);
    expect(hasError(result, 'place', 'required')).toBe(true);
  });
});

describe('event-rsvp (Template 3) — RSVP fields (Requirement 8.3)', () => {
  const authorCollectsGuests = {
    название_события: 'Свадьба Айбека и Айгуль',
    дата: '2025-09-01T16:00:00Z',
    время: '16:00',
    место: 'Ресторан «Достар»',
    текст_приглашения: 'Будем рады видеть вас!',
    сбор_числа_гостей: true,
  };

  it('accepts a valid RSVP (name + yes)', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', guestName: 'Данияр', rsvp: 'yes', guests: 2 },
      authorCollectsGuests,
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('accepts a "no" RSVP without a guest count even when collection is enabled', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', guestName: 'Данияр', rsvp: 'no' },
      authorCollectsGuests,
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects an RSVP without a guest name', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', rsvp: 'yes', guests: 1 },
      authorCollectsGuests,
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'guestName', 'required')).toBe(true);
  });

  it('rejects an RSVP decision outside {yes,no}', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', guestName: 'Данияр', rsvp: 'maybe' as never },
      authorCollectsGuests,
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'rsvp')).toBe(true);
  });

  it('rejects a non-numeric guest count when collection is enabled and attending', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', guestName: 'Данияр', rsvp: 'yes', guests: 'two' as never },
      authorCollectsGuests,
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'guests')).toBe(true);
  });

  it('rejects a non-positive guest count when collection is enabled and attending', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', guestName: 'Данияр', rsvp: 'yes', guests: 0 },
      authorCollectsGuests,
    );
    expect(result.ok).toBe(false);
    expect(hasError(result, 'guests', 'type')).toBe(true);
  });

  it('does not require a guest count when the author did not enable collection', () => {
    const result = registry.validateResponse(
      'event-rsvp',
      { type: 'rsvp', guestName: 'Данияр', rsvp: 'yes' },
      { ...authorCollectsGuests, сбор_числа_гостей: false },
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });
});

describe('simple-date (Template 1) — outcome type (Requirement 5.5)', () => {
  it('accepts an "accepted" answer (no place/time required)', () => {
    const result = registry.validateResponse('simple-date', { type: 'accepted' });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects an outcome type the template never emits (e.g. rsvp)', () => {
    const result = registry.validateResponse('simple-date', {
      type: 'rsvp',
      guestName: 'X',
      rsvp: 'yes',
    });
    expect(result.ok).toBe(false);
    expect(hasError(result, 'type', 'enum')).toBe(true);
  });
});
