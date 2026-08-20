import type { Influencer, InfluencerPlatform } from "@brandfactory/shared";
import { InfluencerPlatformSchema } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  parseReachSortKey,
  reachColumnsFor,
  reachOn,
  reachSortKey,
  reachTableMinWidth,
} from "./reach-columns";
import { parseSort, sortInfluencers } from "./sort";

const NOW = "2026-08-19T00:00:00.000Z";

function creator(
  name: string,
  accounts: { platform: InfluencerPlatform; followers: number }[],
): Influencer {
  return {
    id: `i-${name}`,
    workspaceId: "w-1",
    slug: name.toLowerCase(),
    name,
    accounts: accounts.map((a, index) => ({
      platform: a.platform,
      handle: `${name.toLowerCase()}${index}`,
      followers: a.followers,
      engagementRate: null,
      url: null,
    })),
    vertical: null,
    brandIds: [],
    status: "prospect",
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    // Through `unknown` because the ids are branded strings; minting real ones would test the
    // brand rather than the functions below.
  } as unknown as Influencer;
}

describe("reachOn", () => {
  it("returns the followers on that platform", () => {
    const rows = creator("A", [
      { platform: "instagram", followers: 500 },
      { platform: "tiktok", followers: 300 },
    ]).accounts;
    expect(reachOn(rows, "instagram")).toBe(500);
    expect(reachOn(rows, "tiktok")).toBe(300);
  });

  it("sums two accounts on one platform", () => {
    // Three Instagram accounts is a real creator, and `totalReach` sums them for the same reason.
    const rows = creator("A", [
      { platform: "instagram", followers: 500 },
      { platform: "instagram", followers: 250 },
    ]).accounts;
    expect(reachOn(rows, "instagram")).toBe(750);
  });

  it("returns null — never zero — for a platform the creator is not on", () => {
    // **The decision the whole feature turns on.** A creator with no TikTok has no TikTok reach;
    // one with a TikTok showing zero followers has a reading of zero.
    const rows = creator("A", [{ platform: "instagram", followers: 500 }]).accounts;
    expect(reachOn(rows, "tiktok")).toBeNull();
  });

  it("keeps a real zero as a zero", () => {
    const rows = creator("A", [{ platform: "tiktok", followers: 0 }]).accounts;
    expect(reachOn(rows, "tiktok")).toBe(0);
  });
});

describe("reachColumnsFor", () => {
  const ROSTER = [
    creator("A", [
      { platform: "tiktok", followers: 10 },
      { platform: "instagram", followers: 20 },
    ]),
    creator("B", [{ platform: "xiaohongshu", followers: 30 }]),
  ];

  it("returns only the platforms present", () => {
    // The plan budgeted for "up to seven numeric columns"; the real roster uses three.
    expect(reachColumnsFor(ROSTER)).toEqual(["instagram", "tiktok", "xiaohongshu"]);
  });

  it("returns them in enum order, never in the order they were found", () => {
    // Frequency or discovery order would re-arrange the *columns* every time a filter changed,
    // which is a table whose shape moves under the reader.
    const order = reachColumnsFor(ROSTER);
    const enumOrder = InfluencerPlatformSchema.options.filter((p) => order.includes(p));
    expect(order).toEqual(enumOrder);
  });

  it("narrows with the filtered set", () => {
    expect(reachColumnsFor([ROSTER[1]!])).toEqual(["xiaohongshu"]);
  });

  it("returns nothing for an empty list", () => {
    expect(reachColumnsFor([])).toEqual([]);
  });

  it("does not repeat a platform two creators share", () => {
    expect(reachColumnsFor([ROSTER[0]!, ROSTER[0]!])).toEqual(["instagram", "tiktok"]);
  });
});

describe("reachSortKey / parseReachSortKey", () => {
  it("round-trips every platform in the enum", () => {
    for (const platform of InfluencerPlatformSchema.options) {
      expect(parseReachSortKey(reachSortKey(platform))).toBe(platform);
    }
  });

  it("refuses a platform outside the enum", () => {
    // A hand-edited `?sort=reach:myspace` falls to no sort rather than to a column that does not
    // exist.
    expect(parseReachSortKey("reach:myspace")).toBeNull();
  });

  it("refuses a key that is not a reach key at all", () => {
    expect(parseReachSortKey("name")).toBeNull();
    expect(parseReachSortKey("reach")).toBeNull();
    expect(parseReachSortKey(undefined)).toBeNull();
  });
});

describe("parseSort with a platform key", () => {
  it("accepts one, so a shared link keeps the order it was shared to show", () => {
    expect(parseSort("reach:instagram", "desc")).toEqual({
      key: "reach:instagram",
      direction: "desc",
    });
  });

  it("still refuses a platform outside the enum", () => {
    expect(parseSort("reach:myspace", "asc")).toBeNull();
  });

  it("still accepts the eight base columns", () => {
    expect(parseSort("name", "asc")).toEqual({ key: "name", direction: "asc" });
  });
});

describe("sortInfluencers by one platform", () => {
  const ROSTER = [
    creator("OnlyIg", [{ platform: "instagram", followers: 900 }]),
    creator("Both", [
      { platform: "instagram", followers: 100 },
      { platform: "tiktok", followers: 500 },
    ]),
    creator("OnlyTt", [{ platform: "tiktok", followers: 700 }]),
  ];

  it("orders by that platform's followers", () => {
    const sorted = sortInfluencers(ROSTER, { key: "reach:tiktok", direction: "desc" });
    expect(sorted.slice(0, 2).map((i) => i.name)).toEqual(["OnlyTt", "Both"]);
  });

  it("sorts a creator who is not on the platform last in BOTH directions", () => {
    // Inherited from the comparator's `null` handling rather than special-cased, which is the
    // whole reason `reachOn` returns `null` instead of `0`. A `0` would sort a roster's
    // Instagram-only creators into the middle of the TikTok column.
    for (const direction of ["asc", "desc"] as const) {
      const sorted = sortInfluencers(ROSTER, { key: "reach:tiktok", direction });
      expect(sorted.at(-1)?.name, direction).toBe("OnlyIg");
    }
  });

  it("is not the same order as the total", () => {
    // The point of the column: `OnlyIg` is the biggest creator overall and the smallest on TikTok.
    const byTotal = sortInfluencers(ROSTER, { key: "reach", direction: "desc" });
    const byTikTok = sortInfluencers(ROSTER, { key: "reach:tiktok", direction: "desc" });
    expect(byTotal[0]?.name).toBe("OnlyIg");
    expect(byTikTok[0]?.name).toBe("OnlyTt");
  });
});

describe("reachTableMinWidth", () => {
  it("widens with the column count", () => {
    // The count passed is the platforms; the map is keyed by platforms + the total.
    expect(reachTableMinWidth(1)).toBe("min-w-[60rem]");
    expect(reachTableMinWidth(3)).toBe("min-w-[76rem]");
    expect(reachTableMinWidth(6)).toBe("min-w-[100rem]");
  });

  it("returns a literal class, never an interpolated one", () => {
    // Tailwind scans source for complete class strings; an interpolated `min-w-[${n}rem]` emits
    // no CSS at all and the class does nothing. Three files in this repo record that trap.
    for (let count = 0; count <= 8; count += 1) {
      expect(reachTableMinWidth(count)).toMatch(/^min-w-\[\d+rem\]$/);
    }
  });

  it("falls back to the widest for a count past the enum", () => {
    expect(reachTableMinWidth(99)).toBe("min-w-[100rem]");
  });
});
