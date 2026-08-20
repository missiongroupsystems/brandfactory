import type { Influencer, InfluencerPlatform, LookupInfluencerResult } from "@brandfactory/shared";
import { CreateInfluencerInputSchema, LOOKUP_PLATFORMS } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  findHandleHolder,
  handleError,
  type QuickAddDraft,
  quickAddDraftFrom,
  quickAddEvidenceFrom,
  toAccountDraft,
  toCreateInput,
} from "./lookup";

const NOW = "2026-08-19T00:00:00.000Z";

function influencer(
  name: string,
  accounts: { platform: InfluencerPlatform; handle: string }[],
): Influencer {
  return {
    id: `i-${name}`,
    workspaceId: "w-1",
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    accounts: accounts.map((a) => ({
      platform: a.platform,
      handle: a.handle,
      followers: 1000,
      engagementRate: null,
      url: null,
    })),
    vertical: null,
    brandIds: [],
    status: "prospect",
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    // Through `unknown` because `InfluencerId` and `WorkspaceId` are branded strings: a plain
    // literal does not overlap them, and minting real ones here would test the brand rather than
    // the functions below.
  } as unknown as Influencer;
}

const ROSTER = [
  influencer("Lennard Yeong", [
    { platform: "instagram", handle: "lennardy" },
    { platform: "tiktok", handle: "lennardy" },
  ]),
  influencer("Novita Lam", [{ platform: "instagram", handle: "novitalam" }]),
];

describe("findHandleHolder", () => {
  it("finds the creator holding a handle on that platform", () => {
    expect(findHandleHolder(ROSTER, "instagram", "novitalam")?.name).toBe("Novita Lam");
  });

  it("is not fooled by the same handle on a different platform", () => {
    // The unique key is (platform, handle), so one handle on two platforms is two accounts —
    // and here they happen to be the same person, which is exactly the case a platform-blind
    // check would get right by accident.
    expect(findHandleHolder(ROSTER, "youtube", "lennardy")).toBeNull();
  });

  it("searches every account, not only the primary", () => {
    // A creator's second account is still their handle, and the unique index covers it.
    expect(findHandleHolder(ROSTER, "tiktok", "lennardy")?.name).toBe("Lennard Yeong");
  });

  it("compares case-insensitively, which is looser than the database on purpose", () => {
    // A false positive costs one sentence naming a creator you can go and look at; a false
    // negative costs a paid call and a duplicate that reads as one person entered twice.
    expect(findHandleHolder(ROSTER, "instagram", "NovitaLam")?.name).toBe("Novita Lam");
    expect(findHandleHolder(ROSTER, "instagram", "  novitalam  ")?.name).toBe("Novita Lam");
  });

  it("returns null for an empty handle rather than matching the first row", () => {
    expect(findHandleHolder(ROSTER, "instagram", "")).toBeNull();
    expect(findHandleHolder(ROSTER, "instagram", "   ")).toBeNull();
  });

  it("returns null on an empty roster", () => {
    expect(findHandleHolder([], "instagram", "novitalam")).toBeNull();
  });
});

describe("handleError", () => {
  it("accepts an ordinary handle", () => {
    expect(handleError("novitalam")).toBeNull();
  });

  it("refuses a leading @ rather than stripping it", () => {
    // The schema's own decision: stripping admits two spellings of one handle into a table whose
    // unique key treats them as different, and into a duplicate check that is a string compare.
    expect(handleError("@novitalam")).toMatch(/@/);
  });

  it("refuses an empty handle", () => {
    expect(handleError("")).not.toBeNull();
  });
});

