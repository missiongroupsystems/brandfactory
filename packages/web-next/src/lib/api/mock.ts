/**
 * The fixture backend.
 *
 * This app was lifted from the Operations Hub, whose screens all talk to a FastAPI service
 * that does not exist in this repository. Rather than gut the service and hook layers — which
 * are the structure we adopted this app *for* — every request is answered here instead, from
 * static data. One swap point, in {@link apiFetch}, and nothing downstream knows.
 *
 * Three rules, and the second is the one that carries the tree:
 *
 *   1. A **registered `GET`** returns its fixture.
 *   2. An **unregistered `GET`** returns {@link EMPTY} — an empty array that also carries
 *      `items` and `next_cursor`. Every list in this app reads one shape or the other, and
 *      that value satisfies both, so the fifteen areas with no fixtures render their real
 *      empty states instead of throwing. It is deliberately not `null` and not `{}`.
 *   3. An **unregistered mutation** refuses with a 503 and an honest message, which `useSubmit`
 *      already surfaces as a toast. Nothing is stored, and a form that silently appeared to
 *      save would be the worst outcome of the three.
 *
 * Rule 3 said "any mutation" until Marketing Requests, and the exception is narrow enough to
 * state in full: {@link WRITES} holds the three routes behind that one screen, and they write
 * to a module-level array in `fixtures/marketing-requests.ts`. The reason is that the screen's
 * subject *is* the mutation — an inbox exists to move a row from New to In progress to
 * Completed — so a status control that errors on every click is not a screen anyone can review.
 * The honesty moves to the surface instead of the transport: the page carries a `MockBanner`
 * saying the rows are samples held in memory, and the nav item carries a "Sample" tag. Nothing
 * written there survives a reload. Do not grow this list to make some other form feel finished.
 *
 * As real BrandFactory screens replace Ops ones they move to the Hono client and its shared
 * `AppType`, per `CLAUDE.md`. This file shrinks as that happens; it is scaffolding, not a
 * layer we are keeping.
 */

import { brands } from "@/fixtures/brands";
import { contracts, isCurrent, vendors } from "@/fixtures/contracts";
import { dashboard } from "@/fixtures/dashboard";
import { influencers } from "@/fixtures/influencers";
import { licenses, licenseTypes } from "@/fixtures/licenses";
import {
  addMarketingRequest,
  listMarketingRequests,
  setMarketingRequestStatus,
} from "@/fixtures/marketing-requests";
import { entities, outlets } from "@/fixtures/registry";

import type { SubmissionStatus } from "./types";

/** The result of a lookup. Deliberately not an `ApiError` — that lives in `client.ts`, which
 *  imports this module, and constructing it here would make the two files a cycle. */
export type MockResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number; detail: string };

/** Satisfies both `T[]` and `Page<T>` at once. See rule 2 above. */
const EMPTY = Object.assign([] as unknown[], { items: [], next_cursor: null });

function page<T>(items: T[]) {
  return { items, next_cursor: null };
}

type Handler = (params: string[], search: URLSearchParams) => unknown;

/** Case-insensitive substring match, for the `q` box every list screen carries. */
function matches(value: string | null | undefined, q: string | null) {
  if (!q) return true;
  return (value ?? "").toLowerCase().includes(q.toLowerCase());
}

/**
 * Ordered. The first pattern that matches the pathname wins, so a literal route must be
 * declared before the `:id` pattern that would also swallow it — `/licenses/expiring`
 * before `/licenses/(...)`.
 */
