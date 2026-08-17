import type {
  BillingFrequency,
  ContractCategory,
  ContractSensitive,
  ContractStatus,
  RenewalType,
  VendorListItem,
} from "@/lib/api/types";

import { agencies } from "./agencies";
import { brands } from "./brands";

/**
 * Contract fixtures — the rows `/contracts` renders, and the vendors they are held with.
 *
 * `/contracts` had no fixture at all until now, so the table fell through to `mock.ts`'s rule 2
 * and rendered "No contracts yet" against a screen with eleven columns, six filters and a
 * grouping control. Nothing here is stored: these are marketing agreements written so the
 * layout can be judged, the same standing as `influencers.ts`.
 *
 * Ids are fixed strings rather than generated, so a link into a detail page keeps working across
 * reloads and a screenshot taken today matches one taken next week — the rule `registry.ts` sets.
 *
 * **The three providers are here and not in `agencies.ts`** although both files end up on
 * `/vendors`. That file owns the *talent agencies*; a scheduling tool and a photo studio belong
 * to no roster and are here because the only thing that makes them exist in this product is the
 * contract. {@link vendors} is the union, and `mock.ts` serves that — one list on the wire,
 * whichever fixture declared the row.
 *
 * The cost this docstring used to record is **paid off**. It read: *"the Influencers filter
 * offers agencies from `useVendorIndex`, so it now lists three vendors that manage nobody"*.
 * That filter is gone. Influencers no longer resolves a vendor id, no longer groups by one and
 * no longer offers one — an influencer is engaged for a brand, and the agencies moved out of
 * `influencers.ts` into `agencies.ts` when the last thing joining the two files went.
 *
 * **`category` is a marketing vocabulary now, and this docstring used to argue it could not be.**
 * The argument was: `ServiceCategory` is the Operations Hub's list of *trades*, frozen in a
 * generated file this app may not edit, and of its thirteen values exactly two are true of a
 * marketing agreement — so the glyph in front of each title is nearly monotone and its filter
 * narrows to two buckets. All of that was true. The conclusion — *"inventing one here would put a
 * slug on screen that no server would accept"* — was the half that did not survive contact with
 * the reason there is a fixture at all: **there is no server.** The Hono API holds no contracts
 * routes and the FastAPI service is not in this repository, so nothing can refuse a slug, and
 * `ContractCategory` in `lib/api/types.ts` is the app's own union with the docstring to say so.
 *
 * **`brand_ids` replaces `outlet_ids`, and that is the change these rows exist to show.** A
 * marketing agreement is held for a brand. Brand used to be two hops off the row — `contract →
 * outlet → brand` — which made it derived, multi-valued and permanently pending; it is the row's
 * own field now, which is what lets the table group by it. Coverage of *premises* left the
 * contracts domain with it, and the service workflow that hung off `(contract, outlet)` pairs
 * went too.
 *
 * The vendor names, the figures and the scopes are invented. None of them is a real company or
 * a real agreement.
 */

/**
 * The ids this file borrows from the two fixtures beside it, **looked up rather than
 * positioned.**
 *
 * These were `const [northlight, kite, …] = agencies.map((a) => a.id)`, which is one reordered
 * array away from attaching every agreement below to the wrong agency — and silently, because
 * the tests assert that each reference *resolves*, not that it resolves to the row it was
 * written for. A lookup makes an insertion harmless and a rename loud: the throw fires at import,
 * so `contracts.test.ts` fails to collect rather than passing over re-pointed data.
 *
 * Both are keyed by name, which is the field either fixture keeps stable and reads back as the
 * thing a person would have written.
 */
function agencyId(name: string): string {
  const row = agencies.find((agency) => agency.name === name);
  if (!row) throw new Error(`No agency fixture named "${name}" — see fixtures/agencies.ts`);
  return row.id;
}

function brandId(name: string): string {
  const row = brands.find((brand) => brand.name === name);
  if (!row) throw new Error(`No brand fixture named "${name}" — see fixtures/brands.ts`);
  return row.id;
}