describe("quickAddDraftFrom", () => {
  const result: Pick<LookupInfluencerResult, "draft"> = {
    draft: {
      name: "Lennard Yeong",
      vertical: "food",
      accounts: [
        {
          platform: "instagram",
          handle: "lennardy",
          followers: 570_000,
          engagementRate: null,
          url: "https://www.instagram.com/lennardy/",
          sourceUrl: "https://www.instagram.com/lennardy/",
        },
      ],
    },
  };

  it("fills the form from a good draft", () => {
    const draft = quickAddDraftFrom("instagram", "lennardy", result);
    expect(draft).toEqual({
      platform: "instagram",
      handle: "lennardy",
      name: "Lennard Yeong",
      followers: "570000",
      vertical: "food",
      url: "https://www.instagram.com/lennardy/",
    });
  });

  it("holds the follower count as a string", () => {
    // `AccountDraft`'s rule for `AccountDraft`'s reason: `Number("")` is `0`, so a numeric draft
    // would launder an untouched box into a creator entered on zero followers.
    expect(typeof quickAddDraftFrom("instagram", "lennardy", result).followers).toBe("string");
  });

  it("leaves an unfound follower count visibly empty, never zero", () => {
    const draft = quickAddDraftFrom("instagram", "x", {
      draft: {
        name: "Somebody",
        vertical: null,
        accounts: [
          {
            platform: "instagram",
            handle: "x",
            followers: null,
            engagementRate: null,
            url: null,
            sourceUrl: null,
          },
        ],
      },
    });
    expect(draft.followers).toBe("");
    expect(draft.name).toBe("Somebody");
  });

  it("produces a usable draft from a not-found result, so nothing typed is lost", () => {
    const draft = quickAddDraftFrom("tiktok", "  thepantryboy  ", { draft: null });
    expect(draft).toEqual({
      platform: "tiktok",
      handle: "thepantryboy",
      name: "",
      followers: "",
      vertical: "",
      url: "",
    });
  });

  it("takes the platform and handle from what was typed, not from the draft", () => {
    // The engine already refuses an account that is not the one asked about, so the two agree —
    // and if they ever stop agreeing, the field the person filled in is the one to believe.
    const draft = quickAddDraftFrom("instagram", "lennardy", {
      draft: {
        name: "Someone Else",
        vertical: null,
        accounts: [
          {
            platform: "tiktok",
            handle: "different",
            followers: 10,
            engagementRate: null,
            url: null,
            sourceUrl: null,
          },
        ],
      },
    });
    expect(draft.platform).toBe("instagram");
    expect(draft.handle).toBe("lennardy");
  });

  it("works with no result at all", () => {
    expect(quickAddDraftFrom("instagram", "nobody").name).toBe("");
  });
});

describe("quickAddEvidenceFrom", () => {
  it("carries the found map and the follower source", () => {
    const evidence = quickAddEvidenceFrom({
      outcome: "ok",
      draft: {
        name: "N",
        vertical: null,
        accounts: [
          {
            platform: "instagram",
            handle: "n",
            followers: 5,
            engagementRate: null,
            url: null,
            sourceUrl: "https://example.com/n",
          },
        ],
      },
      found: { name: true, followers: true, vertical: false, url: false },
      sources: [],
    });
    expect(evidence.found.vertical).toBe(false);
    expect(evidence.followersSource).toBe("https://example.com/n");
  });

  it("carries the retrieval log through, because the sheet renders it", () => {
    // The one thing on the review screen a model cannot write. It was on the wire
    // and reaching no surface until the hardening pass.
    const sources = [{ title: "lennardy on Instagram", url: "https://www.instagram.com/lennardy/" }];
    const evidence = quickAddEvidenceFrom({
      outcome: "ok",
      draft: null,
      found: { name: false, followers: false, vertical: false, url: false },
      sources,
    });
    expect(evidence.sources).toEqual(sources);
  });

  it("reports an empty retrieval log as empty, which is what a lost :online suffix looks like", () => {
    const evidence = quickAddEvidenceFrom({
      outcome: "not-found",
      draft: null,
      found: { name: false, followers: false, vertical: false, url: false },
      sources: [],
    });
    expect(evidence.sources).toEqual([]);
  });

  it("reports no source when there is no draft", () => {
    const evidence = quickAddEvidenceFrom({
      outcome: "not-found",
      draft: null,
      found: { name: false, followers: false, vertical: false, url: false },
      sources: [],
    });
    expect(evidence.followersSource).toBeNull();
  });
});

