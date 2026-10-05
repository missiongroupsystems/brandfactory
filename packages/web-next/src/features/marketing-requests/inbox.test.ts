import type { MarketingRequest, Outlet, WorkspacePerson } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  REQUEST_STATUSES,
  assigneeOptions,
  assigneePatch,
  inSearch,
  initialRequestForm,
  isMine,
  mineFrom,
  outletsForBrand,
  personLabel,
  requestFormProblem,
  statusViewFrom,
  tally,
  toCreateInput,
} from "./inbox";

function request(overrides: Partial<MarketingRequest> = {}): MarketingRequest {
  return {
    id: "r-1",
    workspaceId: "w-1",
    brandId: "b-1",
    outletId: null,
    number: 1001,
    reference: "MR-1001",
    type: "social_post",
    priority: "medium",
    status: "new",
    summary: "Set menu teasers",
    details: "Lead on the crab",
    neededBy: null,
    requestedBy: { id: "u-1", email: "marcus@example.com", displayName: "Marcus Tan" },
    assignee: null,
    resolvedAt: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
    ...overrides,
  } as MarketingRequest;
}

const NAMES = { brand: "Casa Vostra", outlet: "Tanjong Pagar" };

describe("reading the URL", () => {
  it("reads a known status and falls back to all for anything else", () => {
    expect(statusViewFrom("declined")).toBe("declined");
    expect(statusViewFrom("banana")).toBe("all");
    expect(statusViewFrom(undefined)).toBe("all");
  });

  it("turns mine on only for 1", () => {
    expect(mineFrom("1")).toBe(true);
    expect(mineFrom("true")).toBe(false);
    expect(mineFrom(undefined)).toBe(false);
  });
});

describe("inSearch", () => {
  it("matches the reference, the summary, the brand, the outlet and who asked", () => {
    for (const q of ["mr-1001", "teasers", "casa", "tanjong", "marcus"]) {
      expect(inSearch(request(), q, NAMES), q).toBe(true);
    }
  });

  it("does not match the details, which the table does not show", () => {
    expect(inSearch(request(), "crab", NAMES)).toBe(false);
  });

  it("treats a blank box as no search", () => {
    expect(inSearch(request(), "   ", NAMES)).toBe(true);
  });
});

describe("people", () => {
  it("shows the name, else the email, else Unknown", () => {
    expect(personLabel({ id: "u", email: "a@b.c", displayName: "Ana" } as never)).toBe("Ana");
    expect(personLabel({ id: "u", email: "a@b.c", displayName: " " } as never)).toBe("a@b.c");
    expect(personLabel(null)).toBe("Unknown");
  });

  it("counts a request as mine only when I am its assignee", () => {
    const mine = request({ assignee: { id: "u-2", email: "x@y.z", displayName: null } as never });
    expect(isMine(mine, "u-2")).toBe(true);
    expect(isMine(mine, "u-1")).toBe(false);
    expect(isMine(request(), "u-2")).toBe(false);
    expect(isMine(mine, undefined)).toBe(false);
  });
});

describe("tally", () => {
  it("counts every rung, including the ones with nothing in them", () => {
    const counts = tally([request(), request({ status: "declined" }), request()]);
    expect(counts).toEqual({ new: 2, in_review: 0, resolved: 0, declined: 1 });
    expect(Object.keys(counts)).toEqual([...REQUEST_STATUSES]);
  });
});