const northlight = agencyId("Northlight Talent Pte Ltd");
const kite = agencyId("Kite & Co Creator Management");
const sunbeam = agencyId("Sunbeam Social");
const halcyon = agencyId("Halcyon Media Group");
const redpin = agencyId("Redpin Creators");
const tidewater = agencyId("Tidewater Talent LLP");

const harbourTable = brandId("Harbour Table");
const kopiCo = brandId("Kopi & Co");
const quayBar = brandId("The Quay Bar");
const eastside = brandId("Eastside Kitchens");

const now = "2026-08-17T09:00:00Z";

// The three this file declares itself, named before the rows rather than
// destructured off them afterwards — so an agreement below names a provider
// instead of an index, the same rule the borrowed ids above follow.
const loopline = "v3000000-0000-4000-8000-000000000001";
const fieldnote = "v3000000-0000-4000-8000-000000000002";
const bellweather = "v3000000-0000-4000-8000-000000000003";

/**
 * The vendors that are not talent agencies — a tool, a studio and a press office.
 *
 * `contacts` is empty on all three, which is a fact and not a gap: nobody has recorded a person
 * to call. It is empty on the six agencies too, now that the influencer roster has stopped being
 * read as their contact list — so this is no longer the one thing that distinguishes the two
 * sets. The four aggregates are placeholders — {@link vendors} derives every one of them from
 * {@link contracts} below.
 */
const PROVIDERS: VendorListItem[] = [
  {
    id: loopline,
    name: "Loopline Software Pte Ltd",
    kind: "service_provider",
    status: "active",
    category: "software",
    uen: "202144552M",
    website: "https://loopline.example.sg",
    notes: "Scheduling and creator analytics. Seats are billed annually in advance.",
    contacts: [],
    contracts_active: 0,
    contracts_total: 0,
    brand_ids_covered: [],
    next_contract_end: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: fieldnote,
    name: "Fieldnote Studio",
    kind: "service_provider",
    status: "active",
    category: "other",
    uen: null,
    website: "https://fieldnotestudio.example.sg",
    notes: "Food photography and short-form video. Books six weeks out.",
    contacts: [],
    contracts_active: 0,
    contracts_total: 0,
    brand_ids_covered: [],
    next_contract_end: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: bellweather,
    name: "Bellweather PR Pte Ltd",
    kind: "service_provider",
    status: "active",
    category: "other",
    uen: "201933718E",
    website: null,
    notes: null,
    contacts: [],
    contracts_active: 0,
    contracts_total: 0,
    brand_ids_covered: [],
    next_contract_end: null,
    created_at: now,
    updated_at: now,
  },
];

/**
 * One agreement, before the fields the server derives are put on it.
 *
 * Written as a narrower type than `ContractSensitive` so the fixture states only what a person
 * would state — `notice_due_date`, `has_value` and `created_at` are all computed below, and a
 * hand-written `notice_due_date` is a deadline that can silently disagree with the period it is
 * supposed to be counted from.
 */
type Agreement = {
  id: string;
  title: string;
  vendor_id: string;
  category: ContractCategory;
  status: ContractStatus;
  renewal_type: RenewalType;
  brand_ids: string[];
  start_date: string | null;
  end_date: string | null;
  notice_period_days: number | null;
  value: string | null;
  billing_frequency: BillingFrequency | null;
  scope_description: string | null;
  notes?: string | null;
  updated_at: string;
  closed_at?: string | null;
  closed_reason?: string | null;
  renewed_by_id?: string | null;
  renewed_from_id?: string | null;
};

const RENEWED_ANALYTICS = "c3000000-0000-4000-8000-000000000013";

