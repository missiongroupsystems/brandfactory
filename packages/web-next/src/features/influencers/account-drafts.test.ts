import type { Influencer, InfluencerAccount } from "@brandfactory/shared";
import { InfluencerAccountsSchema, MAX_INFLUENCER_ACCOUNTS } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  accountDraftsFrom,
  accountsProblem,
  addAccountDraft,
  type AccountDraft,
  duplicateAccountIndexes,
  emptyAccountDraft,
  makeAccountPrimary,
  removeAccountDraft,
  setAccountDraft,
  toAccountPayload,
} from "./account-drafts";

/**
 * The account editor's rules, asserted where they can be.
 *
 * `AGENTS.md` says this package tests auth, workspace resolution and cache keys **and not the
 * screens** — so the list operations live in a module of their own rather than inside
 * `account-rows.tsx`, and this file is why. Every rule here is invisible in a browser pass right
 * up until it is wrong: a remove that empties the list fails on submit rather than on screen, a
 * `Make primary` that swaps rather than moves reorders somebody else's row, and a duplicate
 * caught only by the server is three fields of wasted typing.
 */

function draft(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return { ...emptyAccountDraft(), handle: "priyaskin", followers: "124000", ...overrides };
}

describe("accountDraftsFrom", () => {
  it("gives a new creator one empty row rather than none", () => {
    // The record cannot hold an empty list, so a draft starting there would make `Add account` a
    // step somebody has to take before they can type anything.
    expect(accountDraftsFrom()).toHaveLength(1);
    expect(accountDraftsFrom()[0]?.handle).toBe("");
  });

  it("holds an existing creator's accounts in their stored order", () => {
    const accounts: InfluencerAccount[] = [
      { platform: "instagram", handle: "priyaskin", followers: 840_000, engagementRate: 1.1, url: null },
      { platform: "tiktok", handle: "priyaskin", followers: 312_000, engagementRate: null, url: null },
    ];
    const drafts = accountDraftsFrom({ accounts } as Influencer);
    expect(drafts.map((d) => d.platform)).toEqual(["instagram", "tiktok"]);
    // Numbers become strings on the way in, and an unmeasured rate becomes an empty box rather
    // than the string "null".
    expect(drafts[0]?.followers).toBe("840000");
    expect(drafts[0]?.engagementRate).toBe("1.1");
    expect(drafts[1]?.engagementRate).toBe("");
  });
});

describe("addAccountDraft", () => {
  it("appends an empty row", () => {
    expect(addAccountDraft([draft()])).toHaveLength(2);
  });

  it("stops at the cap the schema refuses past", () => {
    const full = Array.from({ length: MAX_INFLUENCER_ACCOUNTS }, (_, i) =>
      draft({ handle: `handle${i}` }),
    );
    expect(addAccountDraft(full)).toHaveLength(MAX_INFLUENCER_ACCOUNTS);
    // And the cap is the schema's, not a number this module chose.
    expect(InfluencerAccountsSchema.safeParse(toAccountPayload(full)).success).toBe(true);
  });
});

describe("removeAccountDraft", () => {
  it("drops the named row", () => {
    const drafts = [draft({ handle: "first" }), draft({ handle: "second" })];
    expect(removeAccountDraft(drafts, 0).map((d) => d.handle)).toEqual(["second"]);
  });

  it("refuses to empty the list", () => {
    // `.min(1)` — a creator with no account has no reach and no tier. The button is disabled for
    // this reason; the guard is here so the rule holds however it is called.
    expect(removeAccountDraft([draft()], 0)).toHaveLength(1);
  });
});

