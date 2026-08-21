import type { Influencer, InfluencerAccount } from "@brandfactory/shared";
import { InfluencerSchema, UpdateInfluencerInputSchema } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { EDITABLE_FIELDS, isUnchanged, patchFor } from "./patch";

/**
 * The seam between a cell somebody typed in and the body that goes on the wire.
 *
 * Everything else about inline editing has to be clicked to be seen. This is the part that is
 * arithmetic, and it holds the rules that are wrong by one character — the `""` that has to become
 * `null`, the comparison that decides whether an edit happened at all, and the promise that a
 * status change writes a status and nothing else.
 *
 * **`name` is not here any more.** The Creator cell stopped being editable from the table, so the
 * branch, the trim rule and the empty-box refusal all left with it. `accounts` arrived in its
 * place, and it is the heaviest thing this file has ever built: a full replacement of a creator's
 * child rows, out of a panel over one cell.
 */

/** The creator's one stored account, so a round trip can be asserted against the record itself. */
const ACCOUNT: InfluencerAccount = {
  platform: "instagram",
  handle: "priyaskin",
  followers: 84_200,
  engagementRate: 3.8,
  url: null,
};

/** A second account on a second platform, for the tests about order. */
const SECOND: InfluencerAccount = {
  platform: "tiktok",
  handle: "priya.skin",
  followers: 12_000,
  engagementRate: null,
  url: null,
};