describe("toCreateInput", () => {
  const draft: QuickAddDraft = {
    platform: "instagram",
    handle: "lennardy",
    name: "Lennard Yeong",
    followers: "570000",
    vertical: "food",
    url: "https://www.instagram.com/lennardy/",
  };

  it("produces a body the create route's own schema accepts", () => {
    // The point of the whole feature: quick add invents no write path, so every rule the create
    // already enforces applies unchanged.
    expect(CreateInfluencerInputSchema.safeParse(toCreateInput(draft)).success).toBe(true);
  });

  it("writes one account, from the platform and handle that were typed", () => {
    const input = toCreateInput(draft);
    expect(input.accounts).toHaveLength(1);
    expect(input.accounts[0]).toMatchObject({
      platform: "instagram",
      handle: "lennardy",
      followers: 570_000,
      url: "https://www.instagram.com/lennardy/",
    });
  });

  it("never carries an engagement rate", () => {
    // No platform publishes one, so a figure here was computed from a sample or invented. The
    // engine drops it and this does not put one back.
    expect(toCreateInput(draft).accounts[0]?.engagementRate).toBeNull();
  });

  it("defaults the status to prospect, never active", () => {
    expect(toCreateInput(draft).status).toBe("prospect");
  });

  it("sends no brands and no notes", () => {
    const input = toCreateInput(draft) as Record<string, unknown>;
    expect(input.brandIds).toBeUndefined();
    expect(input.notes).toBeUndefined();
  });

  it("turns an empty follower box into NaN, so the schema refuses it by name", () => {
    // Tested *before* the conversion, because `Number("")` is `0` — testing after would launder
    // an untouched box into a creator filed in Nano who looks like a real reading.
    const input = toCreateInput({ ...draft, followers: "" });
    expect(Number.isNaN(input.accounts[0]?.followers)).toBe(true);
    expect(CreateInfluencerInputSchema.safeParse(input).success).toBe(false);
  });

  it("turns a whitespace-only follower box into NaN too", () => {
    expect(Number.isNaN(toCreateInput({ ...draft, followers: "   " }).accounts[0]?.followers)).toBe(
      true,
    );
  });

  it("turns an empty URL into null rather than an empty string", () => {
    // `""` is truthy, sorts before every real value, and renders as an empty link.
    expect(toCreateInput({ ...draft, url: "  " }).accounts[0]?.url).toBeNull();
  });

  it("maps the generalist option to a null vertical", () => {
    expect(toCreateInput({ ...draft, vertical: "" }).vertical).toBeNull();
  });

  it("trims the name and the handle", () => {
    const input = toCreateInput({ ...draft, name: "  Lennard Yeong  ", handle: " lennardy " });
    expect(input.name).toBe("Lennard Yeong");
    expect(input.accounts[0]?.handle).toBe("lennardy");
  });

  it("builds an acceptable body for every platform quick add offers", () => {
    for (const platform of LOOKUP_PLATFORMS) {
      const input = toCreateInput({ ...draft, platform });
      expect(CreateInfluencerInputSchema.safeParse(input).success, platform).toBe(true);
    }
  });
});

describe("toAccountDraft", () => {
  it("hands the full form what was typed, so no keystroke is lost", () => {
    expect(
      toAccountDraft({
        platform: "tiktok",
        handle: " thepantryboy ",
        name: "Daren Teo",
        followers: " 248800 ",
        vertical: "food",
        url: " https://www.tiktok.com/@thepantryboy ",
      }),
    ).toEqual({
      platform: "tiktok",
      handle: "thepantryboy",
      followers: "248800",
      engagementRate: "",
      url: "https://www.tiktok.com/@thepantryboy",
    });
  });

  it("carries an empty follower count across as empty", () => {
    // The whole point of the `not-found` handoff: the form opens with the boxes the person still
    // has to fill, not with zeros they might accept.
    const account = toAccountDraft({
      platform: "instagram",
      handle: "nobody",
      name: "",
      followers: "",
      vertical: "",
      url: "",
    });
    expect(account.followers).toBe("");
    expect(account.url).toBe("");
  });
});
