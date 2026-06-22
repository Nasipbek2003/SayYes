/**
 * Tests for the template gallery view-model builder (task 10.1).
 *
 * Covers Requirement 1.1 (list with preview/name/description), 1.2 (create
 * link carries the chosen template), 1.3 (per-theme selection links) and 1.4
 * (empty state when no templates are available). Logic is tested at the helper
 * level (the project's test environment is `node`), keeping the React server
 * component a thin mapping over these view models.
 */
import { describe, expect, it } from 'vitest';

import {
  CREATE_PATH,
  buildCreateHref,
  buildGallery,
} from '@/lib/gallery/gallery';
import { InMemoryTemplateRegistry } from '@/lib/templates/registry';
import { templateSchemas } from '@/templates';
import type { TemplateRegistry, TemplateSummary } from '@/templates/types';

/** A registry exposing exactly the provided summaries (other methods unused). */
function registryFrom(summaries: TemplateSummary[]): TemplateRegistry {
  return {
    list: () => summaries,
    get: () => {
      throw new Error('not used');
    },
    validateAuthorData: () => ({ ok: true, errors: [] }),
    validateResponse: () => ({ ok: true, errors: [] }),
  };
}

describe('buildCreateHref', () => {
  it('encodes the template id under the create path (Requirement 1.2)', () => {
    expect(buildCreateHref('simple-date')).toBe(`${CREATE_PATH}?template=simple-date`);
  });

  it('includes the theme when provided (Requirement 1.3)', () => {
    expect(buildCreateHref('story-fork', 'playful')).toBe(
      `${CREATE_PATH}?template=story-fork&theme=playful`,
    );
  });
});

describe('buildGallery — real MVP templates', () => {
  it('produces one card per registered template (Requirement 1.1)', () => {
    const gallery = buildGallery(new InMemoryTemplateRegistry(templateSchemas));
    expect(gallery.map((c) => c.id)).toEqual(templateSchemas.map((s) => s.id));
  });

  it('exposes name, description and a preview for each card (Requirement 1.1)', () => {
    const gallery = buildGallery(new InMemoryTemplateRegistry(templateSchemas));
    for (const card of gallery) {
      expect(card.name).not.toBe('');
      expect(card.description).not.toBe('');
      expect(card.previewGradient).toContain('linear-gradient');
      expect(card.previewEmoji).not.toBe('');
    }
  });

  it('links each card into the creation flow with its template (Requirement 1.2)', () => {
    const gallery = buildGallery(new InMemoryTemplateRegistry(templateSchemas));
    for (const card of gallery) {
      expect(card.createHref).toContain(`template=${card.id}`);
      expect(card.createHref.startsWith(CREATE_PATH)).toBe(true);
    }
  });

  it('offers a selectable link for every theme of a template (Requirement 1.3)', () => {
    const gallery = buildGallery(new InMemoryTemplateRegistry(templateSchemas));
    const storyFork = gallery.find((c) => c.id === 'story-fork');
    expect(storyFork).toBeDefined();
    // story-fork declares 3 themes: romantic, playful, neutral.
    expect(storyFork?.themes.map((t) => t.id)).toEqual(['romantic', 'playful', 'neutral']);
    for (const theme of storyFork!.themes) {
      expect(theme.href).toContain('template=story-fork');
      expect(theme.href).toContain(`theme=${theme.id}`);
      expect(theme.label).not.toBe('');
      expect(theme.gradient).toContain('linear-gradient');
    }
  });
});

describe('buildGallery — empty / edge cases', () => {
  it('returns an empty array when no templates are available (Requirement 1.4)', () => {
    expect(buildGallery(new InMemoryTemplateRegistry([]))).toEqual([]);
  });

  it('falls back to a neutral theme for a template that declares none', () => {
    const summary: TemplateSummary = {
      id: 'themeless',
      name: 'Themeless',
      description: 'No themes declared',
      themes: [],
    };
    const [card] = buildGallery(registryFrom([summary]));
    expect(card.themes).toHaveLength(1);
    expect(card.themes[0].id).toBe('neutral');
    expect(card.previewGradient).toContain('linear-gradient');
    expect(card.createHref).toContain('theme=neutral');
  });

  it('uses the first declared theme as the default create link', () => {
    const summary: TemplateSummary = {
      id: 'multi',
      name: 'Multi',
      description: 'Several themes',
      themes: ['festive', 'elegant'],
    };
    const [card] = buildGallery(registryFrom([summary]));
    expect(card.createHref).toContain('theme=festive');
  });
});
