import { apiFetch, query } from "@/lib/api/client";
import type { Brand, BrandCreate, BrandStatus, BrandUpdate, Page } from "@/lib/api/types";

/**
 * Registry brands — the third registry dimension, alongside entities and outlets (spec §4.1).
 * A brand an *outlet* belongs to.
 *
 * **This is not BrandFactory's Brand, and the folder is named for the difference.** Two things
 * in this app are called "brand": the product's central noun — the source of truth a workspace
 * holds, served by the Hono API through `features/brands/` — and this one, which arrived with
 * the Operations Hub and shares nothing with it but the word. They have different shapes
 * (`status` and `outlet_count` here; `workspaceId`, `tldr` and `sectionCount` there),
 * different backends and different lifetimes.
 *
 * It kept the name until the real one needed it. The rename cost eight import lines and gave
 * the product's most important noun its own folder, rather than parking that noun behind a
 * defensive prefix for however many releases the Ops screens survive.
 *
 * **Eight screens read `useBrandIndex` from here** — contracts, the review queue, both registry
 * browsers, both registry forms, the org chart and the outlet detail — and every one of them
 * resolves an outlet's or a company's `brand_id` to a name. Repointing this service at the
 * BrandFactory API would break all eight and fix none of them.
 *
 * Every route answers with the same shape, aggregates included, so there is no "list row" type
 * here to keep in step with a thinner detail one. See `lib/api/types.ts`.
 *
 * **Assignment does not live in this service.** An outlet's brand is set by
 * `PATCH /outlets/{id}` and a company's by `PATCH /entities/{id}` — there is no
 * `PUT /brands/{id}/outlets`, deliberately, because replacing a set means one careless save can
 * un-brand every outlet a brand holds and there is no coverage semantics here to justify the
 * risk. Stage 3's "Add outlets" picker therefore writes one `PATCH` per row through
 * `outletService`.
 */

export type BrandFilters = {
  status?: BrandStatus;
  q?: string;
  cursor?: string;
  limit?: number;
};

export const brandService = {
  list: (params: BrandFilters = {}) => apiFetch<Page<Brand>>(`/brands${query(params)}`),

  get: (id: string) => apiFetch<Brand>(`/brands/${id}`),

  create: (data: BrandCreate) =>
    apiFetch<Brand>("/brands", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: BrandUpdate) =>
    apiFetch<Brand>(`/brands/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  remove: (id: string) => apiFetch<void>(`/brands/${id}`, { method: "DELETE" }),
};
