"use client";

import type { BrandWithSections } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { useActiveBrand } from "@/features/brands/active-brand";
import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { brandProfileService, type GuidelineWrite } from "./api";
import { toBrandProfile } from "./map";
import type { BrandProfile } from "./types";

/**
 * **The one seam between this page and the API**, as it was designed to be.
 *
 * Every component in `brand-profile/` takes a `BrandProfile` and knows nothing else, and that
 * held: wiring the page replaced this file's body — `sampleProfileFor` and three fixtures — with
 * two `useSWR` calls and `toBrandProfile`, and **no component moved**. That is the same seam the
 * whole package shipped on in 1.31.0, where one branch inside `apiFetch` carried fifteen screens.
 */

export interface BrandProfileState {
  profile: BrandProfile | undefined;
  /** The brand id the profile stands for — the route's, or the shell's active brand. */
  brandId: string | undefined;
  /**
   * The stored brand, guideline bodies and all.
   *
   * The editor works on **this** and never on `profile.sections`: a `ProfileBlock[]` is a
   * flattened rendering with no marks, no links and no headings, and saving one back would
   * silently destroy formatting written in `packages/web`. The view model is the read side; this
   * is the write side, and they come from the same request.
   */
  source: BrandWithSections | undefined;
  isLoading: boolean;
  error: unknown;
}

/**
 * The profile for a brand id, or for the brand the shell is currently inside.
 *
 * **The route wins and the preference is the fallback**, which is the shape `active-brand.ts`
 * predicted for the first brand-scoped route and the shape `packages/web` already uses. `/brand`
 * has no id and reads the selection; `/brand/:id` names one, and an id the workspace does not
 * hold falls through to the active brand rather than to an error — a stale link should land
 * somewhere useful.
 *
 * **The id is resolved before anything is fetched**, and the wait is why. Firing at the route's
 * id immediately would be a request for a brand this workspace may not hold, so a stale link
 * would show the server's 404 for a moment and *then* correct itself to the right page. The list
 * is almost always already in the cache — the sidebar's switcher reads the same key — so the
 * common case waits for nothing.
 */
export function useBrandProfile(brandId?: string): BrandProfileState {
  const { brand, brands, isLoading: brandsLoading, error: brandsError } = useActiveBrand();

  const resolved = (brandId ? brands.find((b) => b.id === brandId) : undefined) ?? brand;
  const id = brandsLoading ? undefined : (resolved?.id ?? brandId);

  // `null` means "do not fetch". An array key is truthy however empty its contents, so a key
  // holding an empty id would fire a request for `/brands/` on every render.
  const {
    data: source,
    error,
    isLoading,
  } = useSWR<BrandWithSections>(id ? [SCOPES.bfBrand, id] : null, () =>
    brandProfileService.get(id!),
  );

  /**
   * The research state, read separately and **allowed to be late**.
   *
   * Its error is deliberately dropped rather than returned: a deployment with no research
   * provider is a normal deployment, the footer's one line about a past run is not worth an error
   * page, and `enabled: false` is the answer that arrives in the ordinary case. The brand is what
   * this page is; research is a footnote on it.
   */
  const { data: research } = useSWR(id ? [SCOPES.bfResearch, id] : null, () =>
    brandProfileService.research(id!),
  );

  return {
    profile: source ? toBrandProfile(source, research?.job ?? null) : undefined,
    brandId: id,
    source,
    // The brand list has to land before the brand can even be asked for, so a page that reported
    // "no brand selected" during that first leg would state something it has not checked.
    isLoading: brandsLoading || isLoading,
    error: brandsError ?? error,
  };
}

/**
 * The profile's writes — plain async functions that call the service and then invalidate.
 *
 * **Nothing is optimistic**, the rule this app applies everywhere: the API enforces domain rules
 * the client does not know, so the server's answer is the only one worth rendering.
 *
 * Both writes invalidate `bfBrands` as well as `bfBrand`, and that is not belt and braces. The
 * workspace list carries `sectionCount` and the flattened `tldr`, so writing a section changes a
 * row in the switcher; renaming the brand changes the name in the header. Leaving the list stale
 * is how a page and the chrome above it come to disagree.
 */
export function useBrandProfileMutations(brandId: string | undefined) {
  const invalidate = useInvalidate();

  /**
   * Save the brand's complete guideline list.
   *
   * ⚠️ **The list is built from a fresh read, not from the SWR cache.** `PATCH
   * /brands/:id/guidelines` takes the brand's *whole* section list and deletes anything omitted,
   * so sending a cached copy would delete a section added since it was fetched — in another tab,
   * by a research run finishing, or by the agent. The caller hands in a function that receives
   * the sections **as the server holds them right now** and returns the list to write.
   *
   * This narrows the window; it does not close it. A real close needs an `expected_version` on
   * the route, the way the scheme editor's 409 works, and that does not exist here. Recorded as a
   * limit rather than papered over.
   */
  const saveGuidelines = React.useCallback(
    async (build: (current: BrandWithSections) => GuidelineWrite[]) => {
      if (!brandId) throw new Error("No brand selected");
      const current = await brandProfileService.get(brandId);
      const sections = await brandProfileService.updateGuidelines(brandId, build(current));
      await invalidate(SCOPES.bfBrand, SCOPES.bfBrands);
      return sections;
    },
    [brandId, invalidate],
  );

  const updateBrand = React.useCallback(
    async (input: Parameters<typeof brandProfileService.update>[1]) => {
      if (!brandId) throw new Error("No brand selected");
      const row = await brandProfileService.update(brandId, input);
      await invalidate(SCOPES.bfBrand, SCOPES.bfBrands);
      return row;
    },
    [brandId, invalidate],
  );

  return { saveGuidelines, updateBrand };
}
