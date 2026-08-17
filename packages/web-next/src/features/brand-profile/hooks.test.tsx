import type { BrandWithSections } from "@brandfactory/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBrandProfileMutations } from "./hooks";

/**
 * **The rule that a browser pass cannot see, and that a bug here deletes a brand's context.**
 *
 * `PATCH /brands/:id/guidelines` takes the brand's *complete* section list and deletes anything
 * omitted. `saveGuidelines` therefore re-reads the brand immediately before writing and hands the
 * caller *that* list to build from — never the SWR cache, which may be minutes old and missing a
 * section added since. The assertion below is the difference: the builder must be called with the
 * fresh answer, not with what the page is rendering.
 *
 * The screen's own smoke test mocks these functions away, so this is the only place the ordering
 * is exercised.
 */

const get = vi.fn();
const updateGuidelines = vi.fn();
const update = vi.fn();

vi.mock("./api", () => ({
  brandProfileService: {
    get: (...args: unknown[]) => get(...args) as unknown,
    updateGuidelines: (...args: unknown[]) => updateGuidelines(...args) as unknown,
    update: (...args: unknown[]) => update(...args) as unknown,
  },
}));

const brand = (labels: string[]) =>
  ({
    id: "b1",
    sections: labels.map((label, index) => ({
      id: `s${index}`,
      brandId: "b1",
      label,
      body: { type: "doc", content: [{ type: "paragraph" }] },
      priority: (index + 1) * 100,
      createdBy: "user",
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-01T09:00:00.000Z",
    })),
  }) as unknown as BrandWithSections;

beforeEach(() => {
  get.mockReset();
  updateGuidelines.mockReset();
  update.mockReset();
});

describe("saveGuidelines", () => {
  it("builds the payload from a fresh read, not from what the page holds", async () => {
    // The server has gained a section since the page loaded — a research run finished, or the
    // brand was edited in another tab.
    const fresh = brand(["TL;DR", "Voice & tone", "Target audience"]);
    get.mockResolvedValue(fresh);
    updateGuidelines.mockResolvedValue([]);

    const { result } = renderHook(() => useBrandProfileMutations("b1"));

    const seen: string[] = [];
    await result.current.saveGuidelines((current) => {
      seen.push(...current.sections.map((section) => section.label));
      return [];
    });

    expect(get).toHaveBeenCalledWith("b1");
    // Three, not the two a stale caller would have had. Building from a stale list and sending it
    // would delete the third section server-side, with a success toast on screen.
    expect(seen).toEqual(["TL;DR", "Voice & tone", "Target audience"]);
  });

  it("reads before it writes", async () => {
    const order: string[] = [];
    get.mockImplementation(() => {
      order.push("get");
      return Promise.resolve(brand(["TL;DR"]));
    });
    updateGuidelines.mockImplementation(() => {
      order.push("patch");
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useBrandProfileMutations("b1"));
    await result.current.saveGuidelines(() => []);

    expect(order).toEqual(["get", "patch"]);
  });

  it("refuses without a brand, rather than writing to an undefined path", async () => {
    const { result } = renderHook(() => useBrandProfileMutations(undefined));
    await expect(result.current.saveGuidelines(() => [])).rejects.toThrow("No brand selected");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("updateBrand", () => {
  it("patches the row and does not read first", async () => {
    // The brand row is three independent columns, so a patch is a patch — nothing here is a
    // complete-list write and nothing is deleted by omission.
    update.mockResolvedValue({ id: "b1", name: "Harbour Table" });

    const { result } = renderHook(() => useBrandProfileMutations("b1"));
    await result.current.updateBrand({ name: "Harbour Table" });

    expect(update).toHaveBeenCalledWith("b1", { name: "Harbour Table" });
    expect(get).not.toHaveBeenCalled();
  });
});