/**
 * The book of agreements.
 *
 * The spread is deliberate rather than decorative — every branch the table carries has at least
 * one row that exercises it:
 *
 *   - **Brands in all three shapes.** Six agreements name no brand at all, which is the worded
 *     "Group level" rather than the em dash — a press office retainer and a seat licence are
 *     genuinely held for the whole group, and that is a fact rather than a gap. Six name exactly
 *     one, so the cell reads as a value. Four name several and collapse to a glyph and a count
 *     with the names in the tooltip, one of them reaching all four.
 *   - **A retired brand that still holds agreements.** Eastside Kitchens is `retired` and is on
 *     three contracts. Retiring a brand does not un-sign what was signed for it, which is why
 *     the brand filter offers retired brands and the grouping never hides them.
 *   - **Ten of the eleven categories.** Only `other` has no row, and deliberately: it is the
 *     escape hatch somebody reaches for when nothing fitted, so a fixture that pre-filled it
 *     would be modelling the data-entry problem the vocabulary exists to prevent.
 *   - **Both notice states that matter.** Five auto-renewing rows carry a period and so print a
 *     date with its arithmetic beneath; **two carry none**, which is the ochre "No notice period"
 *     badge and the only rows the `notice_gap` filter returns.
 *   - **All three renewal types**, so the ochre pill is the minority it is meant to be.
 *   - **Every status, including the one that is not a status.** One expired row has neither a
 *     successor nor a close-off, so its Status cell renders the Renew / Close off buttons rather
 *     than a badge. One expired row *was* renewed and one is terminated — both are history, so
 *     the table hides them until "All".
 *   - **A renewal pair.** #12 expired and points at #13, which is the draft it produced. That is
 *     the only place `renewed_by_id` / `renewed_from_id` are non-null.
 *   - **A contract with no figure agreed yet** (#10), so the Value column shows the em dash
 *     beside fifteen rows that have one, and the billing-frequency subtext is absent on it.
 *   - **Updated dates across ten months**, so the relative column is not sixteen copies of
 *     "today".
 */
