import { apiFetch, query } from "@/lib/api/client";
import type { Brand, BrandCreate, BrandStatus, BrandUpdate, Page } from "@/lib/api/types";

/**
 * Brands — the third registry dimension, alongside entities and outlets (spec §4.1).
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
