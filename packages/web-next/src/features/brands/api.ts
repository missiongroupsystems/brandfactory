import type { Brand, BrandSummary, CreateBrandInput } from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Brands — BrandFactory's central noun. A brand is the single source of truth that every
 * creative surface inherits its context from.
 *
 * **Not to be confused with `features/registry-brands/`**, which is the Operations Hub's third
 * registry dimension — a brand an outlet belongs to. The two share the word and nothing else.
 * That folder kept this name until this file needed it.
 *
 * **Workspace-scoped, because the API is.** `GET /workspaces/:workspaceId/brands` is the only
 * list route there is; there is no `GET /brands`. That is why the workspace row landed in the
 * sidebar header before this one could read anything.
 *
 * The paths below are checked against the server's own route tree at compile time — `bf` is
 * `hc<AppType>`, and `AppType` is inferred from the chained `.route()` calls in
 * `packages/server/src/app.ts`. A renamed segment is a type error here, not a 404 in a browser.
 */
export const brandService = {
  /**
   * The workspace's brands. `BrandSummary` — the row plus `sectionCount`, `projectCount` and
   * the flattened `tldr` — which is what the workspace grid in `packages/web` renders from.
   *
   * **A plain array, not a page.** The route returns one; there is no cursor and nothing to
   * exhaust. The Ops sibling of this function walks pages to the end through `listEvery`, and
   * copying that shape here would be a loop waiting for a `next_cursor` that never arrives.
   */
  list: async (workspaceId: string): Promise<BrandSummary[]> =>
    callJson<BrandSummary[]>(
      await bf.workspaces[":workspaceId"].brands.$get({ param: { workspaceId } }),
    ),

  /**
   * Create one. Answers `201` with the plain `Brand` row — no counts, because a brand a moment
   * old has none — so a caller that needs a `BrandSummary` revalidates rather than casts.
   */
  create: async (workspaceId: string, input: CreateBrandInput): Promise<Brand> =>
    callJson<Brand>(
      await bf.workspaces[":workspaceId"].brands.$post({
        param: { workspaceId },
        json: input,
      }),
    ),
};