const creator = (overrides: Record<string, unknown> = {}): Influencer =>
  InfluencerSchema.parse({
    id: "i1",
    workspaceId: "w1",
    slug: "priya-raman",
    name: "Priya Raman",
    accounts: [ACCOUNT],
    vertical: "beauty",
    brandIds: ["b1", "b2"],
    status: "prospect",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

describe("patchFor", () => {
  /**
   * The promise the whole feature rests on, and it is checked over **every** editable field rather
   * than over the one that prompted it. A builder that spread the record and overwrote one key
   * would pass a `{status}` assertion and still send `accounts`, replacing a creator's whole
   * account list on a status change — which is the sheet's behaviour and precisely what an inline
   * edit is supposed to avoid.
   */
  it.each([
    ["vertical", { field: "vertical", value: "food" }],
    ["status", { field: "status", value: "active" }],
    ["brandIds", { field: "brandIds", value: ["b3"] }],
    ["accounts", { field: "accounts", value: [ACCOUNT] }],
  ] as const)("sends %s alone and nothing else", (field, edit) => {
    const patch = patchFor(edit)!;
    expect(Object.keys(patch)).toEqual([field]);
  });

  it("covers every field the table declares editable", () => {
    // A fifth editable column added without a branch here fails the typecheck; a fifth added to
    // the list and forgotten in the switch fails this.
    expect([...EDITABLE_FIELDS].sort()).toEqual(["accounts", "brandIds", "status", "vertical"]);
  });

  it("builds a body the wire schema accepts", () => {
    // The same zod object the route validates with, so this file cannot drift from the server.
    for (const edit of [
      { field: "vertical", value: "" },
      { field: "status", value: "past" },
      { field: "brandIds", value: [] },
      { field: "accounts", value: [ACCOUNT] },
    ] as const) {
      expect(UpdateInfluencerInputSchema.safeParse(patchFor(edit)).success).toBe(true);
    }
  });

  describe("the vertical", () => {
    it("turns the Generalist option into an explicit null", () => {
      // Not an omitted key — that would leave the old vertical in place and snap the cell back —
      // and not `""`, which the enum refuses. `null` is a stated fact: this creator covers no one
      // vertical.
      expect(patchFor({ field: "vertical", value: "" })).toEqual({ vertical: null });
    });

    it("keeps a chosen member", () => {
      expect(patchFor({ field: "vertical", value: "beauty" })).toEqual({ vertical: "beauty" });
    });

    it("refuses a word outside the enum rather than inventing a member", () => {
      // The union has no `other` on purpose. A select cannot emit this, but a select is not the
      // only editor this file will ever serve.
      expect(patchFor({ field: "vertical", value: "lifestyle" })).toBeNull();
    });
  });

  describe("the status", () => {
    it("keeps a chosen member", () => {
      expect(patchFor({ field: "status", value: "active" })).toEqual({ status: "active" });
    });

    it("refuses a value outside the enum", () => {
      expect(patchFor({ field: "status", value: "archived" })).toBeNull();
    });
  });

  describe("the brand set", () => {
    it("sends an empty array rather than null", () => {
      // "Not engaged yet" is a fact — a prospect nobody has booked — and the empty array is how
      // the record says it. `null` would fail the schema; omitting the key would leave the old
      // brands in place.
      expect(patchFor({ field: "brandIds", value: [] })).toEqual({ brandIds: [] });
    });

    it("refuses a set holding the same brand twice", () => {
      expect(patchFor({ field: "brandIds", value: ["b1", "b1"] })).toBeNull();
    });
  });

  describe("the account list", () => {
    it("carries a stored url through untouched", () => {
      // The panel that builds this list shows no `url` box. It seeds each row from the record and
      // hands it straight back, so correcting a follower count from the roster cannot clear a
      // profile link somebody recorded — which is the one way this write could quietly lose data.
      const linked = { ...ACCOUNT, url: "https://instagram.com/priyaskin" };
      expect(patchFor({ field: "accounts", value: [linked] })).toEqual({ accounts: [linked] });
    });

    it("refuses an empty list rather than removing a creator's last account", () => {
      // `.min(1)`, and it is what keeps the tier grouping total: a creator with no account has no
      // reach, falls out of every band, and the band counts stop summing to the rows.
      expect(patchFor({ field: "accounts", value: [] })).toBeNull();
    });

    it("refuses a repeated platform and handle", () => {
      // The one refusal only the database can make, checked before the request:
      // `influencer_accounts_workspace_platform_handle_key`.
      expect(patchFor({ field: "accounts", value: [ACCOUNT, { ...ACCOUNT }] })).toBeNull();
    });

    it("refuses a NaN follower count, which is what an empty box becomes", () => {
      // `toAccountPayload` answers `NaN` for an untouched box **rather than the `0` that
      // `Number("")` would give**, precisely so this refusal is possible: a creator silently
      // entered on zero followers lands in Nano and looks like a real reading.
      expect(patchFor({ field: "accounts", value: [{ ...ACCOUNT, followers: Number.NaN }] })).toBeNull();
    });

    it("refuses more accounts than the cap", () => {
      const eleven = Array.from({ length: 11 }, (_, index) => ({ ...ACCOUNT, handle: `h${index}` }));
      expect(patchFor({ field: "accounts", value: eleven })).toBeNull();
    });
  });
});

describe("isUnchanged", () => {
  it("stops an untouched accounts panel becoming a write", () => {
    // The case it now exists for: open the panel over the Reach cell, change nothing, press
    // `Save`. Without this the app replaces every child row of the creator, sweeps two cache
    // scopes and refetches 146 rows to store what was already there.
    expect(isUnchanged(creator(), { field: "accounts", value: [ACCOUNT] })).toBe(true);
    expect(
      isUnchanged(creator(), { field: "accounts", value: [{ ...ACCOUNT, followers: 84_300 }] }),
    ).toBe(false);
  });

  it("calls a reorder of the accounts a change, because position 0 is the primary", () => {
    // The one place a set comparison would be silently wrong. There is no `is_primary` column —
    // the order carries it — so moving an account to the top is a real edit with no field
    // changed, and comparing as a set would throw it away and leave the reader watching a
    // `Make primary` that does nothing.
    const two = creator({ accounts: [ACCOUNT, SECOND] });
    expect(isUnchanged(two, { field: "accounts", value: [ACCOUNT, SECOND] })).toBe(true);
    expect(isUnchanged(two, { field: "accounts", value: [SECOND, ACCOUNT] })).toBe(false);
  });

  it("sees a cleared engagement rate, which is not a zero", () => {
    // `null` is "nobody has measured this account" and `0` is "measured, and it is very bad".
    // A comparison that folded them together would refuse to write the correction.
    expect(
      isUnchanged(creator(), { field: "accounts", value: [{ ...ACCOUNT, engagementRate: null }] }),
    ).toBe(false);
  });

  it("sees a url the panel never showed, so it cannot call a clearing unchanged", () => {
    expect(
      isUnchanged(creator(), { field: "accounts", value: [{ ...ACCOUNT, url: "https://x.test/a" }] }),
    ).toBe(false);
  });

  it("reads a generalist's null as the select's empty option", () => {
    const generalist = creator({ vertical: null });
    expect(isUnchanged(generalist, { field: "vertical", value: "" })).toBe(true);
    expect(isUnchanged(generalist, { field: "vertical", value: "beauty" })).toBe(false);
    // And the other direction: a classified creator has not been made a generalist by opening the
    // select and closing it again.
    expect(isUnchanged(creator(), { field: "vertical", value: "beauty" })).toBe(true);
    expect(isUnchanged(creator(), { field: "vertical", value: "" })).toBe(false);
  });

  it("compares brands as a set, because the two sides are in different orders", () => {
    // The server sorts the record's ids; the picker rebuilds its list in the brand list's order
    // and keeps unresolved ids at the front. A positional comparison would call every brand edit
    // a change.
    expect(isUnchanged(creator(), { field: "brandIds", value: ["b2", "b1"] })).toBe(true);
    expect(isUnchanged(creator(), { field: "brandIds", value: ["b1"] })).toBe(false);
    expect(isUnchanged(creator(), { field: "brandIds", value: ["b1", "b2", "b3"] })).toBe(false);
    expect(isUnchanged(creator(), { field: "brandIds", value: [] })).toBe(false);
  });

  it("is not fooled by a duplicate into calling a shorter set equal", () => {
    // `["b1","b1"]` is a two-element array over a one-element set. Comparing lengths before
    // deduplicating would call it equal to `["b1","b2"]`.
    expect(isUnchanged(creator(), { field: "brandIds", value: ["b1", "b1"] })).toBe(false);
  });

  it("answers for the status", () => {
    expect(isUnchanged(creator(), { field: "status", value: "prospect" })).toBe(true);
    expect(isUnchanged(creator(), { field: "status", value: "active" })).toBe(false);
  });
});
