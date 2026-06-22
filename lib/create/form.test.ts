/**
 * Unit tests for the author creation-form helpers (task 10.2).
 *
 * Cover the pure logic behind the form: field→input mapping, initial data
 * seeding, immutable field/places editing, sanitisation and client-side
 * validation (mirroring the server registry).
 */
import { describe, expect, it } from 'vitest';

import type {
  TemplateRegistry,
  TemplateSchema,
  ValidationResult,
} from '@/templates/types';
import {
  addPlace,
  buildInitialData,
  fieldInputKind,
  readPlaces,
  removePlace,
  sanitizePlaces,
  setFieldValue,
  toPersistedData,
  updatePlace,
  validateAuthorForm,
} from './form';

describe('fieldInputKind', () => {
  it('maps each template field type to a concrete control', () => {
    expect(fieldInputKind('text')).toBe('text');
    expect(fieldInputKind('longtext')).toBe('textarea');
    expect(fieldInputKind('image')).toBe('image');
    expect(fieldInputKind('placesList')).toBe('places');
    expect(fieldInputKind('datetime')).toBe('datetime');
    expect(fieldInputKind('boolean')).toBe('checkbox');
  });
});

const schema: Pick<TemplateSchema, 'fields'> = {
  fields: [
    { key: 'имя', label: 'Имя', type: 'text', required: true },
    { key: 'согласие', label: 'Согласие', type: 'boolean', required: false },
    { key: 'места', label: 'Места', type: 'placesList', required: false },
  ],
};

describe('buildInitialData', () => {
  it('seeds per-field defaults', () => {
    const data = buildInitialData(schema);
    expect(data).toEqual({ имя: '', согласие: false, места: [] });
  });

  it('overlays existing draft data and preserves unknown keys', () => {
    const data = buildInitialData(schema, { имя: 'Аня', extra: 42 });
    expect(data.имя).toBe('Аня');
    expect(data.согласие).toBe(false);
    expect(data.extra).toBe(42);
  });
});

describe('setFieldValue', () => {
  it('immutably updates one key', () => {
    const a = { имя: '' };
    const b = setFieldValue(a, 'имя', 'Аня');
    expect(b).toEqual({ имя: 'Аня' });
    expect(a.имя).toBe('');
  });
});

describe('places editor', () => {
  it('adds, updates and removes places immutably', () => {
    let places = readPlaces([]);
    places = addPlace(places);
    expect(places).toHaveLength(1);

    places = updatePlace(places, 0, { название: 'Кафе', описание: 'уютное' });
    expect(places[0]).toEqual({ название: 'Кафе', описание: 'уютное' });

    places = addPlace(places);
    places = updatePlace(places, 1, { название: 'Парк' });
    expect(places).toHaveLength(2);

    const removed = removePlace(places, 0);
    expect(removed).toHaveLength(1);
    expect(removed[0].название).toBe('Парк');
  });

  it('readPlaces tolerates strings and bad shapes', () => {
    expect(readPlaces(['Кафе'])).toEqual([{ название: 'Кафе' }]);
    expect(readPlaces('nope')).toEqual([]);
    expect(readPlaces([{ name: 'Park', image: 'p.jpg' }])).toEqual([
      { название: 'Park', фото: 'p.jpg' },
    ]);
  });

  it('sanitizePlaces trims and drops empty rows/fields', () => {
    const result = sanitizePlaces([
      { название: '  Кафе  ', фото: '  ', описание: 'уютное' },
      { название: '   ' },
      { название: 'Парк', фото: 'park.jpg' },
    ]);
    expect(result).toEqual([
      { название: 'Кафе', описание: 'уютное' },
      { название: 'Парк', фото: 'park.jpg' },
    ]);
  });
});

describe('toPersistedData', () => {
  it('sanitises places arrays in the data bag', () => {
    const out = toPersistedData({
      имя: 'Аня',
      места: [{ название: 'Кафе' }, { название: '' }],
    });
    expect(out.места).toEqual([{ название: 'Кафе' }]);
    expect(out.имя).toBe('Аня');
  });
});

/** Minimal fake registry to test validation projection without the real one. */
function fakeRegistry(result: ValidationResult): TemplateRegistry {
  return {
    list: () => [],
    get: () => {
      throw new Error('not used');
    },
    validateAuthorData: () => result,
    validateResponse: () => ({ ok: true, errors: [] }),
  };
}

describe('validateAuthorForm', () => {
  it('projects registry errors to a per-field message map', () => {
    const registry = fakeRegistry({
      ok: false,
      errors: [
        { field: 'имя', code: 'required', message: 'Имя обязательно' },
        { field: 'имя', code: 'maxLength', message: 'слишком длинно' },
        { code: 'type', message: 'whole-object error' },
      ],
    });
    const result = validateAuthorForm('t', { имя: '' }, registry);
    expect(result.ok).toBe(false);
    // First error per field wins.
    expect(result.fieldErrors['имя']).toBe('Имя обязательно');
    expect(result.fieldErrors['_']).toBe('whole-object error');
  });

  it('reports ok when registry has no errors', () => {
    const registry = fakeRegistry({ ok: true, errors: [] });
    expect(validateAuthorForm('t', { имя: 'Аня' }, registry).ok).toBe(true);
  });
});
