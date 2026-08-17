"use client";

import { brandHue } from "@/components/brand/brand-mark";
import { useActiveBrand } from "@/features/brands/active-brand";

import { SAMPLE_PROFILES } from "./fixtures";
import type { BrandProfile } from "./types";

/**
 * **The one function that stands between this page and the API.**
 *
 * Every component in `brand-profile/` takes a `BrandProfile` and knows nothing else. When the
 * profile is wired, this hook becomes `useSWR([SCOPES.bfBrands, id], () => brandService.get(id))`
 * plus a mapper from `BrandWithSections` + `BrandAsset[]`, and nothing else in the feature moves.
 * That is the same seam the whole package shipped on in 1.31.0, where one branch inside
 * `apiFetch` carried fifteen screens.
 */

/**
 * Which sample a brand id gets — **deliberately a hash, not the first fixture.**
 *
 * The page is reached by picking a brand in the sidebar, so a resolver that answered the same
 * profile for every id would make the switcher look broken: pick another brand, watch the page
 * not change, file a bug against navigation. Hashing the id means switching brands visibly
 * switches the page and a given brand keeps *its* sample across reloads, which is what makes the
 * three states (written / half-written / near-empty) reviewable at all.
 *
 * `brandHue`'s FNV-1a is reused rather than re-rolled: it is already the function this shell
 * trusts to spread ids evenly, and a plain character sum collides constantly across sibling ids
 * from one generator.
 */
export function sampleProfileFor(brandId: string): BrandProfile {
  return SAMPLE_PROFILES[brandHue(brandId) % SAMPLE_PROFILES.length];
}

export interface BrandProfileState {
  profile: BrandProfile | undefined;
  /** The brand's real name, when the shell knows one. See {@link useBrandProfile}. */
  brandName: string | undefined;
  /** The brand id the profile stands for — the route's, or the shell's active brand. */
  brandId: string | undefined;
  isLoading: boolean;
  error: unknown;
}

/**
 * The profile for a brand id, or for the brand the shell is currently inside.
 *
 * **The route wins and the preference is the fallback**, which is the shape `active-brand.ts`
 * says a brand-scoped route should have and the shape `packages/web` already uses. `/brand` has
 * no id and reads the selection; `/brand/:id` names one.
 *
 * **The name is real and the content is not**, and the split is on purpose. Landing on a page
 * headed *Harbour Table* after picking *Acme* in the switcher reads as a broken integration
 * rather than as a preview, so the identity band uses the brand the shell actually holds. Every
 * word below it comes from the fixture and the page says so in a badge — one sample story per
 * brand, honest about being one.
 */
export function useBrandProfile(brandId?: string): BrandProfileState {
  const { brand, brands, isLoading, error } = useActiveBrand();

  // A named id resolves against the list the shell already has; an unknown id (a stale link, a
  // brand from another workspace) falls through to the active brand rather than to nothing.
  const resolved = (brandId ? brands.find((b) => b.id === brandId) : undefined) ?? brand;
  const id = resolved?.id ?? brandId;

  return {
    profile: id ? sampleProfileFor(id) : undefined,
    brandName: resolved?.name,
    brandId: id,
    isLoading,
    error,
  };
}