describe("makeAccountPrimary", () => {
  it("moves the row to the top and keeps every other order", () => {
    const drafts = [draft({ handle: "a" }), draft({ handle: "b" }), draft({ handle: "c" })];
    // A **move**, not a swap: swapping `c` with `a` would also send `a` to the bottom, which is a
    // reorder nobody asked for.
    expect(makeAccountPrimary(drafts, 2).map((d) => d.handle)).toEqual(["c", "a", "b"]);
  });

  it("leaves a list alone when the first row is already the one asked for", () => {
    const drafts = [draft({ handle: "a" }), draft({ handle: "b" })];
    expect(makeAccountPrimary(drafts, 0).map((d) => d.handle)).toEqual(["a", "b"]);
  });
});

describe("duplicateAccountIndexes", () => {
  it("flags the second occurrence only", () => {
    // Marking both would tell the reader the row they typed first is also wrong.
    const drafts = [draft(), draft(), draft({ handle: "other" })];
    expect([...duplicateAccountIndexes(drafts)]).toEqual([1]);
  });

  it("accepts two accounts on one platform with different handles", () => {
    const drafts = [draft({ handle: "priyaskin" }), draft({ handle: "priyaskin.archive" })];
    expect(duplicateAccountIndexes(drafts).size).toBe(0);
  });

  it("accepts one handle on two platforms — the case the child table exists for", () => {
    const drafts = [draft({ platform: "instagram" }), draft({ platform: "tiktok" })];
    expect(duplicateAccountIndexes(drafts).size).toBe(0);
  });

  it("says nothing about untouched rows", () => {
    // Two empty rows are an incomplete form, not a contradictory one, and `required` already
    // covers it.
    expect(duplicateAccountIndexes([emptyAccountDraft(), emptyAccountDraft()]).size).toBe(0);
  });

  it("compares exactly, because the constraint behind it does", () => {
    // Case-folding here would refuse a pair the database accepts, which is its own defect.
    const drafts = [draft({ handle: "priyaskin" }), draft({ handle: "PriyaSkin" })];
    expect(duplicateAccountIndexes(drafts).size).toBe(0);
  });

  it("agrees with the schema that refuses the same body", () => {
    const drafts = [draft(), draft()];
    expect(duplicateAccountIndexes(drafts).size).toBe(1);
    expect(InfluencerAccountsSchema.safeParse(toAccountPayload(drafts)).success).toBe(false);
  });
});

describe("toAccountPayload", () => {
  it("converts the numbers once and trims the handle", () => {
    const [account] = toAccountPayload([draft({ handle: "  priyaskin  ", engagementRate: "3.8" })]);
    expect(account?.handle).toBe("priyaskin");
    expect(account?.followers).toBe(124_000);
    expect(account?.engagementRate).toBe(3.8);
  });

  it("keeps an empty rate apart from a typed zero", () => {
    // A prospect nobody has run a campaign with has no engagement history; a creator measured at
    // zero has a very bad one. This is the third place that distinction is defended.
    expect(toAccountPayload([draft({ engagementRate: "" })])[0]?.engagementRate).toBeNull();
    expect(toAccountPayload([draft({ engagementRate: "0" })])[0]?.engagementRate).toBe(0);
  });

  it("sends an empty URL box as null rather than as an empty string", () => {
    expect(toAccountPayload([draft({ url: "   " })])[0]?.url).toBeNull();
    expect(toAccountPayload([draft({ url: "https://example.com/u/1" })])[0]?.url).toBe(
      "https://example.com/u/1",
    );
  });

  it("sends an empty follower box as NaN, so the schema refuses it rather than storing 0", () => {
    // **`Number("")` is `0`, not `NaN`.** The whole reason a draft holds its numbers as strings is
    // that an empty box must not mean a follower count of nothing — and the conversion is the one
    // point where that could be undone silently. A laundered `0` lands the creator in Nano and
    // reads on the roster as a real measurement nobody took.
    //
    // The browser stops the submit first (`required` on the input); this asserts the second line
    // of defence and the third at once, because the schema is what turns the `NaN` into a refusal
    // that names the field.
    const [account] = toAccountPayload([draft({ followers: "" })]);
    expect(account?.followers).toBeNaN();
    expect(InfluencerAccountsSchema.safeParse(toAccountPayload([draft({ followers: "" })])).success).toBe(
      false,
    );
    // A whitespace-only box is the same box. `Number(" ")` is also `0`.
    expect(toAccountPayload([draft({ followers: "   " })])[0]?.followers).toBeNaN();
    // A typed zero is a real reading and survives — the same distinction the rate box makes.
    expect(toAccountPayload([draft({ followers: "0" })])[0]?.followers).toBe(0);
  });

  it("produces a body the wire schema accepts", () => {
    // The payload is built here and parsed by the server; this is the one assertion that both
    // halves agree, and it fails if a field is renamed on either side.
    const drafts = [draft(), draft({ platform: "tiktok" })];
    expect(InfluencerAccountsSchema.safeParse(toAccountPayload(drafts)).success).toBe(true);
  });
});