const AGREEMENTS: Agreement[] = [
  {
    id: "c3000000-0000-4000-8000-000000000001",
    title: "Q4 beauty and lifestyle roster retainer",
    vendor_id: northlight,
    category: "talent",
    status: "active",
    renewal_type: "auto",
    brand_ids: [],
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    notice_period_days: 60,
    value: "48000.00",
    billing_frequency: "annual",
    scope_description:
      "Three creators, two in-feed posts each per month, plus six months of paid usage rights.",
    notes: "Rate card is reviewed each quarter; the December uplift has not been agreed.",
    updated_at: "2026-08-11T16:20:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000002",
    title: "Always-on creator management",
    vendor_id: kite,
    category: "retainer",
    status: "active",
    renewal_type: "auto",
    brand_ids: [],
    start_date: "2025-07-01",
    end_date: "2026-09-30",
    // The gap. Auto-renewing with nothing to give notice against, which is the single row this
    // whole screen was described to warn about.
    notice_period_days: null,
    value: "3200.00",
    billing_frequency: "monthly",
    scope_description: "Roster management, brief writing and a monthly performance report.",
    notes: null,
    updated_at: "2026-02-19T11:05:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000003",
    title: "Paid social buying retainer",
    vendor_id: halcyon,
    category: "media_buy",
    status: "active",
    renewal_type: "manual",
    brand_ids: [harbourTable, kopiCo],
    start_date: "2026-04-01",
    end_date: "2027-03-31",
    notice_period_days: 30,
    value: "7500.00",
    billing_frequency: "monthly",
    scope_description:
      "Media planning and buying across Meta and TikTok. Spend is billed separately at cost.",
    notes: null,
    updated_at: "2026-07-28T09:41:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000004",
    title: "Social scheduling and analytics, 25 seats",
    vendor_id: loopline,
    category: "tooling",
    status: "active",
    renewal_type: "auto",
    brand_ids: [],
    start_date: "2026-02-01",
    end_date: "2027-01-31",
    notice_period_days: 30,
    value: "6120.00",
    billing_frequency: "annual",
    scope_description: "25 seats, unlimited connected accounts, one sandbox workspace.",
    notes: null,
    updated_at: "2026-02-03T08:15:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000005",
    title: "Quarterly menu and interiors shoot",
    vendor_id: fieldnote,
    category: "production",
    status: "active",
    renewal_type: "none",
    brand_ids: [harbourTable, kopiCo, eastside],
    start_date: "2026-03-01",
    end_date: "2026-12-31",
    notice_period_days: null,
    value: "18000.00",
    billing_frequency: "quarterly",
    scope_description:
      "Four shoot days a quarter, 40 retouched stills and 12 short-form cuts per round.",
    notes: "Central kitchen days double as prep-and-process footage for the brand film.",
    updated_at: "2026-06-02T14:32:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000006",
    title: "Kopi & Co creator programme",
    vendor_id: sunbeam,
    category: "talent",
    status: "active",
    renewal_type: "auto",
    brand_ids: [kopiCo],
    start_date: "2026-06-01",
    end_date: "2026-11-30",
    notice_period_days: 45,
    value: "2400.00",
    billing_frequency: "monthly",
    scope_description: "Six micro-creators a month, one visit each, barista-led content.",
    notes: null,
    updated_at: "2026-08-14T10:02:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000007",
    title: "Harbour Table Orchard opening campaign",
    vendor_id: redpin,
    category: "events",
    status: "draft",
    renewal_type: "none",
    brand_ids: [harbourTable],
    start_date: "2026-10-01",
    end_date: "2027-01-31",
    notice_period_days: null,
    value: "26500.00",
    billing_frequency: "one_off",
    scope_description:
      "Pre-opening teaser series, launch-week coverage and a 30-day always-on tail.",
    notes: "Waiting on the handover date before the start is committed.",
    updated_at: "2026-08-15T17:48:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000008",
    title: "Press office retainer",
    vendor_id: bellweather,
    category: "pr",
    status: "active",
    renewal_type: "auto",
    brand_ids: [],
    start_date: "2025-10-01",
    end_date: "2026-09-30",
    // The second gap, and the nearer one — this rolls over in six weeks.
    notice_period_days: null,
    value: "4500.00",
    billing_frequency: "monthly",
    scope_description: "Press office, listings, and two pitched features a quarter.",
    notes: null,
    updated_at: "2025-11-12T10:05:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000009",
    title: "Marina ambassador programme",
    vendor_id: tidewater,
    category: "sponsorship",
    // Expired, with no successor and no close-off — the row that owes a decision, and the only
    // one whose Status cell is two buttons instead of a badge.
    status: "expired",
    renewal_type: "auto",
    brand_ids: [harbourTable],
    start_date: "2025-08-01",
    end_date: "2026-07-31",
    notice_period_days: 30,
    value: "15600.00",
    billing_frequency: "annual",
    scope_description: "Two long-term ambassadors, one visit a month, events included.",
    notes: "Both ambassadors have asked to continue. Nobody has answered the renewal.",
    updated_at: "2026-07-31T23:59:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000010",
    title: "The Quay Bar launch creators",
    vendor_id: northlight,
    category: "talent",
    status: "draft",
    renewal_type: "none",
    brand_ids: [quayBar],
    start_date: "2027-01-05",
    end_date: "2027-04-30",
    notice_period_days: null,
    // No figure agreed. `has_value` follows from this below, so the Value cell renders the em
    // dash — "nothing was agreed", which is a different statement from "you may not see it".
    value: null,
    billing_frequency: null,
    scope_description: "Scope agreed at eight creators. The fee is still being negotiated.",
    notes: null,
    updated_at: "2026-08-16T13:24:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000011",
    title: "Brand film and central kitchen production",
    vendor_id: halcyon,
    category: "production",
    status: "active",
    renewal_type: "manual",
    brand_ids: [harbourTable, eastside],
    start_date: "2026-05-01",
    end_date: "2026-10-31",
    notice_period_days: 60,
    value: "9800.00",
    billing_frequency: "one_off",
    scope_description: "One 90-second brand film, three cutdowns, delivered in October.",
    notes: null,
    updated_at: "2026-05-06T15:10:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000012",
    title: "Influencer analytics add-on",
    vendor_id: loopline,
    // Expired and already answered — it produced #13. Resolved history, so "Current" hides it.
    status: "expired",
    category: "tooling",
    renewal_type: "auto",
    brand_ids: [],
    start_date: "2025-08-01",
    end_date: "2026-07-31",
    notice_period_days: 30,
    value: "2400.00",
    billing_frequency: "annual",
    scope_description: "Creator-level attribution on top of the scheduling seats.",
    notes: null,
    renewed_by_id: RENEWED_ANALYTICS,
    updated_at: "2026-07-02T09:30:00Z",
  },
  {
    id: RENEWED_ANALYTICS,
    title: "Influencer analytics add-on (2026–27)",
    vendor_id: loopline,
    category: "tooling",
    status: "draft",
    renewal_type: "auto",
    brand_ids: [],
    start_date: "2026-08-01",
    end_date: "2027-07-31",
    notice_period_days: 30,
    value: "2640.00",
    billing_frequency: "annual",
    scope_description: "Creator-level attribution on top of the scheduling seats.",
    notes: "Successor draft. The 10% uplift is the published list price.",
    renewed_from_id: "c3000000-0000-4000-8000-000000000012",
    updated_at: "2026-07-02T09:30:00Z",
  },
  {
    id: "c3000000-0000-4000-8000-000000000014",
    title: "Tanjong Pagar creator sprint",
    vendor_id: redpin,
    category: "talent",
    // Terminated — history, hidden until "All".
    status: "terminated",
    renewal_type: "none",
    brand_ids: [kopiCo],
    start_date: "2026-01-15",
    end_date: "2026-06-30",
    notice_period_days: null,
    value: "8000.00",
    billing_frequency: "one_off",
    scope_description: "Twelve creators over six weeks, one visit each.",
    notes: null,
    closed_at: "2026-05-02T10:00:00Z",
    closed_reason: "Ended early — the outlet closed for aircon replacement.",
    updated_at: "2026-05-02T10:00:00Z",
  },
  // The last two exist for the vocabulary rather than for the layout, and both are ordinary
  // agreements a group this size would hold. Without them `creative` and `research` are two
  // words in the legend and two filter options that narrow to nothing — which is the state
  // 1.36.1 called "a screen that looks broken rather than empty", at the size of one option.
  {
    id: "c3000000-0000-4000-8000-000000000015",
    title: "Kopi & Co identity refresh",
    vendor_id: halcyon,
    category: "creative",
    status: "active",
    renewal_type: "none",
    brand_ids: [kopiCo],
    start_date: "2026-07-01",
    end_date: "2026-12-15",
    notice_period_days: null,
    value: "34000.00",
    billing_frequency: "one_off",
    scope_description:
      "Wordmark, packaging system and in-store signage, delivered in three stages.",
    notes: "Stage one signed off. The packaging system is the long pole.",
    updated_at: "2026-08-12T11:40:00Z",
  },
  {
    // Every brand at once, which is what a group-wide tracking study is — and the only row
    // that drives the brand cell to its four-name count.
    id: "c3000000-0000-4000-8000-000000000016",
    title: "Brand tracking and share of voice",
    vendor_id: bellweather,
    category: "research",
    status: "active",
    renewal_type: "manual",
    brand_ids: [harbourTable, kopiCo, quayBar, eastside],
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    notice_period_days: 90,
    value: "21000.00",
    billing_frequency: "quarterly",
    scope_description:
      "Quarterly awareness and consideration tracking, plus monthly share-of-voice reporting.",
    notes: null,
    updated_at: "2026-07-09T08:55:00Z",
  },
];

