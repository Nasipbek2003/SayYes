/**
 * Tier feature resolution (task 5.3).
 *
 * Pure domain logic that maps an invitation's {@link Tier} (and the template's
 * declared `premiumFeatures` list) to the concrete set of capabilities that
 * should be enabled when rendering the invitation — both in the pre-payment
 * preview payload ({@link PreviewPayload}) and on the public guest-facing page.
 *
 * It encodes Requirements 3.5 / 3.6 and Correctness Property 9:
 *
 *  - **BASIC** (Requirement 3.5): the brand signature is shown; no premium
 *    capabilities (background music, advanced animations, author
 *    notifications) are enabled; the descriptive `premiumFeatures` list is
 *    empty because nothing premium is unlocked.
 *  - **PREMIUM** (Requirement 3.6): the brand signature is removed and the
 *    premium capabilities are enabled (background music, advanced animations,
 *    author notifications); the template's human-readable `premiumFeatures`
 *    list is surfaced so the UI can describe what is unlocked.
 *
 * The function is intentionally side-effect free and depends only on its
 * inputs, so it can be reused anywhere a tier needs to be turned into concrete
 * render flags and is trivial to test exhaustively (Property 9).
 */
import type { Tier } from '@prisma/client';

/**
 * Concrete capability flags derived from an invitation's tier. These drive what
 * the renderer shows: whether the viral brand signature is present, and which
 * premium-only behaviours are active.
 */
export interface TierFeatures {
  /**
   * Whether the viral brand signature is shown in the invitation. `true` for
   * BASIC (Requirement 3.5), `false` for PREMIUM (Requirement 3.6).
   */
  showBrandSignature: boolean;
  /** Background music available (premium-only, Requirement 3.6). */
  music: boolean;
  /** Extended transition animations enabled (premium-only, Requirement 3.6). */
  advancedAnimations: boolean;
  /** Author notifications enabled (premium-only, Requirement 3.6). */
  authorNotifications: boolean;
  /**
   * Human-readable list of unlocked premium features (from the template's
   * `premiumFeatures`). Empty for BASIC, the template's list for PREMIUM, so
   * the UI can describe what the premium tier includes.
   */
  premiumFeatures: string[];
}

/**
 * Resolve the {@link TierFeatures} for an invitation.
 *
 * @param tier - The invitation's tier (`BASIC` | `PREMIUM`).
 * @param premiumFeatures - The template's declared `premiumFeatures` list. Only
 *   surfaced for the premium tier; defaults to an empty list when omitted.
 * @returns The concrete render flags for the given tier (Property 9).
 */
export function resolveTierFeatures(
  tier: Tier,
  premiumFeatures: readonly string[] = [],
): TierFeatures {
  if (tier === 'PREMIUM') {
    return {
      showBrandSignature: false,
      music: true,
      advancedAnimations: true,
      authorNotifications: true,
      premiumFeatures: [...premiumFeatures],
    };
  }

  // BASIC (and any non-premium tier): brand signature shown, no premium extras.
  return {
    showBrandSignature: true,
    music: false,
    advancedAnimations: false,
    authorNotifications: false,
    premiumFeatures: [],
  };
}

/**
 * Convenience predicate: whether the brand signature must be shown for a tier.
 * Equivalent to `resolveTierFeatures(tier).showBrandSignature` but spares
 * callers that only care about the signature from building the full object.
 */
export function showsBrandSignature(tier: Tier): boolean {
  return tier !== 'PREMIUM';
}
