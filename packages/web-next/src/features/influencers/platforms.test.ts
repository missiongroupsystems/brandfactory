import type { InfluencerAccount } from "@brandfactory/shared";
import { InfluencerPlatformSchema, platformsOf } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { MAX_PLATFORM_BADGES, visiblePlatforms } from "./platforms";

/** The least an account has to be for `platformsOf` to read it. */
function account(platform: InfluencerAccount["platform"], handle: string): InfluencerAccount {
  return { platform, handle, url: null, followers: 1_000, engagementRate: null };
}

describe("visiblePlatforms", () => {
  it("shows everything when there is nothing to collapse", () => {
    const { shown, overflow } = visiblePlatforms(["instagram", "tiktok"]);
    expect(shown).toEqual(["instagram", "tiktok"]);
    expect(overflow).toEqual([]);
  });

  it("holds the boundary: two badges, then the third goes to the overflow", () => {
    // The boundary the cell is drawn against. `MAX_PLATFORM_BADGES` is two, so two platforms is
    // the largest set that renders whole — and three is the smallest that does not.
    const two = visiblePlatforms(["instagram", "tiktok"]);
    expect(two.shown).toHaveLength(MAX_PLATFORM_BADGES);
    expect(two.overflow).toEqual([]);

    const three = visiblePlatforms(["instagram", "tiktok", "youtube"]);
    expect(three.shown).toEqual(["instagram", "tiktok"]);
    expect(three.overflow).toEqual(["youtube"]);
  });

  it("names the overflow rather than counting it, so the tooltip has a list to render", () => {
    const { overflow } = visiblePlatforms([
      "instagram",
      "tiktok",
      "youtube",
      "xiaohongshu",
      "facebook",
      "linkedin",
    ]);
    expect(overflow).toEqual(["youtube", "xiaohongshu", "facebook", "linkedin"]);
  });

  it("sends everything to the overflow rather than slicing from the end", () => {
    // `slice(0, -1)` drops the *last* platform and shows the rest, which is the one way a cap
    // of zero could silently render a wrong cell instead of an empty one.
    expect(visiblePlatforms(["instagram", "tiktok"], 0)).toEqual({
      shown: [],
      overflow: ["instagram", "tiktok"],
    });
    expect(visiblePlatforms(["instagram", "tiktok"], -1)).toEqual({
      shown: [],
      overflow: ["instagram", "tiktok"],
    });
  });

  it("takes a wider cap from a caller with the room for it", () => {
    const { shown, overflow } = visiblePlatforms(["instagram", "tiktok", "youtube", "facebook"], 6);
    expect(shown).toHaveLength(4);
    expect(overflow).toEqual([]);
  });
});

describe("the order the cell renders in", () => {
  it("is the enum's, not the order the accounts were entered", () => {
    // The property the column depends on, pinned end to end rather than assumed: `platformsOf`
    // filters `InfluencerPlatformSchema.options`, so a creator who reorders their accounts gets
    // the same row back. `visiblePlatforms` must not re-sort what it is handed.
    const accounts = [
      account("linkedin", "priya-raman"),
      account("instagram", "priyaskin"),
      account("youtube", "priyaskin"),
      account("tiktok", "priyaskin"),
    ];

    const { shown, overflow } = visiblePlatforms(platformsOf(accounts));

    expect(shown).toEqual(["instagram", "tiktok"]);
    expect(overflow).toEqual(["youtube", "linkedin"]);
  });

  it("collapses two accounts on one platform to one badge", () => {
    // Three Instagram accounts is a real creator. The column is a set of *platforms*, so the
    // duplicate never reaches the cap.
    const accounts = [
      account("instagram", "curlys"),
      account("instagram", "curlys.sg"),
      account("tiktok", "curlys"),
    ];
    expect(visiblePlatforms(platformsOf(accounts)).shown).toEqual(["instagram", "tiktok"]);
  });

  it("covers every platform the enum holds, so no mark is missing a badge", () => {
    // A seventh platform added to the schema fails here first: the cap would hide it silently
    // in the table, and the icon map in `platform-icons.tsx` is typed on the same union.
    expect(InfluencerPlatformSchema.options).toEqual([
      "instagram",
      "tiktok",
      "youtube",
      "xiaohongshu",
      "facebook",
      "linkedin",
    ]);
  });
});
