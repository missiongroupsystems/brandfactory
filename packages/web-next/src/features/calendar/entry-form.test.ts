import type { SocialPost } from "@brandfactory/shared";
import { CreateSocialPostInputSchema, UpdateSocialPostInputSchema } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENTRY_TIME,
  entryFormProblem,
  initialEntryForm,
  scheduledAtFrom,
  toCreateInput,
  toUpdateInput,
} from "./entry-form";

// Timezone-agnostic, like `grid.test.ts`: instants are built with the local
// `Date` constructor and compared as instants, which is what the sheet does.

function entry(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "sp-1" as SocialPost["id"],
    brandId: "br-1" as SocialPost["brandId"],
    kind: "post",
    platform: "instagram",
    scheduledAt: new Date(2026, 9, 9, 19, 0).toISOString(),
    body: "",
    status: "editing",
    createdBy: "user",
    format: "Reel · 30s",
    hook: "Coals catching at dusk",
    dish: "Tsukune",
    talent: null,
    filmedBy: null,
    canvaUrl: null,
    shootId: null,
    eventsEventId: null,
    approvedAt: null,
    approvedBy: null,
    clearedWith: null,
    assetIds: [],
    deletedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("scheduledAtFrom", () => {
  it("reads the date and time as local", () => {
    expect(scheduledAtFrom("2026-10-09", "19:00")).toBe(new Date(2026, 9, 9, 19, 0).toISOString());
  });

  it("falls back to the default time when the time is blank", () => {
    const [h, m] = DEFAULT_ENTRY_TIME.split(":").map(Number);
    expect(scheduledAtFrom("2026-10-09", "")).toBe(new Date(2026, 9, 9, h, m).toISOString());
  });

  it("refuses a blank date, a malformed date and a day that does not exist", () => {
    expect(scheduledAtFrom("", "10:00")).toBeNull();
    expect(scheduledAtFrom("9 Oct", "10:00")).toBeNull();
    // 31 February would roll to 3 March — a post on a day nobody typed.
    expect(scheduledAtFrom("2026-02-31", "10:00")).toBeNull();
  });
});

describe("initialEntryForm", () => {
  it("starts a new entry on the given brand and day, as an idea", () => {
    const form = initialEntryForm(undefined, { brandId: "br-2", date: "2026-10-16" });
    expect(form).toMatchObject({
      brandId: "br-2",
      date: "2026-10-16",
      time: DEFAULT_ENTRY_TIME,
      kind: "post",
      status: "idea",
      hook: "",
    });
  });

  it("round-trips an existing entry's local day and time", () => {
    const form = initialEntryForm(entry());
    expect(form.date).toBe("2026-10-09");
    expect(form.time).toBe("19:00");
    expect(form.hook).toBe("Coals catching at dusk");
    expect(form.talent).toBe("");
  });
});

describe("entryFormProblem", () => {
  it("asks for a brand, then a date", () => {
    const blank = initialEntryForm();
    expect(entryFormProblem(blank)).toMatch(/brand/i);
    expect(entryFormProblem({ ...blank, brandId: "br-1" })).toMatch(/date/i);
    expect(entryFormProblem({ ...blank, brandId: "br-1", date: "2026-10-09" })).toBeNull();
  });
});

describe("toCreateInput", () => {
  it("turns blanks into null and passes the create schema", () => {
    const form = {
      ...initialEntryForm(undefined, { brandId: "br-1", date: "2026-10-12" }),
      platform: "tiktok" as const,
      hook: "  The pasta pull ",
    };
    const input = toCreateInput(form);
    expect(input.hook).toBe("The pasta pull");
    expect(input.dish).toBeNull();
    expect(input.body).toBe("");
    expect(input.createdBy).toBe("user");
    expect(CreateSocialPostInputSchema.safeParse(input).success).toBe(true);
  });

  it("keeps a shoot a shoot", () => {
    const form = {
      ...initialEntryForm(undefined, { brandId: "br-1", date: "2026-10-07" }),
      kind: "shoot" as const,
    };
    expect(toCreateInput(form).kind).toBe("shoot");
  });
});

describe("toUpdateInput", () => {
  it("is null when nothing changed, because the patch schema refuses {}", () => {
    const e = entry();
    expect(toUpdateInput(e, initialEntryForm(e))).toBeNull();
  });

  it("sends only the keys that changed", () => {
    const e = entry();
    const patch = toUpdateInput(e, { ...initialEntryForm(e), status: "posted" });
    expect(patch).toEqual({ status: "posted" });
    expect(UpdateSocialPostInputSchema.safeParse(patch).success).toBe(true);
  });

  it("clears a plan field with null when it is blanked", () => {
    const e = entry();
    expect(toUpdateInput(e, { ...initialEntryForm(e), dish: "   " })).toEqual({ dish: null });
  });

  it("moves the time without touching a hook it did not change", () => {
    const e = entry();
    const patch = toUpdateInput(e, { ...initialEntryForm(e), time: "20:30" });
    expect(patch).toEqual({ scheduledAt: new Date(2026, 9, 9, 20, 30).toISOString() });
  });

  it("treats the same instant in a different spelling as unchanged", () => {
    const at = new Date(2026, 9, 9, 19, 0).toISOString().replace(".000Z", "Z");
    const e = entry({ scheduledAt: at });
    expect(toUpdateInput(e, initialEntryForm(e))).toBeNull();
  });

  it("dates an undated entry when it is saved from the calendar", () => {
    const e = entry({ scheduledAt: null });
    const patch = toUpdateInput(e, { ...initialEntryForm(e), date: "2026-10-20" });
    expect(patch?.scheduledAt).toBe(new Date(2026, 9, 20, 10, 0).toISOString());
  });
});
