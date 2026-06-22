/**
 * Unit tests for {@link InMemoryTemplateRegistry} (task 3.1).
 *
 * Tests use a small, self-contained fixture schema so they do NOT depend on the
 * concrete MVP templates added in task 3.2. They cover:
 * - `validateAuthorData`: required-empty → error, maxLength overflow → error,
 *   wrong type → error, valid data → ok.
 * - `list` / `get` contract, including `get` of an unknown id throwing
 *   {@link TemplateNotFoundError}.
 * - `validateResponse` base checks (allowed outcome type, field type guards).
 */
import { describe, expect, it } from 'vitest';

import type { TemplateSchema } from '@/templates/types';
import { InMemoryTemplateRegistry, TemplateNotFoundError } from './registry';

const fixture: TemplateSchema = {
  id: 'fixture',
  name: 'Fixture Template',
  description: 'A test-only template.',
  themes: ['romantic', 'neutral'],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 10 },
    { key: 'note', label: 'Note', type: 'longtext', required: false, maxLength: 5 },
    { key: 'photo', label: 'Photo', type: 'image', required: false },
    { key: 'when', label: 'When', type: 'datetime', required: false },
    { key: 'wantsPlusOne', label: 'Plus one', type: 'boolean', required: false },
    { key: 'places', label: 'Places', type: 'placesList', required: false, maxLength: 2 },
  ],
  startScreen: 'screen-1',
  screens: [
    {
      id: 'screen-1',
      kind: 'invite',
      elements: [{ kind: 'heading', text: 'Hi {{name}}' }],
      transitions: [{ on: 'click:yes', to: 'screen-2' }],
    },
    {
      id: 'screen-2',
      kind: 'final',
      elements: [{ kind: 'text', text: 'Done' }],
      transitions: [],
      emits: [{ type: 'accepted', messageTemplate: '{{name}} said yes' }],
    },
  ],
  premiumFeatures: ['music'],
};

const registry = new InMemoryTemplateRegistry([fixture]);

describe('list', () => {
  it('returns summaries for all registered templates', () => {
    expect(registry.list()).toEqual([
      {
        id: 'fixture',
        name: 'Fixture Template',
        description: 'A test-only template.',
        themes: ['romantic', 'neutral'],
      },
    ]);
  });

  it('returns an empty array when no templates are registered', () => {
    expect(new InMemoryTemplateRegistry([]).list()).toEqual([]);
  });
});

describe('get', () => {
  it('returns the full schema by id', () => {
    expect(registry.get('fixture')).toBe(fixture);
  });

  it('throws TemplateNotFoundError for an unknown id', () => {
    expect(() => registry.get('nope')).toThrow(TemplateNotFoundError);
  });
});

describe('validateAuthorData', () => {
  it('accepts valid data', () => {
    const result = registry.validateAuthorData('fixture', {
      name: 'Aibek',
      note: 'hi',
      places: [{ name: 'Park' }],
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('reports an empty required field', () => {
    const result = registry.validateAuthorData('fixture', { name: '   ' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'name', code: 'required' }),
    );
  });

  it('reports a missing required field', () => {
    const result = registry.validateAuthorData('fixture', {});
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'name' && e.code === 'required')).toBe(
      true,
    );
  });

  it('reports a maxLength overflow on a string field', () => {
    const result = registry.validateAuthorData('fixture', {
      name: 'this-name-is-way-too-long',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'name', code: 'maxLength' }),
    );
  });

  it('reports too many places (placesList maxLength)', () => {
    const result = registry.validateAuthorData('fixture', {
      name: 'Aibek',
      places: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'places', code: 'maxLength' }),
    );
  });

  it('reports a wrong type for a text field', () => {
    const result = registry.validateAuthorData('fixture', { name: 123 });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'name', code: 'type' }),
    );
  });

  it('reports a wrong type for a boolean field', () => {
    const result = registry.validateAuthorData('fixture', {
      name: 'Aibek',
      wantsPlusOne: 'yes',
    });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'wantsPlusOne', code: 'type' }),
    );
  });

  it('reports an invalid datetime', () => {
    const result = registry.validateAuthorData('fixture', {
      name: 'Aibek',
      when: 'not-a-date',
    });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'when', code: 'type' }),
    );
  });

  it('accepts a valid datetime string', () => {
    const result = registry.validateAuthorData('fixture', {
      name: 'Aibek',
      when: '2025-01-01T10:00:00Z',
    });
    expect(result.ok).toBe(true);
  });

  it('throws TemplateNotFoundError for an unknown id', () => {
    expect(() => registry.validateAuthorData('nope', {})).toThrow(TemplateNotFoundError);
  });
});

describe('validateResponse', () => {
  it('accepts a response whose type the template emits', () => {
    const result = registry.validateResponse('fixture', { type: 'accepted' });
    expect(result.ok).toBe(true);
  });

  it('rejects a response type the template never emits', () => {
    const result = registry.validateResponse('fixture', { type: 'rsvp' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'type', code: 'enum' }),
    );
  });

  it('requires a response type', () => {
    const result = registry.validateResponse('fixture', {} as never);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'type', code: 'required' }),
    );
  });

  it('guards field types (place/guests/rsvp)', () => {
    const result = registry.validateResponse('fixture', {
      type: 'accepted',
      place: 42 as never,
      guests: 'two' as never,
      rsvp: 'maybe' as never,
    });
    expect(result.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['place', 'guests', 'rsvp']),
    );
  });

  it('throws TemplateNotFoundError for an unknown id', () => {
    expect(() => registry.validateResponse('nope', { type: 'accepted' })).toThrow(
      TemplateNotFoundError,
    );
  });
});
