import { act, render } from "@testing-library/react";
import useSWR, { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";

import { SCOPES, useInvalidate, useRevalidate } from "./cache";

/**
 * **One invariant, and it is the one that keeps two backends apart.**
 *
 * A scope is the first element of every SWR key in this app, and `useInvalidate`
 * matches on it exactly (`key[0] === scope`, or the quoted string inside a
 * serialised `$inf$` key). Two entries in `SCOPES` holding the same *string* are
 * therefore one scope wearing two names — and the failure is silent in every way
 * this repository cares about: it type-checks, it lints, it builds, and it looks
 * right in a browser. What actually happens is that a write in one area refetches
 * another area's lists forever.
 *
 * The pair this exists for is `outlets` / `outlet` (the Operations Hub's, served
 * from the fixtures to fourteen cut-from-nav screens) against `bf-outlets` /
 * `bf-outlet` (BrandFactory's, served by the Hono server). Both are live at once,
 * both are about a thing called an outlet, and the tempting edit — dropping the
 * prefix now that the real one owns the screens — is exactly the edit this test
 * refuses.
 */
describe("SCOPES", () => {
  it("holds no duplicate strings", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [name, value] of Object.entries(SCOPES)) {
      const first = seen.get(value);
      if (first) duplicates.push(`${first} and ${name} both use "${value}"`);
      else seen.set(value, name);
    }
    expect(duplicates).toEqual([]);
  });

  it("keeps the two outlet families separate", () => {
    // Named rather than left to the loop above, because this is the pair that
    // has a reason to collide and the loop's message would not say so.
    expect(SCOPES.bfOutlets).not.toBe(SCOPES.outlets);
    expect(SCOPES.bfOutlet).not.toBe(SCOPES.outlet);
  });

  it("keeps BrandFactory's creators apart from the Ops address book", () => {
    // The second pair with a reason to collide: both families are people, both
    // are live — `useContactMutations` still runs on the tenancy sheet and the
    // review queue — and only one of them is ours. The unprefixed `influencers`
    // that used to stand beside `contacts` is gone with the fixture it keyed;
    // this is what stops it coming back.
    expect(SCOPES.bfInfluencers).not.toBe(SCOPES.contacts);
    expect(SCOPES.bfInfluencer).not.toBe(SCOPES.contact);
    expect(SCOPES).not.toHaveProperty("influencers");
  });

  it("keeps BrandFactory's vendors apart from the Operations Hub's book", () => {
    // The third pair with a reason to collide, and the one this rename created.
    // Both families are companies you buy from, both are live — `/contracts`
    // resolves every `vendor_id` through `useVendorIndex` — and only one of them
    // is ours. The unprefixed `vendors` that used to stand here is what a future
    // "tidy-up" would reach for; this is what stops it coming back.
    expect(SCOPES.registryVendors).toBe("registry-vendors");
    expect(SCOPES.registryVendor).toBe("registry-vendor");
    expect(SCOPES).not.toHaveProperty("vendors");
    expect(SCOPES).not.toHaveProperty("vendor");
    // And the real one, which now reads a live route rather than nothing. The
    // pair above was registered by the rename; this is the pair a write has to
    // sweep, and the two must never be one string.
    expect(SCOPES.bfVendors).not.toBe(SCOPES.registryVendors);
    expect(SCOPES.bfVendor).not.toBe(SCOPES.registryVendor);
  });

  it("cannot match one scope inside another, because the matcher quotes both", () => {
    // The subtler half: `useInvalidate` tests `key.includes(`"${scope}"`)` on a
    // serialised `$inf$` key. `"bf-outlets"` contains the letters of `outlets`,
    // and it is the quotes that stop that from being a match. Asserted here so a
    // future edit to `matchesSerialised` that drops them fails something.
    const serialisedBfKey = '$inf$@"bf-outlets","ws-1",';
    expect(serialisedBfKey.includes(`"${SCOPES.outlets}"`)).toBe(false);
    expect(serialisedBfKey.includes(`"${SCOPES.bfOutlets}"`)).toBe(true);
  });
});

/**
 * **The difference between a list that updates and a page that blinks.**
 *
 * `useInvalidate` passes `undefined` as the new data, which empties the cache entry:
 * `data` goes `undefined`, SWR reports `isLoading` again, and every screen that renders
 * a skeleton while loading throws its whole self away and rebuilds. On the photography
 * grid that meant adding one subject flashed the entire page — reported from a browser,
 * and invisible to every other check in this repository.
 *
 * These drive real SWR rather than reading the source, because the thing worth pinning is
 * what a *screen* sees: whether `data` survives the sweep.
 */
describe("useRevalidate vs useInvalidate", () => {
  const SCOPE = "test-scope";

  /** A hook under one SWR cache, reporting what a screen would render from. */
  function renderProbe(sweepWith: "revalidate" | "invalidate") {
    let resolveFetch: (v: string[]) => void = () => {};
    const fetcher = () =>
      new Promise<string[]>((resolve) => {
        resolveFetch = resolve;
      });

    function Probe() {
      const { data, isLoading } = useSWR<string[]>([SCOPE, "x"], fetcher);
      const revalidate = useRevalidate();
      const invalidate = useInvalidate();
      seen = { data, isLoading };
      sweep = sweepWith === "revalidate" ? revalidate : invalidate;
      return null;
    }

    let seen: { data: string[] | undefined; isLoading: boolean } = {
      data: undefined,
      isLoading: true,
    };
    let sweep: (...scopes: string[]) => Promise<void> = async () => {};

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Probe />
      </SWRConfig>,
    );

    return {
      get seen() {
        return seen;
      },
      get sweep() {
        return sweep;
      },
      settle: (rows: string[]) => act(async () => resolveFetch(rows)),
    };
  }

  it("keeps the previous answer on screen while it refetches", async () => {
    const probe = renderProbe("revalidate");
    await probe.settle(["a", "b"]);
    expect(probe.seen.data).toEqual(["a", "b"]);

    await act(async () => {
      void probe.sweep(SCOPE);
    });

    // **The assertion the bug report reduces to.** A list mid-refetch still has rows, so
    // a screen gating on `isLoading` keeps rendering them instead of its skeleton.
    expect(probe.seen.data).toEqual(["a", "b"]);
    expect(probe.seen.isLoading).toBe(false);
  });

  it("useInvalidate still empties the entry, which is why it is not the default here", async () => {
    // Twenty-two features call it, fourteen of them untested Operations Hub screens, so
    // its behaviour stays and new code opts out instead. This pins that choice rather
    // than assuming it.
    const probe = renderProbe("invalidate");
    await probe.settle(["a", "b"]);
    expect(probe.seen.data).toEqual(["a", "b"]);

    await act(async () => {
      void probe.sweep(SCOPE);
    });

    expect(probe.seen.data).toBeUndefined();
  });
});
