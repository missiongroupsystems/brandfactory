import type { Influencer } from "@brandfactory/shared";
import { InfluencerSchema, UpdateInfluencerInputSchema } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { EDITABLE_FIELDS, isUnchanged, patchFor } from "./patch";

/**
 * The seam between a cell somebody typed in and the body that goes on the wire.
 *
 * Everything else about inline editing has to be clicked to be seen. This is the part that is
 * arithmetic, and it holds the rules that are wrong by one character — the `""` that has to become
 * `null`, the trim that decides whether an edit happened at all, and the promise that a status
 * change writes a status and nothing else.
 */

const creator = (overrides: Record<string, unknown> = {}): Influencer =>
  InfluencerSchema.parse({
    id: "i1",
    workspaceId: "w1",
    slug: "priya-raman",
    name: "Priya Raman",
    accounts: [
      { platform: "instagram", handle: "priyaskin", followers: 84_200, engagementRate: 3.8, url: null },
    ],
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
    ["name", { field: "name", value: "Priya Nair" }],
    ["vertical", { field: "vertical", value: "food" }],
    ["status", { field: "status", value: "active" }],
    ["brandIds", { field: "brandIds", value: ["b3"] }],
  ] as const)("sends %s alone and nothing else", (field, edit) => {
    const patch = patchFor(edit)!;
    expect(Object.keys(patch)).toEqual([field]);
  });

  it("covers every field the table declares editable", () => {
    // A fifth editable column added without a branch here fails the typecheck; a fifth added to
    // the list and forgotten in the switch fails this.
    expect([...EDITABLE_FIELDS].sort()).toEqual(["brandIds", "name", "status", "vertical"]);
  });

  it("builds a body the wire schema accepts", () => {
    // The same zod object the route validates with, so this file cannot drift from the server.
    for (const edit of [
      { field: "name", value: "Priya Nair" },
      { field: "vertical", value: "" },
      { field: "status", value: "past" },
      { field: "brandIds", value: [] },
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

  describe("the name", () => {
    it("trims, because the schema does", () => {
      // Two spellings of one name must not reach the wire, or `isUnchanged` and the server would
      // disagree about whether anything happened.
      expect(patchFor({ field: "name", value: "  Priya Nair  " })).toEqual({ name: "Priya Nair" });
    });

    it("refuses an empty box instead of sending a blank name", () => {
      // The reachable failure: somebody cleared the cell and pressed Enter. `InfluencerNameSchema`
      // is `.min(1)`, so this is a local revert rather than a round trip and a 400.
      expect(patchFor({ field: "name", value: "" })).toBeNull();
      expect(patchFor({ field: "name", value: "   " })).toBeNull();
    });

    it("refuses a name past the column's length", () => {
      expect(patchFor({ field: "name", value: "x".repeat(201) })).toBeNull();
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
});

describe("isUnchanged", () => {
  it("stops a text editor's blur becoming a write", () => {
    // The case it exists for: click into the name cell, click straight out. Without this the app
    // fires a PATCH, sweeps two cache scopes and refetches 146 rows to store what was already
    // there.
    expect(isUnchanged(creator(), { field: "name", value: "Priya Raman" })).toBe(true);
    expect(isUnchanged(creator(), { field: "name", value: "  Priya Raman  " })).toBe(true);
    expect(isUnchanged(creator(), { field: "name", value: "Priya Nair" })).toBe(false);
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