const ROUTES: [RegExp, Handler][] = [
  [/^\/dashboard$/, () => dashboard],

  // Registry ---------------------------------------------------------------
  [
    /^\/entities$/,
    (_p, search) =>
      page(
        entities.filter(
          (e) =>
            matches(e.name, search.get("q")) &&
            (!search.get("status") || e.status === search.get("status")),
        ),
      ),
  ],
  [/^\/entities\/([^/]+)$/, ([id]) => entities.find((e) => e.id === id)],

  // Brands -----------------------------------------------------------------
  // **Registered again, and the reversal is deliberate.** `/brands` had a fixture for exactly
  // one release — 1.32.0, for the sidebar's brand toggle — and lost it when that toggle moved
  // to the Hono server through `features/brands/`. What was left reading this path is
  // `features/registry-brands/`, the Operations Hub's own brand dimension, and for as long as
  // that dimension was only *resolved* (an outlet's `brand_id` to a name, on screens cut from
  // the nav) falling through to `EMPTY` was the honest answer.
  //
  // It is not the honest answer now. `/contracts` groups by brand, filters by brand and asks
  // for brands on create, so an empty index would mean one bucket called `…`, a filter with no
  // options, and a screen that looks broken rather than empty — the exact reading 1.36.1
  // rejected for the contracts themselves, one dimension up.
  //
  // **These are not the brands the sidebar shows.** Those are the workspace's, on the Hono
  // server, and `fixtures/brands.ts` opens with why a static fixture cannot be wired to them.
  [
    /^\/brands$/,
    (_p, search) =>
      page(
        brands.filter(
          (b) =>
            matches(b.name, search.get("q")) &&
            (!search.get("status") || b.status === search.get("status")),
        ),
      ),
  ],
  [/^\/brands\/([^/]+)$/, ([id]) => brands.find((b) => b.id === id)],

  // Outlets -----------------------------------------------------------------
  // **The `/outlets` *screens* no longer read this.** They moved to
  // `features/outlets/`, the Hono server and a real `outlets` table. What is
  // still served here is the Operations Hub's own outlet, which twenty-six files
  // across fourteen cut-from-nav areas resolve an `outlet_id` against through
  // `features/registry/hooks.ts` — contracts, licences, tenancies, networks,
  // service reports, the review queue. Without it every one of those would render
  // `…` in its first column.
  //
  // This shrinks when those screens do, not before.
  [
    /^\/outlets$/,
    (_p, search) =>
      page(
        outlets.filter(
          (o) =>
            (matches(o.name, search.get("q")) || matches(o.postal_code, search.get("q"))) &&
            (!search.get("status") || o.status === search.get("status")) &&
            (!search.get("outlet_type") || o.outlet_type === search.get("outlet_type")) &&
            (!search.get("entity_id") || o.entity_id === search.get("entity_id")),
        ),
      ),
  ],
  // Both, because the list links by slug and the detail page's own children fetch by id.
  [/^\/outlets\/([^/]+)$/, ([key]) => outlets.find((o) => o.id === key || o.slug === key)],
  // `related-contracts` is gone with the dimension it joined on. It answered "what would a
  // close of this outlet have to dispose of", which a contract that names brands rather than
  // premises cannot be asked. The disposition dialog says so rather than guessing — see
  // `features/registry/components/close-dialogs.tsx`.
  [/^\/outlets\/([^/]+)\/license-suggestions$/, () => []],
  [
    /^\/outlets\/([^/]+)\/license-readiness$/,
    ([id]) => ({
      outlet_id: id,
      required: 7,
      met: 3,
      outstanding: 4,
      mandatory_outstanding: 2,
      past_target: 0,
    }),
  ],

  // Licences ---------------------------------------------------------------
  [
    /^\/license-types$/,
    (_p, search) =>
      page(
        licenseTypes.filter(
          (t) =>
            (matches(t.name, search.get("q")) || matches(t.issuing_authority, search.get("q"))) &&
            (!search.get("necessity") || t.necessity === search.get("necessity")),
        ),
      ),
  ],
  [/^\/license-types\/([^/]+)$/, ([id]) => licenseTypes.find((t) => t.id === id)],

  [/^\/license-requirements$/, () => page([])],

  // Before the `:id` route below, which would otherwise match "expiring".
  [
    /^\/licenses\/expiring$/,
    () =>
      licenses
        .filter((l) => l.expiry_date && (l.status === "expiring" || l.status === "expired"))
        .map((l) => {
          const type = licenseTypes.find((t) => t.id === l.license_type_id)!;
          const entity = entities.find((e) => e.id === l.holder_entity_id)!;
          const outlet = outlets.find((o) => o.id === l.outlet_id);
          const days = Math.round(
            (Date.parse(l.expiry_date!) - Date.parse("2026-08-17")) / 86_400_000,
          );
          return {
            license_id: l.id,
            license_type_id: type.id,
            license_type_name: type.name,
            issuing_authority: type.issuing_authority,
            holder_entity_id: entity.id,
            holder_entity_name: entity.name,
            holder_person_name: l.holder_person_name,
            outlet_id: outlet?.id ?? null,
            outlet_name: outlet?.name ?? null,
            expiry_date: l.expiry_date!,
            days_to_expiry: days,
            state: l.status,
            warning_window_days: 90,
            renewal_lead_time_days: type.renewal_lead_time_days,
            renewal_process: type.renewal_process,
            processing_time: type.processing_time,
            lead_exceeds_days_left: (type.renewal_lead_time_days ?? 0) > days,
          };
        }),
  ],
  [
    /^\/licenses$/,
    (_p, search) =>
      page(
        licenses.filter((l) => {
          const type = licenseTypes.find((t) => t.id === l.license_type_id);
          const entity = entities.find((e) => e.id === l.holder_entity_id);
          const q = search.get("q");
          const hit =
            matches(type?.name, q) ||
            matches(entity?.name, q) ||
            matches(l.license_number, q) ||
            matches(outlets.find((o) => o.id === l.outlet_id)?.name, q);
          return (
            hit &&
            (!search.get("status") || l.status === search.get("status")) &&
            (!search.get("outlet_id") || l.outlet_id === search.get("outlet_id"))
          );
        }),
      ),
  ],
  [/^\/licenses\/([^/]+)$/, ([id]) => licenses.find((l) => l.id === id)],

  // Influencers ------------------------------------------------------------
  // The **Influencers** nav item, whose route is still `/contacts` — see
  // `fixtures/influencers.ts` for why the two words disagree and why the agencies below are
  // in the same fixture as the people.
  //
  // `/vendors` is registered here **because the Influencers screen needs it**, not as a
  // separate decision about the Vendors area: `ContactsBrowser` groups by vendor and resolves
  // each id through `useVendorIndex`, so without this every group header would render `…`.
  // The Vendors screen reads the same route and is populated as a consequence.
  //
  // It reads `vendors` from `fixtures/contracts.ts` rather than `agencies` from
  // `fixtures/influencers.ts`, and the two are not interchangeable: that list is the talent
  // agencies **plus** the three providers only a contract makes exist, each carrying the four
  // aggregates derived from the contracts below. `agencies` still ships every aggregate at 0,
  // which was the true answer for as long as there were no contracts and is now a number this
  // route would be contradicting.
  [
    /^\/vendors$/,
    (_p, search) =>
      page(
        vendors.filter(
          (v) =>
            matches(v.name, search.get("q")) &&
            // `kind` is a view control on that screen and is always sent; "all" is the
            // absence of the filter, so the client omits the key rather than sending it.
            (!search.get("kind") || v.kind === search.get("kind")) &&
            (!search.get("status") || v.status === search.get("status")) &&
            (!search.get("category") || v.category === search.get("category")),
        ),
      ),
  ],
  [/^\/vendors\/([^/]+)$/, ([id]) => vendors.find((v) => v.id === id)],
  [
    /^\/vendors\/([^/]+)\/contracts$/,
    ([id]) => page(contracts.filter((c) => c.vendor_id === id)),
  ],

  // Contracts --------------------------------------------------------------
  // Seven filters and a view, because every one of them is a control on screen and a filter
  // the table offers but the fixture ignores is worse than no data: the reader narrows, the
  // rows do not move, and the screen looks broken rather than empty.
  [
    /^\/contracts$/,
    (_p, search) =>
      page(
        contracts.filter((c) => {
          const q = search.get("q");
          // Title plus the name of the one party that identifies it — the rule AGENTS.md
          // records and `contract_operations` implements. `HighlightMatch` marks the vendor
          // hit in the row, so the reader can see why a title that does not match matched.
          const vendor = vendors.find((v) => v.id === c.vendor_id);
          const hit = matches(c.title, q) || matches(vendor?.name, q);

          // Brand is one hop now, off the row's own field. It was two — `contract → outlet →
          // brand` — and the join is gone with the outlet dimension, which is the whole reason
          // this filter narrows to real rows instead of to nothing.
          const brandId = search.get("brand_id");
          const brandHit = !brandId || c.brand_ids.includes(brandId);

          return (
            hit &&
            brandHit &&
            (!search.get("category") || c.category === search.get("category")) &&
            (!search.get("status") || c.status === search.get("status")) &&
            (!search.get("renewal_type") || c.renewal_type === search.get("renewal_type")) &&
            (!search.get("vendor_id") || c.vendor_id === search.get("vendor_id")) &&
            // The review queue's `contract_notice_period_missing` predicate. `true` or
            // absent, never `false` — the API reads `false` as "do not narrow", and the
            // table has been bitten once by a reader that disagreed with it.
            (search.get("notice_gap") !== "true" ||
              (c.renewal_type === "auto" && c.notice_period_days == null)) &&
            // The default is `current`, not `all`. Anything else is a malformed value and
            // falls back to the default rather than widening the list.
            (search.get("view") === "all" || isCurrent(c))
          );
        }),
      ),
  ],
  [/^\/contracts\/([^/]+)$/, ([id]) => contracts.find((c) => c.id === id)],

  [
    /^\/contacts$/,
    (_p, search) =>
      page(
        influencers.filter((c) => {
          const agency = c.vendor_id ? vendors.find((v) => v.id === c.vendor_id) : undefined;
          const q = search.get("q");
          // Own name plus the name of the one party that identifies them — the rule
          // `contact_operations` implements and AGENTS.md records. Not full text over
          // every field, and not a substitute for the two filters beside it.
          const hit = matches(c.name, q) || matches(agency?.name, q);
          // The trade is the *agency's*, reached by the join, which is why an independent
          // creator matches no category rather than matching "other".
          const category = search.get("category");
          return (
            hit &&
            (!search.get("vendor_id") || c.vendor_id === search.get("vendor_id")) &&
            (!category || agency?.category === category) &&
            // `true` or absent, never `false` — the API takes `bool | None`, so `false`
            // means unfiltered rather than "has a vendor".
            (search.get("unlinked") !== "true" || c.vendor_id === null)
          );
        }),
      ),
  ],
  [/^\/contacts\/([^/]+)$/, ([id]) => influencers.find((c) => c.id === id)],

  // Marketing Requests -----------------------------------------------------
  // The inbox. Its two mutations are in {@link WRITES} below — the one exception to rule 3,
  // argued in this file's header.
  [/^\/forms\/marketing-request\/submissions$/, () => listMarketingRequests()],
];