describe("outletsForBrand", () => {
  const outlets = [
    { id: "o-2", name: "Zeta", brandId: "b-1" },
    { id: "o-1", name: "Alpha", brandId: "b-1" },
    { id: "o-3", name: "Other", brandId: "b-2" },
    { id: "o-4", name: "Unbranded", brandId: null },
  ] as Outlet[];

  it("offers only the brand's outlets, by name", () => {
    expect(outletsForBrand(outlets, "b-1").map((o) => o.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("offers nothing until a brand is chosen", () => {
    expect(outletsForBrand(outlets, "")).toEqual([]);
  });
});

describe("the form", () => {
  it("names the first missing thing", () => {
    const form = initialRequestForm();
    expect(requestFormProblem(form)).toMatch(/brand/);
    expect(requestFormProblem({ ...form, brandId: "b-1" })).toMatch(/kind/);
    expect(requestFormProblem({ ...form, brandId: "b-1", type: "other" })).toMatch(/summary/);
    expect(
      requestFormProblem({ ...form, brandId: "b-1", type: "other", summary: "  " }),
    ).toMatch(/summary/);
    expect(
      requestFormProblem({ ...form, brandId: "b-1", type: "other", summary: "Posters" }),
    ).toBeNull();
  });

  it("sends null for every cleared box, never an empty string", () => {
    const input = toCreateInput({
      ...initialRequestForm("b-1"),
      type: "in_store_signage",
      summary: "  A-frame insert  ",
      details: "   ",
    });
    expect(input).toEqual({
      brandId: "b-1",
      outletId: null,
      type: "in_store_signage",
      priority: "medium",
      summary: "A-frame insert",
      details: null,
      neededBy: null,
    });
  });
});

/** An assignee, cast once — `MarketingRequest.assignee` carries a branded `UserId`. */
function holder(id: string, email: string, displayName: string | null = null) {
  return { id, email, displayName } as NonNullable<MarketingRequest["assignee"]>;
}

const PEOPLE = [
  { id: "u-1", displayName: "Marcus Tan", email: "marcus@example.com" },
  { id: "u-2", displayName: null, email: "chloe@example.com" },
] as WorkspacePerson[];

describe("the assignee picker", () => {
  it("offers Unassigned first, so clearing is a choice rather than a blank row", () => {
    const rows = assigneeOptions(PEOPLE, "u-1");
    expect(rows[0]).toEqual({ id: null, label: "Unassigned", isMe: false });
  });

  it("marks the caller rather than hoisting them", () => {
    // The server orders the list the way its labels read. Moving one name to the
    // top would break that for the person most likely to be looking for somebody
    // else's — and "Assign to me" is already the fast path for taking it.
    const rows = assigneeOptions(PEOPLE, "u-1");
    expect(rows.map((r) => r.id)).toEqual([null, "u-1", "u-2"]);
    expect(rows[1]).toMatchObject({ id: "u-1", label: "Marcus Tan (you)", isMe: true });
    expect(rows[2]?.isMe).toBe(false);
  });

  it("falls back to the email for somebody with no display name", () => {
    // Same rule as the Assigned column and "Requested by": `personLabel`. Most
    // accounts here have no display name, so a picker that rendered the name
    // alone would be a list of blanks.
    expect(assigneeOptions(PEOPLE, undefined)[2]?.label).toBe("chloe@example.com");
  });

  it("marks nobody while `/me` is still loading", () => {
    expect(assigneeOptions(PEOPLE, undefined).some((r) => r.isMe)).toBe(false);
  });

  it("sends nothing when the chosen person is already the assignee", () => {
    // The patch schema refuses `{}`, and an unchanged write would put back a
    // value a colleague may have altered a moment ago.
    const assigned = request({ assignee: holder("u-2", "chloe@example.com") });
    expect(assigneePatch(assigned, "u-2" as never)).toBeNull();
  });

  it("sends nothing when Unassigned is chosen on a request nobody holds", () => {
    expect(assigneePatch(request(), null)).toBeNull();
  });

  it("sends the id for a change, and null to clear one", () => {
    const assigned = request({ assignee: holder("u-2", "chloe@example.com") });
    expect(assigneePatch(request(), "u-1" as never)).toEqual({ assigneeUserId: "u-1" });
    expect(assigneePatch(assigned, null)).toEqual({ assigneeUserId: null });
    expect(assigneePatch(assigned, "u-1" as never)).toEqual({ assigneeUserId: "u-1" });
  });
});
