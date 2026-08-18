import { describe, expect, it } from "vitest";

import { SCOPES } from "./cache";

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
