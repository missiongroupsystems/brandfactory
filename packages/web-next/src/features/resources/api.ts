import type {
  BrandResource,
  CreateBrandResourceInput,
  UpdateBrandResourceInput,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Brand resources — a named external link a team member has to find fast: a font shop, a stock
 * library, an icon set.
 *
 * The paths below are checked against the server's own route tree at compile time — `bf` is
 * `hc<AppType>`, and `AppType` is inferred from the chained `.route()` calls in
 * `packages/server/src/app.ts`. A renamed segment is a type error here, not a 404 in a browser.
 */
export const resourceService = {
  /**
   * Every resource for a brand, in the order `listResourcesByBrand` returns them. Ungrouped — the
   * caller groups by `type`, in the enum's declared order, which is a presentation choice and not
   * this file's to make.
   */
  list: async (brandId: string): Promise<BrandResource[]> =>
    callJson<BrandResource[]>(await bf.brands[":id"].resources.$get({ param: { id: brandId } })),

  /** Answers `201` with the row. */
  create: async (brandId: string, input: CreateBrandResourceInput): Promise<BrandResource> =>
    callJson<BrandResource>(
      await bf.brands[":id"].resources.$post({ param: { id: brandId }, json: input }),
    ),

  /** A real partial patch: an omitted key is left alone. */
  update: async (
    brandId: string,
    resourceId: string,
    input: UpdateBrandResourceInput,
  ): Promise<BrandResource> =>
    callJson<BrandResource>(
      await bf.brands[":id"].resources[":resourceId"].$patch({
        param: { id: brandId, resourceId },
        json: input,
      }),
    ),

  /** Hard delete — `routes/resources.ts` has no `deleted_at` to set. Answers with the row that went. */
  remove: async (brandId: string, resourceId: string): Promise<BrandResource> =>
    callJson<BrandResource>(
      await bf.brands[":id"].resources[":resourceId"].$delete({
        param: { id: brandId, resourceId },
      }),
    ),
};
