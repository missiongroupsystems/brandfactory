import type {
  Brand,
  BrandGuidelineSection,
  BrandWithSections,
  ResearchJobSummary,
  UpdateBrandGuidelinesSectionInput,
  UpdateBrandInput,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * The Brand Profile's transport — the only file in the feature that names a route.
 *
 * Every path below is checked against the server's own route tree at compile time: `bf` is
 * `hc<AppType>` and `AppType` is inferred from the chained `.route()` calls in
 * `packages/server/src/app.ts`. A renamed segment is a type error here, not a 404 in a browser.
 *
 * **Separate from `features/brands/api.ts`, which stays about the workspace's list.** That file
 * answers *which brands are there* for the switcher; this one answers *what is in this one*. They
 * are different aggregates on the server (`/workspaces/:id/brands` and `/brands/:id`) and
 * different cache scopes here.
 */

/** The research envelope. Three facts read together — see the route's own note. */
interface ResearchState {
  enabled: boolean;
  maxMinutes: number;
  job: ResearchJobSummary | null;
}

export const brandProfileService = {
  /** The brand row plus every guideline section, in `priority` order. */
  get: async (brandId: string): Promise<BrandWithSections> =>
    callJson<BrandWithSections>(await bf.brands[":id"].$get({ param: { id: brandId } })),

  /**
   * The deployment's research state and this brand's latest run.
   *
   * Read separately from the brand and allowed to be late: the footer's one line about research
   * is not worth holding the page for, and a deployment with no provider answers `enabled: false`
   * rather than an error.
   */
  research: async (brandId: string): Promise<ResearchState> =>
    callJson<ResearchState>(await bf.brands[":id"].research.$get({ param: { id: brandId } })),

  /** The brand row itself — name, description, website. */
  update: async (brandId: string, input: UpdateBrandInput): Promise<Brand> =>
    callJson<Brand>(await bf.brands[":id"].$patch({ param: { id: brandId }, json: input })),

  /**
   * Write the brand's guidelines.
   *
   * ⚠️ **The payload is the brand's COMPLETE section list, not a patch.** Anything omitted is
   * deleted, in one transaction, server-side. Never call this with a subset; build the list with
   * `mergeSection` / `removeSection` in `guidelines.ts`, which exist so that rule is applied in
   * one place rather than at each call site.
   *
   * `createdBy` goes back on the wire for every row. It used to be synthesised server-side and —
   * because the payload is the complete list — that rewrote the author of every section on every
   * save. Sending each row's own value is what keeps *"these five came from research"* legible
   * after somebody has tidied their prose.
   */
  updateGuidelines: async (
    brandId: string,
    sections: readonly GuidelineWrite[],
  ): Promise<BrandGuidelineSection[]> =>
    callJson<BrandGuidelineSection[]>(
      await bf.brands[":id"].guidelines.$patch({
        param: { id: brandId },
        json: { sections: [...sections] },
      }),
    ),
};

/**
 * One row as the guidelines write takes it — `shared`'s own input type, not a copy.
 *
 * `id` is absent for a section that does not exist yet: the server inserts it and answers with
 * the stored row. The shape is deliberately not `BrandGuidelineSection`, which carries `brandId`
 * and two timestamps the route neither reads nor accepts.
 */
export type GuidelineWrite = UpdateBrandGuidelinesSectionInput;
