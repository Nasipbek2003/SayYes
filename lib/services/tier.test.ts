/**
 * Tests for tier feature resolution (task 5.3).
 *
 * Covers Requirements 3.5 / 3.6 and Correctness Property 9 (tier consistency):
 *  - BASIC ⇒ brand signature present, no premium features enabled;
 *  - PREMIUM ⇒ brand signature absent, premium features enabled.
 *
 * Includes example-based unit tests plus a property-based test (fast-check)
 * for Property 9 across arbitrary tiers and template `premiumFeatures` lists.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Tier } from '@prisma/client';

import { resolveTierFeatures, showsBrandSignature } from './tier';

describe('resolveTierFeatures', () => {
  it('BASIC shows the brand signature and disables all premium features (Requirement 3.5)', () => {
    const features = resolveTierFeatures('BASIC', ['Музыка', 'Без подписи']);

    expect(features).toEqual({
      showBrandSignature: true,
      music: false,
      advancedAnimations: false,
      authorNotifications: false,
      premiumFeatures: [],
    });
  });

  it('PREMIUM hides the brand signature and enables premium features (Requirement 3.6)', () => {
    const list = ['Расширенные анимации', 'Фоновая музыка', 'Без подписи бренда'];
    const features = resolveTierFeatures('PREMIUM', list);

    expect(features).toEqual({
      showBrandSignature: false,
      music: true,
      advancedAnimations: true,
      authorNotifications: true,
      premiumFeatures: list,
    });
  });

  it('defaults the premium features list to empty when omitted', () => {
    expect(resolveTierFeatures('PREMIUM').premiumFeatures).toEqual([]);
    expect(resolveTierFeatures('BASIC').premiumFeatures).toEqual([]);
  });

  it('returns a defensive copy of the premium features list', () => {
    const list = ['a', 'b'];
    const features = resolveTierFeatures('PREMIUM', list);
    features.premiumFeatures.push('mutated');
    expect(list).toEqual(['a', 'b']);
  });
});

describe('showsBrandSignature', () => {
  it('is true for BASIC and false for PREMIUM', () => {
    expect(showsBrandSignature('BASIC')).toBe(true);
    expect(showsBrandSignature('PREMIUM')).toBe(false);
  });
});

/**
 * Property 9: tier consistency.
 *
 * `tier = BASIC` ⇒ brand signature present (and no premium features);
 * `tier = PREMIUM` ⇒ brand signature absent and premium features enabled.
 *
 * **Validates: Requirements 3.5, 3.6**
 */
describe('Property 9: tier consistency', () => {
  const tierArb = fc.constantFrom<Tier>('BASIC', 'PREMIUM');
  const premiumFeaturesArb = fc.array(fc.string(), { maxLength: 5 });

  it('brand signature presence and premium features are consistent with the tier', () => {
    fc.assert(
      fc.property(tierArb, premiumFeaturesArb, (tier, premiumFeatures) => {
        const features = resolveTierFeatures(tier, premiumFeatures);

        if (tier === 'BASIC') {
          // Brand signature present; nothing premium enabled.
          expect(features.showBrandSignature).toBe(true);
          expect(features.music).toBe(false);
          expect(features.advancedAnimations).toBe(false);
          expect(features.authorNotifications).toBe(false);
          expect(features.premiumFeatures).toEqual([]);
        } else {
          // PREMIUM: signature absent, premium capabilities enabled, and the
          // template's premium features are surfaced.
          expect(features.showBrandSignature).toBe(false);
          expect(features.music).toBe(true);
          expect(features.advancedAnimations).toBe(true);
          expect(features.authorNotifications).toBe(true);
          expect(features.premiumFeatures).toEqual(premiumFeatures);
        }

        // The signature is shown iff no premium features are enabled — the two
        // tiers are mutually exclusive on this axis.
        expect(features.showBrandSignature).toBe(!features.music);
        expect(features.showBrandSignature).toBe(showsBrandSignature(tier));
      }),
      { numRuns: 200 },
    );
  });
});
