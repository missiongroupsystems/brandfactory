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
 *   3. Any **mutation** refuses with a 503 and an honest message, which `useSubmit` already
 *      surfaces as a toast. Nothing here is stored, and a form that silently appeared to
 *      save would be the worst outcome of the three.
 *
 * As real BrandFactory screens replace Ops ones they move to the Hono client and its shared
 * `AppType`, per `CLAUDE.md`. This file shrinks as that happens; it is scaffolding, not a
 * layer we are keeping.
 */

import { dashboard } from "@/fixtures/dashboard";
import { licenses, licenseTypes } from "@/fixtures/licenses";
import { entities, outlets } from "@/fixtures/registry";

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
  // **Deliberately unregistered.** `/brands` had a fixture for exactly one release: 1.32.0
  // registered it so the sidebar's brand toggle had a list. That toggle now reads the Hono
  // server through `features/brands/`, so the fixture went with it.
  //
  // What still reads `/brands` here is `features/registry-brands/` — the Operations Hub's own
  // brand dimension, which eight screens use to resolve an outlet's `brand_id` to a name. It
  // falls through to `EMPTY` (rule 2) like the other fifteen unfixtured areas and renders its
  // real empty states. Restoring a fixture for it would be an Ops decision, not a
  // BrandFactory one.

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
  [/^\/outlets\/([^/]+)\/related-contracts$/, () => []],
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
];

export function resolveMock(method: string, path: string): MockResult {
  const [pathname, rawSearch = ""] = path.split("?");
  const search = new URLSearchParams(rawSearch);

  if (method.toUpperCase() !== "GET") {
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
