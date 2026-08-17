import { describe, expect, it } from "vitest";

import type { Brand } from "@/lib/api/types";

import { resolveBrandNames } from "./brand-names-cell";

/**
 * The screens are not tested here (see `AGENTS.md`), and this is not a screen: it is the rule
 * that a name absent from a cached index is a **pending request and never a missing fact**,
 * which is invisible in a browser pass on any day the index happens to have arrived. The
 * contracts table got it wrong once before, and the vendors table now depends on the same
 * function.
 */
function brand(id: string, name: string): Brand {
  return { id, name } as Brand;
}

const index = new Map<string, Brand>([
  ["b1", brand("b1", "Harbour Table")],
  ["b2", brand("b2", "Ember & Oak")],
]);

describe("resolveBrandNames", () => {
  it("sorts the names and drops the duplicates two agreements can carry", () => {
    expect(resolveBrandNames(["b1", "b2", "b1"], index)).toEqual({
      names: ["Ember & Oak", "Harbour Table"],
      pending: false,
    });
  });

  it("reports the whole cell pending when one id has not resolved", () => {
    // Not `names: ["Harbour Table"]` with `pending: false` — a shorter list would state that
    // this row covers one brand, which is a false statement that looks like a true one.
    expect(resolveBrandNames(["b1", "b9"], index)).toEqual({
      names: ["Harbour Table"],
      pending: true,
    });
  });

  it("is neither pending nor named for a row that carries no brand", () => {
    // The caller decides what this means — `Group level` for an agreement, an em dash for a
    // vendor with no live agreement at all — so this function must not claim either.
    expect(resolveBrandNames([], index)).toEqual({ names: [], pending: false });
  });
});
