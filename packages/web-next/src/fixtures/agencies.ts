import type { ServiceCategory, VendorListItem } from "@/lib/api/types";

/**
 * The talent agencies, as vendors.
 *
 * **This file exists because the Influencers screen stopped needing it.** These six rows lived
 * in `influencers.ts` and were justified there by the screen: it grouped creators by
 * `contact.vendor_id` and resolved each id through `useVendorIndex`, so without the agencies in
 * the same fixture every group header would have rendered `…` and the page would have been
 * twenty rows under a column of ellipses. That coupling is gone — an influencer is engaged for
 * a **brand**, and the row carries no agency at all.
 *
 * They are not deleted with it, and the reason is `fixtures/contracts.ts`: **six of the sixteen
 * agreements are held with these companies.** A talent retainer is a real marketing agreement
 * and an agency is a real counterparty, so `/vendors` is exactly where they belong. Deleting
 * them to make the influencer change tidy would have deleted six contracts' vendors with them.
 *
 * So the split is now the honest one. An agency is a **company you have an agreement with**,
 * and lives here. An influencer is a **person you engage for a brand**, and lives in
 * `influencers.ts`. Nothing joins the two files, which is the change.
 *
 * `contacts` is `[]` on every row, and that is a fact rather than a gap: nobody has recorded a
 * person to call at these companies. It used to be derived from the influencer roster — the
 * creators appeared as the agency's contacts on `/vendors` — which was the same wrong model
 * read from the company side. The three service providers in `contracts.ts` already ship `[]`
 * for the same reason and render the vendor page's real empty state.
 *
 * The four aggregates are placeholders. {@link import("./contracts").vendors} derives every one
 * of them from the contracts, and `mock.ts` serves *that* on `/vendors` — so nothing should read
 * this list for a count. See that file's docstring for why the zeroes are safe here and would
 * not be safe on the wire.
 *
 * Ids are fixed strings rather than generated, so a link into a vendor page keeps working
 * across reloads. The names, the sites and the notes are invented; none of them is a real
 * company.
 */

const now = "2026-08-17T09:00:00Z";

type Agency = {
  id: string;
  name: string;
  /**
   * The Operations Hub's trade, and `other` on four of six is **the complaint this file no
   * longer answers for.**
   *
   * `ServiceCategory` is a vocabulary of trades — aircon, pest control, grease trap — and none
   * of its thirteen values names a talent agency, so `other` is the only true one and two
   * independents carry `null` because a two-person management shop has no trade at all. That
   * used to matter, because the Influencers screen offered a category filter built from these
   * values and it narrowed to one useless bucket. **That filter is gone**; Influencers reads
   * `InfluencerVertical` now. What is left is a nearly-monotone column on `/vendors`, which is
   * a real cost and a separate decision about a screen nobody has asked to change.
   */
  category: ServiceCategory | null;
  website: string | null;
  notes: string | null;
};

const AGENCIES: Agency[] = [
  {
    id: "v2000000-0000-4000-8000-000000000001",
    name: "Northlight Talent Pte Ltd",
    category: "other",
    website: "https://northlighttalent.example.sg",
    notes: "Handles the beauty and lifestyle roster. Rate card reviewed each quarter.",
  },
  {
    id: "v2000000-0000-4000-8000-000000000002",
    name: "Kite & Co Creator Management",
    category: "other",
    website: "https://kiteandco.example.sg",
    notes: null,
  },
  {
    id: "v2000000-0000-4000-8000-000000000003",
    name: "Sunbeam Social",
    // No trade in the Ops vocabulary fits a two-person management shop — see the note above.
    category: null,
    website: null,
    notes: "Two managers, no office. Reach them on WhatsApp.",
  },
  {
    id: "v2000000-0000-4000-8000-000000000004",
    name: "Halcyon Media Group",
    category: "other",
    website: "https://halcyonmedia.example.sg",
    notes: "Full-service. Also books the out-of-home placements.",
  },
  {
    id: "v2000000-0000-4000-8000-000000000005",
    name: "Redpin Creators",
    category: "other",
    website: "https://redpin.example.sg",
    notes: null,
  },
  {
    id: "v2000000-0000-4000-8000-000000000006",
    name: "Tidewater Talent LLP",
    category: null,
    website: null,
    notes: "One manager. Slow to answer email; call instead.",
  },
];

export const agencies: VendorListItem[] = AGENCIES.map((agency) => ({
  id: agency.id,
  name: agency.name,
  kind: "service_provider",
  status: "active",
  category: agency.category,
  uen: null,
  website: agency.website,
  notes: agency.notes,
  // See the docstring: the roster is no longer this company's contact list.
  contacts: [],
  contracts_active: 0,
  contracts_total: 0,
  brand_ids_covered: [],
  next_contract_end: null,
  created_at: now,
  updated_at: now,
}));