/**
 * The registered mutations — the exception to rule 3, and deliberately a separate list rather
 * than a `method` column on {@link ROUTES}. Reads and writes answer different questions here:
 * an unregistered read is an empty area and returns `EMPTY`, while an unregistered write is a
 * screen with no backend and must refuse. Two lists keep those two defaults apart instead of
 * hiding a branch inside one loop.
 *
 * A handler returns the response body, or `undefined` for "no such row" — which becomes a 404,
 * the same as a read.
 */
type WriteHandler = (params: string[], body: unknown) => unknown;

const WRITES: [string, RegExp, WriteHandler][] = [
  // In-app submit, from the request sheet.
  [
    "POST",
    /^\/forms\/marketing-request\/submissions$/,
    (_p, body) => addMarketingRequest(payloadOf(body), new Date().toISOString()),
  ],
  // The public `/f/request` page, which posts with no token to the unauthenticated path. It
  // reaches this file only because `publicSubmit` checks `API_MODE` — its own `fetch` would
  // otherwise go straight to a service that is not there.
  [
    "POST",
    /^\/public\/forms\/request\/submissions$/,
    (_p, body) => ({
      reference: addMarketingRequest(payloadOf(body), new Date().toISOString()).reference,
    }),
  ],
  // Move one row along the ladder.
  [
    "PATCH",
    /^\/forms\/submissions\/([^/]+)$/,
    ([id], body) => setMarketingRequestStatus(id, statusOf(body)),
  ],
];

