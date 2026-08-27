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

/**
 * The prefixes SWR's own key matcher refuses to visit.
 *
 * `internalMutate` filters `cache.keys()` with `!/^\$(inf|sub)\$/.test(key)` before it applies a
 * caller's matcher, so **no matcher can ever reach a `useSWRInfinite` or `useSWRSubscription`
 * entry** — not `(key) => true`, not any other. Thirteen files here reach SWR through
 * `useCursorPages`, so this is most of the product's list data.
 */
const MATCHER_BLIND_PREFIXES = /^\$(inf|sub)\$/;

/**
 * Empty the whole cache — every scope, and the paginated lists a matcher cannot see.
 *
 * **`mutate(() => true, …)` is not "clear everything", and reading it as such is the bug this
 * exists to close.** The sign-out path used that call on its own, so a signed-out session left
 * every `useCursorPages` list behind: sign in as a second user in the same tab and the first
 * user's rows were still in the cache under the new session. It is the same blindness
 * `useInvalidate` above already works around, in the one place where the cost is not a stale
 * table but a previous person's data.
 *
 * `revalidate: false` throughout: there is deliberately nothing to refetch, because the point of
 * calling this is that the session behind every one of those keys has ended.
 */
export function useClearCache() {
  const { mutate, cache } = useSWRConfig();

  return React.useCallback(async () => {
    const blind: string[] = [];
    for (const key of cache.keys()) {
      if (MATCHER_BLIND_PREFIXES.test(key)) blind.push(key);
    }

    await Promise.all([
      mutate(() => true, undefined, { revalidate: false }),
      ...blind.map((key) => mutate(key, undefined, { revalidate: false })),
    ]);
  }, [mutate, cache]);
}