/**
 * The date notice must be given by, counted back from the end date — the server's arithmetic,
 * done here because there is no server.
 *
 * Explicit `Date.UTC` off the split parts, never `new Date("2026-12-31")`: `lib/format.ts` opens
 * with why a business date must not be handed to the local-time constructor, and a deadline is
 * the worst field in the product to be a day out on.
 */
function noticeDueDate(endDate: string | null, noticePeriodDays: number | null): string | null {
  if (!endDate || noticePeriodDays == null) return null;
  const [year, month, day] = endDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! - noticePeriodDays)).toISOString().slice(0, 10);
}

/**
 * The agreements as the wire carries them.
 *
 * `ContractSensitiveRead`, not `ContractRead`: under `AUTH_MODE=token` every caller is the alpha
 * admin, so the shape that carries `value` is the one a real backend would send. The `value`
 * **key is present on every row**, `null` included — that is what `hasContractValue()` narrows
 * on, and a row that omitted it would be claiming "you may not see this figure" about a contract
 * where none was agreed.
 */
export const contracts: ContractSensitive[] = AGREEMENTS.map((agreement) => ({
  id: agreement.id,
  title: agreement.title,
  vendor_id: agreement.vendor_id,
  category: agreement.category,
  status: agreement.status,
  renewal_type: agreement.renewal_type,
  brand_ids: agreement.brand_ids,
  start_date: agreement.start_date,
  end_date: agreement.end_date,
  notice_period_days: agreement.notice_period_days,
  notice_due_date: noticeDueDate(agreement.end_date, agreement.notice_period_days),
  value: agreement.value,
  has_value: agreement.value !== null,
  billing_frequency: agreement.billing_frequency,
  scope_description: agreement.scope_description,
  notes: agreement.notes ?? null,
  owner_user_id: null,
  closed_at: agreement.closed_at ?? null,
  closed_reason: agreement.closed_reason ?? null,
  renewed_by_id: agreement.renewed_by_id ?? null,
  renewed_from_id: agreement.renewed_from_id ?? null,
  // Nothing here models a create-then-edit history, so a record is as old as its term. The
  // Updated column is the one that varies, and it is stated per row above.
  created_at: `${agreement.start_date ?? "2026-01-01"}T09:00:00Z`,
  updated_at: agreement.updated_at,
}));