/** The `{payload}` envelope both submit routes take. A body that is not that shape yields an
 *  empty payload rather than throwing — the fixture then records a row with no summary, which
 *  is visible on screen and therefore findable. */
function payloadOf(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return {};
  const payload = (body as { payload?: unknown }).payload;
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function statusOf(body: unknown): SubmissionStatus {
  const status = (body as { status?: unknown } | null)?.status;
  return status === "in_review" || status === "resolved" ? status : "new";
}

export function resolveMock(method: string, path: string, body?: unknown): MockResult {
  const [pathname, rawSearch = ""] = path.split("?");
  const search = new URLSearchParams(rawSearch);
  const verb = method.toUpperCase();

  if (verb !== "GET") {
    for (const [writeVerb, pattern, handler] of WRITES) {
      if (writeVerb !== verb) continue;
      const match = pattern.exec(pathname);
      if (!match) continue;
      const result = handler(match.slice(1), body);
      if (result === undefined) return { ok: false, status: 404, detail: `${pathname} not found` };
      return { ok: true, body: result };
    }

    return {
      ok: false,
      status: 503,
      detail: "Mock data — nothing is stored. This screen has no backend yet.",
    };
  }

  for (const [pattern, handler] of ROUTES) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    const body = handler(match.slice(1), search);
    // A registered route that finds nothing is a genuine 404, not an empty list — that is
    // what a detail page for a deleted row should see.
    if (body === undefined) return { ok: false, status: 404, detail: `${pathname} not found` };
    return { ok: true, body };
  }

  return { ok: true, body: EMPTY };
}