/** Scope names, in one place so a typo is a type error rather than a cache that never clears. */
export const SCOPES = {
  outlets: "outlets",
  outlet: "outlet",
  entities: "entities",
  entity: "entity",
  // The Operations Hub's third registry dimension — a brand an outlet belongs to. Renamed
  // out of the way when the BrandFactory brands below needed the plain word; the key and the
  // string moved together, and both are only cache identity, so nothing on the wire changed.
  registryBrands: "registry-brands",
  registryBrand: "registry-brand",
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
  // The Operations Hub's counterparty book — the companies `fixtures/agencies.ts` and
  // `fixtures/contracts.ts` invented. Renamed out of the way when BrandFactory's vendors below
  // needed the plain word, exactly as `registryBrands` above was; the key and the string moved
  // together, and both are only cache identity, so nothing on the wire changed.
  //
  // **Still live.** The Contracts screen resolves `vendor_id` to a name through
  // `useVendorIndex`, and the review queue creates a contact against one.
  registryVendors: "registry-vendors",
  registryVendor: "registry-vendor",
  // The Operations Hub's address book. **No longer read by a screen** — the Influencers page
  // moved off it — but `useContactMutations` is still called by the tenancy intake sheet and the
  // review queue's actions, both of which create a contact against a vendor. The scopes stay
  // because those writes still have to invalidate the vendor lists that embed the rows.
  contacts: "contacts",
  contact: "contact",
  contracts: "contracts",
  contract: "contract",
  tenancies: "tenancies",
  tenancy: "tenancy",
  // `schedules`, `visits`, `reports` and `serviceHealth` stood here. They are gone with the
  // service workflow, which was keyed on a `(contract, outlet)` pair a contract no longer has.
  // A scope with no reader is a string nothing can invalidate and everything can typo into.
  expenses: "expenses",
  expenseSummary: "expense-summary",
  attachments: "attachments",
  review: "review",
  reviewSummary: "review-summary",
  settings: "settings",
  // The live Expiring tab is its own aggregate scope, invalidated when the buffer changes.
  licensesExpiring: "licenses-expiring",
  // The Marketing Requests inbox; a submit or a status change invalidates it. It was keyed per
  // form while Ops Forms had two; there is one form now and the key went with the second.
  formSubmissions: "form-submissions",

  // ── BrandFactory ─────────────────────────────────────────────────────────────
  // Scopes for the features that read the Hono server through `lib/api/bf-client.ts`
  // rather than the Ops fixtures. Listed here with the rest because the invalidation
  // mechanism is the same one, and two scope registries would be two places to typo.
  me: "me",
  workspaces: "workspaces",
  // BrandFactory's brands, keyed `[brands, workspaceId]` — a brand id means nothing outside
  // its workspace, so the scope alone would serve one workspace's list under another's header.
  bfBrands: "brands",
  // One brand with its guideline sections, keyed `[brand, brandId]`. Its own scope beside the
  // list's, the same split every Ops area makes: the row in the switcher and the document on
  // the profile are two cache entries holding the same truth, and a guidelines write has to
  // invalidate both — the list carries `sectionCount` and the flattened `tldr`.
  bfBrand: "brand",
  // BrandFactory's outlets, keyed `[bf-outlets, workspaceId]` and
  // `[bf-outlet, workspaceId, ref]`.
  //
  // **Prefixed, because the Ops `outlets` / `outlet` above are still live.**
  // `features/outlets` reads the Hono server and `features/registry` still
  // answers fourteen cut-from-nav Ops screens from the fixtures, so both scope
  // families exist at once. Reusing the plain word would make one create here
  // invalidate every one of that folder's paginated lists, and one Ops write
  // refetch this one — not a crash, just two areas quietly refetching each
  // other's data forever. `cache.test.ts` pins every value in this object as
  // distinct, which is the invariant that keeps the separation real.
  //
  // Distinctness is also *sufficient*: `matchesSerialised` compares the scope
  // with its quotes on, so `"outlets"` cannot match inside `"bf-outlets"`.
  bfOutlets: "bf-outlets",
  bfOutlet: "bf-outlet",
  // BrandFactory's creators, keyed `[bf-influencers, workspaceId]` and
  // `[bf-influencer, workspaceId, ref]`.
  //
  // **Prefixed for the same reason the outlet pair above is, and the plain
  // `influencers` that used to stand beside `contacts` is gone with the fixture
  // it keyed.** That scope was the Ops family's by position and BrandFactory's by
  // intent, which was tolerable while nothing was stored and is not now that a
  // write has to invalidate something real. The Ops `contacts` / `contact` scopes
  // stay — `useContactMutations` is still live on the tenancy sheet and the review
  // queue — so both families of people exist at once, and only one of them is
  // ours.
  bfInfluencers: "bf-influencers",
  bfInfluencer: "bf-influencer",
  // BrandFactory's vendors, keyed `[bf-vendors, workspaceId]` and
  // `[bf-vendor, workspaceId, ref]`.
  //
  // **Prefixed for the same reason the two pairs above are, and this time the
  // Ops side moved rather than the plain word being left where it was.** Phase C
  // renamed `vendors` / `vendor` to `registryVendors` / `registryVendor` because
  // the Operations Hub's book is still live — `/contracts` resolves every
  // `contract.vendor_id` through it — so both families exist at once and neither
  // may hold a string the other can match. The plain words are now held by
  // *nobody*, which `cache.test.ts` asserts: it is the tempting future edit, and
  // it would have one area refetching the other's lists forever.
  bfVendors: "bf-vendors",
  bfVendor: "bf-vendor",
  // A brand's latest research run (`GET /brands/:id/research`). Separate from the brand because
  // it is a separate aggregate on the server and is allowed to arrive late; no brand write
  // touches it.
  bfResearch: "brand-research",
  // The deployment's research config (`GET /research`). One boolean, and it is deployment
  // configuration rather than a brand fact — so it is its own scope and no brand write
  // touches it.
  researchConfig: "research-config",
  // A brand's resources (`GET /brands/:id/resources`), keyed `[bf-resources, brandId]`. Its own
  // scope rather than `bfBrand`'s: the resource list is a separate aggregate on the server, and
  // `BrandWithSections` carries no resource data for a write there to invalidate.
  bfResources: "bf-resources",
} as const;
