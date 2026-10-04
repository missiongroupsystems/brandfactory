import type { MarketingRequest, Outlet } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import {
  REQUEST_STATUSES,
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