describe("setAccountDraft", () => {
  it("replaces one row and leaves its neighbours alone", () => {
    const drafts = [draft({ handle: "a" }), draft({ handle: "b" })];
    const next = setAccountDraft(drafts, 1, { handle: "changed" });
    expect(next.map((d) => d.handle)).toEqual(["a", "changed"]);
    // A new array, so React sees the change.
    expect(next).not.toBe(drafts);
  });
});

describe("accountsProblem", () => {
  /**
   * The sentence the accounts panel puts above a disabled `Save`.
   *
   * It exists because that panel has **no `<form>` to lean on**. `InfluencerForm` marks its boxes
   * `required` and lets the browser refuse the submit; a panel living in a popover over a table
   * cell has to disable its own button and say why — and *"Too small: expected string to have >=1
   * characters"* is not a sentence anybody can act on.
   */
  it("says nothing about a list that can be saved", () => {
    expect(accountsProblem([draft()])).toBe(null);
    expect(accountsProblem([draft(), draft({ platform: "tiktok" })])).toBe(null);
  });

  it("names the repeated pair, and names it before an empty box elsewhere", () => {
    // **The order is the point.** The duplicate is the one failure whose fix is to delete a row
    // rather than to fill one in, so reporting the empty box first would send the reader to the
    // wrong end of the panel — to fill in a row they are about to remove.
    const problem = accountsProblem([
      draft(),
      draft({ followers: "" }),
      draft(),
    ]);
    expect(problem).toContain("@priyaskin");
    expect(problem).toContain("Instagram");
    expect(problem).toContain("already listed above");
  });

  it("catches an emptied follower box on the string, before the conversion", () => {
    // `Number("")` is `0`, so a check made after `toAccountPayload` would have to reason about a
    // `NaN` — and a check made carelessly would launder the box into a creator entered on zero
    // followers, who lands in Nano and looks like a real reading.
    expect(accountsProblem([draft({ followers: "" })])).toBe("Every account needs a follower count.");
    expect(accountsProblem([draft({ followers: "  " })])).toBe(
      "Every account needs a follower count.",
    );
    // A typed zero is a measurement and survives.
    expect(accountsProblem([draft({ followers: "0" })])).toBe(null);
  });

  it("catches an empty handle", () => {
    expect(accountsProblem([draft({ handle: "" })])).toBe("Every account needs a handle.");
  });

  it("falls through to the schema's own words for what nobody types by hand", () => {
    // An engagement rate over 100 is not a slip somebody makes in a percent box; it is what an
    // import or a paste produces. The shared schema already has a message for it, and inventing a
    // second one here is how the two drift.
    const problem = accountsProblem([draft({ engagementRate: "140" })]);
    expect(problem).not.toBe(null);
    expect(problem).not.toBe("Every account needs a handle.");
  });

  it("refuses an empty list, which is what a last removal would leave", () => {
    // The panel's Remove button is disabled at one row, so this is the second of two defences —
    // and it is the one that holds if a caller ever builds the list some other way.
    expect(accountsProblem([])).not.toBe(null);
  });
});