/**
 * Live work — everything except resolved history.
 *
 * The `ContractView` docstring in `schema.d.ts` is the definition and this is a transcription of
 * it: `terminated` is out, and `expired` is out **only** once it has a successor or a close-off.
 * An unresolved expiry stays in, because hiding it is how a decision gets lost.
 */
export function isCurrent(contract: ContractSensitive): boolean {
  if (contract.status === "terminated") return false;
  if (contract.status === "expired") {
    return !contract.renewed_by_id && !contract.closed_at;
  }
  return true;
}

/**
 * The vendors, with the aggregates their contracts imply.
 *
 * **Derived, never written down.** `influencers.ts` shipped every agency at `0` and said why:
 * *"a row claiming two active contracts would be a number the Contracts screen flatly
 * contradicts"*. That constraint has not softened now that contracts exist — it has only changed
 * which number is the true one, and the way to keep two screens agreeing is to compute one from
 * the other rather than to type it twice.
 *
 * The three counts answer three different questions, so they are counted over three different
 * sets:
 *
 *   - `contracts_total` — every agreement ever held with them, history included. It is the
 *     denominator of "1 active of 4", and a denominator that hid the terminated ones would make
 *     the fraction smaller than the list behind the click-through.
 *   - `contracts_active` — `status === "active"` only. Not "current": a draft is not cover.
 *   - `brand_ids_covered` — the distinct brands across the **active** contracts, because the
 *     question is what they work on now. A vendor whose only agreement was terminated works on
 *     nothing.
 *
 * `brand_ids_covered` was `outlets_covered` and is the one aggregate that changed shape rather
 * than value. The generated field counted premises, which a contract no longer names; the honest
 * replacement covers the dimension it does name. **A group-level agreement contributes nothing to
 * it**, which is right and worth saying out loud: Loopline's seat licence is held for everybody,
 * so "no brands" is not a claim that Loopline is unused — the `1 active of 2` beside it is what
 * says otherwise. The table words the zero rather than printing it.
 *
 * **The ids, not the count.** It was `brands_covered: covered.size` for one release, and the
 * count is now `brand_ids_covered.length` — the same number, derived from the thing the vendors
 * table has to *name* on hover. Two values would be two chances to disagree, which is the whole
 * argument of this docstring one field further down.
 *
 * `next_contract_end` is the earliest end date among the active ones, which is the next time
 * this relationship needs a decision.
 */
export const vendors: VendorListItem[] = [...agencies, ...PROVIDERS].map((vendor) => {
  const held = contracts.filter((contract) => contract.vendor_id === vendor.id);
  const active = held.filter((contract) => contract.status === "active");
  const covered = new Set(active.flatMap((contract) => contract.brand_ids));
  const ends = active
    .map((contract) => contract.end_date)
    .filter((end): end is string => end !== null)
    .sort();

  return {
    ...vendor,
    contracts_total: held.length,
    contracts_active: active.length,
    brand_ids_covered: [...covered],
    next_contract_end: ends[0] ?? null,
  };
});
