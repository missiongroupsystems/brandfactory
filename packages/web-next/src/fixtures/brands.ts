import type { Brand } from "@/lib/api/types";

import { BRAND_IDS, entities, outlets } from "./registry";

/**
 * Brand fixtures — the dimension `/contracts` now groups by, and the one every other row in
 * this fixture set was already implicitly filed under.
 *
 * **`/brands` was deliberately unregistered in `mock.ts` and is registered again here**, so
 * the reversal is worth stating. That decision was right for as long as the Ops brand was a
 * *vestigial* dimension: 1.33.0 moved the product's real brands onto the Hono server through
 * `features/brands/`, the nav item went, and what remained was a `brand_id` on outlets and
 * companies that nothing had a reason to resolve. An empty list was the honest answer.
 *
 * Brand is not vestigial on this screen any more. It is the contracts table's grouping, its
 * primary filter and the field the create form asks for first, so an empty index would mean
 * one bucket called `…`, a filter with no options, and a screen that looks broken rather
 * than empty. That is the same argument 1.36.1 made for the contracts themselves, one
 * dimension up: rule 2's `EMPTY` is the right default and the wrong answer for a screen this
 * size.
 *
 * **These are not the brands the sidebar switcher shows**, and conflating the two would be
 * the worse mistake. Those live on the Hono server, are workspace-scoped, and in the dev
 * seed are `Acme Coffee` and `Northwind`. A static fixture cannot know their ids, and a
 * contracts table wired to them would render `Group level` on all fourteen rows in every
 * workspace that had not happened to name a brand `Harbour Table`. The Ops fixtures —
 * outlets, companies, vendors, influencers and now contracts — are one coherent invented F&B
 * group, and the brand is the piece of it that was missing. `AGENTS.md` keeps the split:
 * `features/brands/` is BrandFactory's Brand, `features/registry-brands/` is this one.
 *
 * The four fall out of `registry.ts` without being invented: its six outlets trade under
 * three names and its three companies hold them, and the fourth is the group itself, which
 * is what a contract signed for everybody belongs to. Ids are fixed strings, so a link keeps
 * working across reloads — the rule `registry.ts` sets.
 */

const now = "2026-08-17T09:00:00Z";

/**
 * {@link BRAND_IDS} is declared in `registry.ts` rather than here, and the direction is
 * forced: this file derives its two counts *from* the outlets and companies, so `registry.ts`
 * cannot import back without a cycle. The ids belong there anyway — a brand is the third
 * registry dimension, and the rows that carry `brand_id` are the ones that name it.
 *
 * The alternative — the same four literals written out in both files — is exactly the class
 * 1.36.2's third finding closed: two copies of an id that nothing checks against each other.
 */

/**
 * The counts are **derived, never typed** — `contracts.ts`'s rule for the vendor aggregates,
 * applied to the two numbers `BrandRead` carries. A hand-written `outlet_count: 2` is one
 * edit to `registry.ts` away from contradicting the outlets that actually name the brand,
 * and the contradiction would be invisible: both numbers look equally plausible on screen.
 */
const BRANDS: Omit<Brand, "outlet_count" | "entity_count">[] = [
  {
    id: BRAND_IDS.harbourTable,
    name: "Harbour Table",
    status: "active",
    notes: "The flagship dining brand. Two sites open, a third in fit-out at Orchard.",
    created_at: now,
    updated_at: now,
  },
  {
    id: BRAND_IDS.kopiCo,
    name: "Kopi & Co",
    status: "active",
    notes: "Neighbourhood coffee. The volume brand, and the one the creator programme runs on.",
    created_at: now,
    updated_at: now,
  },
  {
    id: BRAND_IDS.quayBar,
    name: "The Quay Bar",
    status: "active",
    notes: "Single site, opening 2027. Everything held against it is pre-launch.",
    created_at: now,
    updated_at: now,
  },
  {
    // Retired, and it still holds a contract — which is the case the contracts table's brand
    // filter is written not to hide. Retiring a brand does not un-sign the agreements made
    // for it, and a filter that dropped them would answer "no contracts" about a brand that
    // has one.
    id: BRAND_IDS.eastside,
    name: "Eastside Kitchens",
    status: "retired",
    notes:
      "Retired as a consumer brand in 2025. The central kitchen still trades under the name on packaging.",
    created_at: now,
    updated_at: now,
  },
];

export const brands: Brand[] = BRANDS.map((brand) => ({
  ...brand,
  outlet_count: outlets.filter((outlet) => outlet.brand_id === brand.id).length,
  entity_count: entities.filter((entity) => entity.brand_id === brand.id).length,
}));
