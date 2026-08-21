import type { InfluencerAccount } from "@brandfactory/shared";
import { InfluencerPlatformSchema, platformsOf } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { MAX_PLATFORM_BADGES, profileUrlOn, visiblePlatforms } from "./platforms";

/** The least an account has to be for `platformsOf` to read it. */
function account(
  platform: InfluencerAccount["platform"],
  handle: string,
  url: string | null = null,
): InfluencerAccount {
  return { platform, handle, url, followers: 1_000, engagementRate: null };
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

describe("profileUrlOn", () => {
  it("answers the URL stored against that platform", () => {
    const accounts = [
      account("instagram", "jamiechua", "https://instagram.com/jamiechua"),
      account("tiktok", "jamiechua", "https://tiktok.com/@jamiechua"),
    ];
    expect(profileUrlOn(accounts, "instagram")).toBe("https://instagram.com/jamiechua");
    expect(profileUrlOn(accounts, "tiktok")).toBe("https://tiktok.com/@jamiechua");
  });

  it("answers null for a platform the creator is not on", () => {
    expect(profileUrlOn([account("instagram", "jamiechua", "https://ig.test/j")], "youtube")).toBe(
      null,
    );
  });

  it("derives one from the handle where the record holds none", () => {
    // The reversal this release makes, asserted on the surface it was made for. Until now this
    // answered `null` — correctly, on the rule `InfluencerAccountSchema.url` used to state — and
    // the roster it shipped against holds `url: null` on 215 of its 216 accounts, so one badge out
    // of 146 rows was a link. `accountProfileUrl` in `@brandfactory/shared` owns the argument and
    // the templates; what this pins is that the roster's cell actually reads it.
    expect(profileUrlOn([account("instagram", "jamiechua")], "instagram")).toBe(
      "https://instagram.com/jamiechua",
    );
  });

  it("still derives nothing for xiaohongshu", () => {
    // The one refusal that survives, and the reason the cell can be trusted at all: XHS addresses
    // users by an opaque numeric id, so a templated link there is not a wrong profile — it is not
    // a profile. This is the assertion that fails the day somebody completes the table.
    expect(profileUrlOn([account("xiaohongshu", "novitalam")], "xiaohongshu")).toBe(null);
  });

  it("derives nothing from a handle that is really a name", () => {
    // `InfluencerHandleSchema` accepts this — handle grammar differs per platform and xiaohongshu
    // handles are not latin at all — so the guard against templating it lives one layer down. A
    // handle with a space in it is a name somebody typed into the wrong box.
    expect(profileUrlOn([account("instagram", "Jamie Chua")], "instagram")).toBe(null);
  });

  it("prefers a stored URL to the one it would derive for the same account", () => {
    // Derivation is a fallback and never an override. The stored value was checked by somebody or
    // grounded by the quick-add lookup against a page it read; the template is a guess over a
    // string, and it must not win.
    expect(
      profileUrlOn([account("instagram", "jamiechua", "https://www.instagram.com/ec24m")], "instagram"),
    ).toBe("https://www.instagram.com/ec24m");
  });

  it("takes the first account carrying a URL, in list order", () => {
    // Three Instagram accounts is a real creator and one badge stands for all of them, so one URL
    // has to win. Position order wins — position 0 is the account the creator is known by — and
    // never the largest follower count, which an import can change under the link.
    const accounts = [
      account("instagram", "jamiechua", "https://ig.test/primary"),
      account("instagram", "jamiechua.eats", "https://ig.test/second"),
    ];
    expect(profileUrlOn(accounts, "instagram")).toBe("https://ig.test/primary");
  });

  it("skips an account that answers nothing rather than stopping at it", () => {
    // A primary the badge cannot address and a second account it can still gives the badge
    // somewhere to go. A `.find()` on the platform alone would answer `null` here and refuse a
    // link the record actually holds.
    //
    // **On xiaohongshu, because it is the platform where "answers nothing" is still reachable.**
    // The five templatable platforms answer for any ordinary handle now, so an Instagram pair
    // would exercise the fallback rather than the skip — and the test would pass whether or not
    // the loop continued.
    const accounts = [
      account("xiaohongshu", "novitalam"),
      account("xiaohongshu", "novita.lam", "https://xhslink.test/second"),
    ];
    expect(profileUrlOn(accounts, "xiaohongshu")).toBe("https://xhslink.test/second");
  });
});
