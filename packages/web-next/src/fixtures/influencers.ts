import type { Influencer } from "@/lib/api/types";

import { brands } from "./brands";

/**
 * Influencer fixtures — the rows the **Influencers** screen renders.
 *
 * Nothing here is stored. This is a mockup put up so the layout can be judged, the same
 * standing as `contracts.ts` and for the same reason: BrandFactory has no influencer table and
 * no influencer route, so there is no server to disagree with the shape. See
 * {@link import("@/lib/api/types").Influencer} for why that makes the record safe to declare.
 *
 * **This file used to be the Operations Hub's address book under a new label**, and the
 * rewrite is the point. The rows were `ContactRead` — name, role, email, phone, `vendor_id`,
 * `is_primary` — so the screen filed creators by *the company they sit with* and offered a
 * filter over thirteen building trades. The verticals were in the data all along and
 * unfilterable, written into the `role` free-text as prose: `"Creator — beauty and skincare"`,
 * `"Creator — motoring"`. Those are `vertical` now.
 *
 * Two things left with it, and both were load-bearing before they were not:
 *
 *   - **The agencies.** Six talent agencies lived in this file because the screen grouped by
 *     them and would otherwise have rendered a column of `…`. Nothing here points at a vendor,
 *     so they moved to `fixtures/agencies.ts` — where they still matter, because six contracts
 *     are held with them.
 *   - **Email and phone.** An influencer is reached at their handle. A creator's mobile number
 *     is their agent's business, and a fixture carrying nineteen invented phone numbers put a
 *     column on screen that the product has no reason to hold.
 *
 * Ids are fixed strings rather than generated, so a link into a detail page keeps working
 * across reloads and a screenshot taken today matches one taken next week — the rule
 * `registry.ts` sets.
 *
 * ## What the roster is built to exercise
 *
 * The table groups by **reach tier** (`features/influencers/tiers.ts`), which is derived from
 * `followers`, so the rows are chosen to put at least one in every band and to make each of the
 * band's conditional parts appear somewhere:
 *
 *   - **Mega holds exactly one row**, so the count badge and the collapse toggle correctly
 *     vanish there and render on the other four. That was a state the old fixture had to
 *     arrange deliberately; here it is one follower count.
 *   - **Every platform and every vertical appears**, so no filter option leads to an empty
 *     table, and **two creators carry no vertical at all** — a photographer who shoots
 *     everything and a B2B voice on LinkedIn — so the em dash is on screen rather than only in
 *     `Value`'s tests.
 *   - **Three rows have no engagement rate.** They are prospects nobody has run a campaign
 *     with, which is the state that field is nullable for.
 *   - **Five rows hold no brand.** Those are the prospects, and an empty array reads as
 *     "Not engaged yet" rather than as the em dash — the same call `/contracts` makes for an
 *     agreement held at group level.
 *   - **Three rows name two brands**, and **three name the retired one.** Eastside Kitchens is
 *     retired and still has creators against it: retiring a brand does not un-run the campaigns
 *     made for it, which is the reading the brand filter is written not to hide.
 *
 * **Engagement falls as reach rises, on purpose.** A nano creator at 14% and a mega at 1.1% is
 * how the two columns actually relate, and a roster where the rate wandered at random would
 * make the one number on the screen that argues *against* the top band look like noise.
 *
 * The names are invented. None of them is a real person, and none of the handles resolves to a
 * real account — a fixture that borrowed a real creator's name and handle would be a fabricated
 * record about someone who never agreed to it.
 */

/** Looked up rather than positioned, so an insertion in `brands.ts` is harmless and a rename is
 *  loud — the throw fires at import. The same guard `contracts.ts` uses, and for the reason it
 *  was added there: a destructured array is one reorder away from attaching every row to the
 *  wrong brand, silently. */
function brandId(name: string): string {
  const row = brands.find((brand) => brand.name === name);
  if (!row) throw new Error(`No brand fixture named "${name}" — see fixtures/brands.ts`);
  return row.id;
}

const harbourTable = brandId("Harbour Table");
const kopiCo = brandId("Kopi & Co");
const quayBar = brandId("The Quay Bar");
const eastside = brandId("Eastside Kitchens");

const now = "2026-08-17T09:00:00Z";

