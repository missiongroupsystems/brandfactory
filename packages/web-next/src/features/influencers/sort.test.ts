import type { Influencer, InfluencerAccount } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { nextSort, parseSort, SORT_KEYS, sortInfluencers, type SortKey } from "./sort";

/**
 * The order a click on a heading produces.
 *
 * Worth asserting rather than clicking, on AGENTS.md' own test — it is the logic that is
 * invisible in a browser pass until the day it is wrong. Three properties in particular:
 * unmeasured engagement sorting last in *both* directions, ties falling back to the server's
 * order so a three-value column still produces a stable table, and the cycle returning to `null`
 * rather than wrapping to ascending.
 */

let counter = 0;

/**
 * One account. The record is smaller than the table it came from — the schema keeps `platform`,
 * `handle`, `followers`, `engagementRate` and `url`, and nothing else — so a fixture that
 * invented ids would be asserting against a shape the app does not have.
 */
function account(followers: number, engagementRate: number | null = null): InfluencerAccount {
  counter += 1;
  return {
    platform: "instagram",
    handle: `handle${counter}`,
    followers,
    engagementRate,
    url: null,
  };
}

function creator(fields: {
  name: string;
  accounts?: InfluencerAccount[];
  vertical?: Influencer["vertical"];
  status?: Influencer["status"];
  brandIds?: string[];
}): Influencer {
  counter += 1;
  return {
    id: `influencer-${counter}`,
    workspaceId: "workspace",
    slug: fields.name.toLowerCase().replaceAll(" ", "-"),
    name: fields.name,
    vertical: fields.vertical ?? null,
    status: fields.status ?? "prospect",
    notes: null,
    brandIds: fields.brandIds ?? [],
    accounts: fields.accounts ?? [account(1_000)],
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    // The branded ids (`InfluencerId`, `WorkspaceId`, `BrandId`) are what this cast is for: a
    // fixture minting real ones would need the schemas' own parsers, and none of the orderings
    // under test reads an id except through `byInfluencerReach`'s final tiebreak.
  } as unknown as Influencer;
}

const names = (list: readonly Influencer[]) => list.map((influencer) => influencer.name);

describe("parseSort", () => {
  it("reads a column and a direction out of the URL", () => {
    expect(parseSort("reach", "desc")).toEqual({ key: "reach", direction: "desc" });
  });

  /** A hand-typed `?sort=name` is a reasonable thing for somebody to write, and ascending is the
   *  state the first click produces — so it sorts rather than being ignored. */
  it("falls to ascending when the direction is missing or unrecognised", () => {
    expect(parseSort("name", undefined)).toEqual({ key: "name", direction: "asc" });
    expect(parseSort("name", "sideways")).toEqual({ key: "name", direction: "asc" });
  });

  it("refuses a column this release does not have", () => {
    expect(parseSort("followers", "asc")).toBeNull();
    expect(parseSort(undefined, "asc")).toBeNull();
    expect(parseSort("", "asc")).toBeNull();
  });

  it("accepts every column the table renders", () => {
    for (const key of SORT_KEYS) {
      expect(parseSort(key, "asc")).toEqual({ key, direction: "asc" });
    }
  });
});

