import type { Brand } from "@/lib/api/types";

/**
 * Brand fixtures — what the sidebar's brand toggle switches between.
 *
 * The fourth fixture set, and the first added for a BrandFactory reason rather than an
 * Operations Hub one. `features/brands` arrived with the shell and was already complete
 * (service, hooks, an index that walks the cursor to exhaustion); it answered `EMPTY` only
 * because nothing had registered `/brands` in the mock. This file is that registration's
 * data, so `useBrandIndex` starts returning rows and the toggle has a list.
 *
 * Ids are fixed strings, not generated, for the reason `registry.ts` gives: a stored
 * selection has to survive a reload, and the active brand is persisted by id.
 *
 * Statuses are mixed on purpose. A workspace of sibling brands accumulates ones nobody is
 * working on any more, and a switcher that shows six equal-looking names when two of them are
 * retired is the failure the status badge in `brand-switcher.tsx` exists to prevent.
 *
 * The names match the entity fixtures they read as the brand of — but `entities.brand_id` is
 * still `null` on every row, deliberately. Linking them is a change to the Entities screen,
 * which has no door in the nav, and this release is the toggle.
 */

const now = "2026-08-17T09:00:00Z";

export const brands: Brand[] = [
  {
    id: "b1000000-0000-4000-8000-000000000001",
    name: "Harbour Table",
    status: "active",
    notes: "Waterfront dining. The flagship, and the voice the others are measured against.",
    outlet_count: 4,
    entity_count: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: "b1000000-0000-4000-8000-000000000002",
    name: "Kopi & Co",
    status: "active",
    notes: "Neighbourhood coffee. Warm, plain-spoken, never premium.",
    outlet_count: 11,
    entity_count: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: "b1000000-0000-4000-8000-000000000003",
    name: "Eastside Kitchens",
    status: "active",
    notes: "Delivery-only kitchens. No storefront, so the brand lives entirely in the app.",
    outlet_count: 6,
    entity_count: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: "b1000000-0000-4000-8000-000000000004",
    name: "Marina Green",
    status: "active",
    notes: "Plant-forward counter service. Newest of the four, still finding its register.",
    outlet_count: 2,
    entity_count: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: "b1000000-0000-4000-8000-000000000005",
    name: "Little Sprout",
    status: "dormant",
    notes: "Children's menu spin-off. Paused after the 2025 pilot; guidelines kept intact.",
    outlet_count: 0,
    entity_count: 0,
    created_at: now,
    updated_at: now,
  },
  {
    id: "b1000000-0000-4000-8000-000000000006",
    name: "Tiffin Room",
    status: "retired",
    notes: "Closed 2024. Kept for the archive — the guidelines still get cited.",
    outlet_count: 0,
    entity_count: 0,
    created_at: now,
    updated_at: now,
  },
];
