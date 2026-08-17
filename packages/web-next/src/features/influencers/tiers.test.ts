import { describe, expect, it } from "vitest";

import { GROUP_RAILS } from "@/components/layout/group-rail";

import { railForTier, REACH_TIERS, tierFor } from "./tiers";

/**
 * The tier ladder is the Influencers table's grouping, and it is **derived** — so unlike the
 * vendor grouping it replaced, it is pure logic and this is exactly the kind of thing AGENTS.md
 * says belongs in a test rather than in a browser pass.
 *
 * What is worth asserting is the two properties the screen relies on and neither the compiler
 * nor a rendered page can show: that the grouping is **total** (every count lands in a tier),
 * and that the boundaries are where they are claimed to be. A band that silently swallowed
 * 100,000 into Micro would look completely correct on screen.
 */
describe("tierFor", () => {
  it("is total — every non-negative count lands in a tier", () => {
    for (const followers of [0, 1, 999, 1_000, 9_999, 10_000, 250_000, 12_000_000]) {
      expect(tierFor(followers), `${followers} followers`).toBeDefined();
    }
  });

  // Each boundary twice: the first count *in* the tier, and the last count below it. A
  // one-sided assertion passes against `>` where `>=` was meant, which is the whole class of
  // mistake a threshold list invites.
  it.each([
    [0, "nano"],
    [9_999, "nano"],
    [10_000, "micro"],
    [99_999, "micro"],
    [100_000, "mid"],
    [499_999, "mid"],
    [500_000, "macro"],
    [999_999, "macro"],
    [1_000_000, "mega"],
    [8_400_000, "mega"],
  ])("puts %i followers in %s", (followers, id) => {
    expect(tierFor(followers).id).toBe(id);
  });

  it("falls to nano on a negative count rather than returning nothing", () => {
    // Not reachable from the fixture, and a data fault rather than a reading — but the
    // function's return type promises a tier, so the promise is checked.
    expect(tierFor(-1).id).toBe("nano");
  });

  it("orders the ladder largest first", () => {
    const mins = REACH_TIERS.map((tier) => tier.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });
});

describe("railForTier", () => {
  it("gives every tier its own rail, by position", () => {
    const rails = REACH_TIERS.map((tier) => railForTier(tier));
    expect(new Set(rails).size).toBe(REACH_TIERS.length);
    expect(rails[0]).toBe(GROUP_RAILS[0]);
  });

  it("has enough rails for the ladder", () => {
    // The guard that fails loudly if a sixth tier is added and `GROUP_RAILS` is not grown with
    // it: `railForTier` would return `undefined` and every band would lose its colour, which
    // renders as a plain table rather than as an error.
    expect(GROUP_RAILS.length).toBeGreaterThanOrEqual(REACH_TIERS.length);
  });
});