describe("nextSort", () => {
  it("cycles ascending, descending, then off", () => {
    const first = nextSort(null, "name");
    expect(first).toEqual({ key: "name", direction: "asc" });

    const second = nextSort(first, "name");
    expect(second).toEqual({ key: "name", direction: "desc" });

    // Off, and not back to ascending: "off" is the server's reach order, which is what the screen
    // opens in and what the tier bands are built on. A two-state toggle would strand the reader
    // away from it.
    expect(nextSort(second, "name")).toBeNull();
  });

  it("starts a different column at ascending whatever the last one was pointing at", () => {
    expect(nextSort({ key: "reach", direction: "desc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
  });
});

describe("sortInfluencers", () => {
  it("hands back the server's order when nothing is sorted", () => {
    const list = [creator({ name: "Bea" }), creator({ name: "Ada" })];
    expect(names(sortInfluencers(list, null))).toEqual(["Bea", "Ada"]);
  });

  it("does not sort the array it is given", () => {
    const list = [creator({ name: "Bea" }), creator({ name: "Ada" })];
    sortInfluencers(list, { key: "name", direction: "asc" });
    // The caller's array is SWR's cached data behind a `useMemo`; reordering it in place would
    // reorder it for every other consumer.
    expect(names(list)).toEqual(["Bea", "Ada"]);
  });

  it("sorts names A→Z and back", () => {
    const list = [creator({ name: "Cara" }), creator({ name: "Ada" }), creator({ name: "Bea" })];
    expect(names(sortInfluencers(list, { key: "name", direction: "asc" }))).toEqual([
      "Ada",
      "Bea",
      "Cara",
    ]);
    expect(names(sortInfluencers(list, { key: "name", direction: "desc" }))).toEqual([
      "Cara",
      "Bea",
      "Ada",
    ]);
  });

  /** This roster is full of accented names, and a code-point comparison would file `Ángel` after
   *  `Zara` — which is not what a reader clicking A→Z is promised. */
  it("files an accented name with its letter rather than after Z", () => {
    const list = [creator({ name: "Zara" }), creator({ name: "Ángel" })];
    expect(names(sortInfluencers(list, { key: "name", direction: "asc" }))).toEqual([
      "Ángel",
      "Zara",
    ]);
  });

  it("sorts reach as the sum of the accounts, not as any one of them", () => {
    const split = creator({ name: "Split", accounts: [account(534_000), account(981_600)] });
    const single = creator({ name: "Single", accounts: [account(900_000)] });
    // 1.52M against 900k. Neither of Split's accounts clears Single on its own, which is the
    // whole argument `influencer_accounts` was built on.
    expect(names(sortInfluencers([single, split], { key: "reach", direction: "desc" }))).toEqual([
      "Split",
      "Single",
    ]);
  });

  it("sorts the set-valued columns by how many", () => {
    const many = creator({
      name: "Many",
      accounts: [account(10), account(20), account(30)],
      brandIds: ["brand-1", "brand-2"],
    });
    const few = creator({ name: "Few", accounts: [account(10)], brandIds: [] });

    // Platforms is deduplicated by `platformsOf`, so three accounts on one platform is one
    // platform — the number the cell prints, which is the number that sorts.
    expect(names(sortInfluencers([many, few], { key: "platforms", direction: "asc" }))).toEqual([
      "Many",
      "Few",
    ]);
    expect(names(sortInfluencers([few, many], { key: "brands", direction: "desc" }))).toEqual([
      "Many",
      "Few",
    ]);
  });

  describe("unmeasured engagement", () => {
    const measured = creator({ name: "Measured", accounts: [account(1_000, 3.2)] });
    const better = creator({ name: "Better", accounts: [account(1_000, 8.4)] });
    const unmeasured = creator({ name: "Unmeasured", accounts: [account(1_000, null)] });
    const list = [unmeasured, better, measured];

    /**
     * `null` is not a small number. The Curly's roster measures nobody, so this is the state most
     * of the table is in — and sorting those creators to the top of an ascending list would say
     * they have the *worst* engagement, which is a claim nobody has made.
     */
    it("sorts last ascending", () => {
      expect(names(sortInfluencers(list, { key: "engagement", direction: "asc" }))).toEqual([
        "Measured",
        "Better",
        "Unmeasured",
      ]);
    });

    it("sorts last descending too", () => {
      expect(names(sortInfluencers(list, { key: "engagement", direction: "desc" }))).toEqual([
        "Better",
        "Measured",
        "Unmeasured",
      ]);
    });
  });

  /**
   * Status has three values across 146 rows, so nearly every comparison is a tie. Without a
   * tiebreak the rows inside one status would be in whatever order `Array.sort` left them, which
   * changes with the filters — a table that reshuffles under a reader who narrowed it.
   */
  it("breaks ties on the server's own order: reach descending, then name", () => {
    const list = [
      creator({ name: "Small", status: "active", accounts: [account(1_000)] }),
      creator({ name: "Large", status: "active", accounts: [account(900_000)] }),
      creator({ name: "Middle", status: "active", accounts: [account(50_000)] }),
    ];
    expect(names(sortInfluencers(list, { key: "status", direction: "asc" }))).toEqual([
      "Large",
      "Middle",
      "Small",
    ]);
  });

  it("orders a generalist by the word the column prints", () => {
    const generalist = creator({ name: "Nobody", vertical: null });
    const beauty = creator({ name: "Somebody", vertical: "beauty" });
    // `Beauty` before `Generalist`, which is the alphabet the reader is looking at rather than
    // the `null` behind the cell.
    expect(names(sortInfluencers([generalist, beauty], { key: "vertical", direction: "asc" }))).toEqual(
      ["Somebody", "Nobody"],
    );
  });

  it("puts the tiers in ladder order rather than alphabetical order", () => {
    const mega = creator({ name: "Mega", accounts: [account(2_000_000)] });
    const micro = creator({ name: "Micro", accounts: [account(50_000)] });
    // `Mega` before `Micro` alphabetically is the one ordering of these words that means nothing,
    // so the column sorts by the band's floor.
    expect(names(sortInfluencers([mega, micro], { key: "tier", direction: "asc" }))).toEqual([
      "Micro",
      "Mega",
    ]);
  });

  /** Every column has to produce a total order, or a table reshuffles rows the reader believes
   *  are settled. Each key is run over the same list twice and asserted identical. */
  it.each(SORT_KEYS)("is deterministic on %s", (key: SortKey) => {
    const list = [
      creator({ name: "Ada", status: "active", accounts: [account(1_000, 2)] }),
      creator({ name: "Bea", status: "prospect", accounts: [account(1_000)] }),
      creator({ name: "Cara", status: "past", accounts: [account(1_000, 2)] }),
    ];
    const once = names(sortInfluencers(list, { key, direction: "asc" }));
    const twice = names(sortInfluencers([...list].reverse(), { key, direction: "asc" }));
    expect(once).toEqual(twice);
  });
});