export const influencers: Influencer[] = [
  // ── Mega, 1M+ — one row, so the band shows neither a count nor a toggle ────────────────
  {
    id: "i1000000-0000-4000-8000-000000000001",
    name: "Priya Raman",
    handle: "priyaskin",
    platform: "instagram",
    followers: 1_240_000,
    engagement_rate: 1.1,
    vertical: "beauty",
    brand_ids: [harbourTable],
    status: "active",
    created_at: now,
    updated_at: now,
  },

  // ── Macro, 500k – 1M ──────────────────────────────────────────────────────────────────
  {
    id: "i1000000-0000-4000-8000-000000000002",
    name: "Nikhil Menon",
    handle: "nikhilreviews",
    platform: "youtube",
    followers: 980_000,
    engagement_rate: 0.9,
    vertical: "tech",
    brand_ids: [kopiCo],
    status: "past",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000003",
    name: "Devon Ang",
    handle: "devonang",
    platform: "tiktok",
    followers: 842_000,
    engagement_rate: 2.4,
    vertical: "fashion",
    brand_ids: [kopiCo],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000004",
    name: "Amelia Fong",
    handle: "ameliaeats",
    platform: "instagram",
    followers: 613_000,
    engagement_rate: 1.8,
    vertical: "food",
    brand_ids: [harbourTable, quayBar],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000005",
    name: "Josephine Tan",
    handle: "jotanfamily",
    platform: "facebook",
    followers: 517_000,
    // A prospect nobody has run a campaign with — no measured rate.
    engagement_rate: null,
    vertical: "parenting",
    brand_ids: [],
    status: "prospect",
    created_at: now,
    updated_at: now,
  },

  // ── Mid-tier, 100k – 500k ─────────────────────────────────────────────────────────────
  {
    id: "i1000000-0000-4000-8000-000000000006",
    name: "Hana Sulaiman",
    handle: "hanaathome",
    platform: "xiaohongshu",
    followers: 318_000,
    engagement_rate: 3.1,
    vertical: "home",
    brand_ids: [eastside],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000007",
    name: "Rashid Karim",
    handle: "rashidmoves",
    platform: "tiktok",
    followers: 264_000,
    engagement_rate: 4.2,
    vertical: "fitness",
    brand_ids: [quayBar],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000008",
    name: "Wei Sheng Ho",
    handle: "weishengdrives",
    platform: "youtube",
    followers: 187_000,
    engagement_rate: 2.0,
    vertical: "motoring",
    brand_ids: [eastside],
    status: "past",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000009",
    name: "Farah Idris",
    handle: "farahidris",
    platform: "instagram",
    followers: 142_000,
    engagement_rate: 2.9,
    vertical: "beauty",
    brand_ids: [harbourTable, kopiCo],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000010",
    name: "Marcus Teo",
    handle: "marcusteotravels",
    platform: "instagram",
    followers: 118_000,
    // Measured from public posts before any booking — which is why the rate is nullable and
    // not simply absent on every prospect.
    engagement_rate: 2.2,
    vertical: "travel",
    brand_ids: [],
    status: "prospect",
    created_at: now,
    updated_at: now,
  },

  // ── Micro, 10k – 100k ─────────────────────────────────────────────────────────────────
  {
    id: "i1000000-0000-4000-8000-000000000011",
    name: "Clara Boon",
    handle: "claraboon",
    platform: "xiaohongshu",
    followers: 74_300,
    engagement_rate: 5.4,
    vertical: "food",
    brand_ids: [harbourTable],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000012",
    name: "Liling Chua",
    handle: "lilingshoots",
    platform: "instagram",
    followers: 52_800,
    engagement_rate: 4.8,
    // A photographer who shoots whatever the brief is. Genuinely no vertical — see the
    // docstring on why that is `null` and not an `other` bucket.
    vertical: null,
    brand_ids: [quayBar],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000013",
    name: "Oscar Villanueva",
    handle: "oscarruns",
    platform: "tiktok",
    followers: 38_100,
    engagement_rate: null,
    vertical: "fitness",
    brand_ids: [],
    status: "prospect",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000014",
    name: "Tobias Lim",
    handle: "tobiaslim",
    platform: "linkedin",
    followers: 24_600,
    engagement_rate: 3.4,
    // A B2B voice on hospitality operations. None of the ten consumer verticals is true of him.
    vertical: null,
    brand_ids: [kopiCo],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000015",
    name: "Serena Koh",
    handle: "serenakoh",
    platform: "instagram",
    followers: 16_900,
    engagement_rate: 5.9,
    vertical: "fashion",
    brand_ids: [harbourTable],
    status: "past",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000016",
    name: "Adrian Pang",
    handle: "adrianeats",
    platform: "xiaohongshu",
    followers: 11_200,
    engagement_rate: 7.2,
    vertical: "food",
    brand_ids: [eastside, quayBar],
    status: "active",
    created_at: now,
    updated_at: now,
  },

  // ── Nano, under 10k ───────────────────────────────────────────────────────────────────
  {
    id: "i1000000-0000-4000-8000-000000000017",
    name: "Mei Ling Foo",
    handle: "meilingfoo",
    platform: "instagram",
    followers: 8_400,
    engagement_rate: 8.6,
    vertical: "family",
    brand_ids: [harbourTable],
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "i1000000-0000-4000-8000-000000000018",
    name: "Jonas Widjaja",
    handle: "jonaswidjaja",
    platform: "tiktok",
    followers: 3_150,
    engagement_rate: null,
    vertical: "motoring",
    brand_ids: [],
    status: "prospect",
    created_at: now,
    updated_at: now,
  },
  {
    // Under 1k, which the trade's ladder has no word for. `nano` holds it because a tier list
    // with a gap at the bottom would drop the row out of the grouping — see `tiers.ts`.
    id: "i1000000-0000-4000-8000-000000000019",
    name: "Bianca Reyes",
    handle: "biancareyes",
    platform: "instagram",
    followers: 940,
    engagement_rate: 14.2,
    vertical: "beauty",
    brand_ids: [],
    status: "prospect",
    created_at: now,
    updated_at: now,
  },
];
