"use client";

import * as React from "react";
import { useSWRConfig } from "swr";

/**
 * Cache invalidation by scope.
 *
 * A mutation and the list it changes are usually in different components — the "New outlet"
 * button lives in the page header, the table below it is a sibling. Passing a `mutate` down
 * through both would couple them; invalidating by scope keeps them independent, which is the
 * same reason the service layer exists.
 *
 * Scopes are the first element of every SWR key in this app (`["outlets", filters]`,
 * `["outlet", id]`). Creating an outlet invalidates `outlets`; editing one invalidates both
 * `outlets` and `outlet`, because the row in the table and the record on the detail page are two
 * cache entries holding the same truth.
 *
 * `useSWRInfinite` stores its list under an aggregate `$inf$…` **string** key, and that key has
 * to be mutated **by name**: SWR's `mutate(matcherFn)` deliberately skips every `$inf$`-prefixed
 * key, so a matcher — however correct — can never reach an infinite list. That is why the two
 * halves below are not redundant.
 *
 * ⚠️ This was a real, invisible bug for every list screen in the product, found in the browser
 * during the review area (2.4): creating an outlet returned 201 and showed its toast, and the
 * table underneath went on showing the old rows with no request in the network log. Nothing in
 * the type system or the test suite can see it — the code reads as though it works, and SWR's
 * revalidate-on-focus hides it the moment you tab away and back.
 */
export function useInvalidate() {
  const { mutate, cache } = useSWRConfig();

  return React.useCallback(
    async (...scopes: string[]) => {
      // A serialised key holds its scope quoted — SWR's `stableHash` runs `JSON.stringify`
      // over a string inside an array — so `"outlets"` matches `["outlets", …]` and never
      // the `outlet-networks` scope that merely starts with the same letters.
      const matchesSerialised = (key: string) =>
        scopes.some((scope) => key === scope || key.includes(`"${scope}"`));

      const infiniteKeys: string[] = [];
      for (const key of cache.keys()) {
        if (key.startsWith("$inf$") && matchesSerialised(key)) infiniteKeys.push(key);
      }

      await Promise.all([
        mutate(
          (key: unknown) => {
            if (Array.isArray(key)) {
              return typeof key[0] === "string" && scopes.includes(key[0]);
            }
            if (typeof key === "string") {
              return matchesSerialised(key);
            }
            return false;
          },
          undefined,
          { revalidate: true },
        ),
        // By name, because the matcher above cannot see these. This is the documented
        // shape — `mutate(unstable_serialize(getKey))` — reached from the cache rather
        // than from each caller's key function, which the scope indirection exists to
        // avoid knowing about.
        ...infiniteKeys.map((key) => mutate(key)),
      ]);
    },
    [mutate, cache],
  );
}

/** Scope names, in one place so a typo is a type error rather than a cache that never clears. */
export const SCOPES = {
  outlets: "outlets",
  outlet: "outlet",
  entities: "entities",
  entity: "entity",
  brands: "brands",
  brand: "brand",
  networks: "outlet-networks",
  network: "outlet-network",
  devices: "network-devices",
  device: "network-device",
  licenseTypes: "license-types",
  suggestions: "license-suggestions",
  requirements: "license-requirements",
  readiness: "license-readiness",
  licenses: "licenses",
  license: "license",
  obligations: "obligations",
  dashboard: "dashboard",
  vendors: "vendors",
  vendor: "vendor",
  contacts: "contacts",
  contact: "contact",
  contracts: "contracts",
  contract: "contract",
  tenancies: "tenancies",
  tenancy: "tenancy",
  schedules: "service-schedules",
  visits: "service-visits",
  reports: "service-reports",
  serviceHealth: "service-health",
  expenses: "expenses",
  expenseSummary: "expense-summary",
  attachments: "attachments",
  review: "review",
  reviewSummary: "review-summary",
  settings: "settings",
  // The live Expiring tab is its own aggregate scope, invalidated when the buffer changes.
  licensesExpiring: "licenses-expiring",
  // Ops Forms inbox — one scope, keyed per form; a submit or a status change invalidates it.
  formSubmissions: "form-submissions",
} as const;
