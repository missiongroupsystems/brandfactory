import { describe, expect, it } from "vitest";

import { NAV_GROUPS, NAV_ITEMS, isActivePath } from "./nav";

describe("isActivePath", () => {
  it("lights the item you are on", () => {
    expect(isActivePath("/brand", "/brand")).toBe(true);
  });

  it("lights a list while you are inside one of its records", () => {
    expect(isActivePath("/outlets/abc", "/outlets")).toBe(true);
    expect(isActivePath("/brand/abc", "/brand")).toBe(true);
  });

  it("does not light /brand on a /brands list", () => {
    // The reason this function exists. A plain `startsWith` answers true here, and the singular
    // route (the brand you are in) and the plural one (the workspace's brands) share a highlight.
    expect(isActivePath("/brands", "/brand")).toBe(false);
    expect(isActivePath("/brands/abc", "/brand")).toBe(false);
  });
});

describe("the nav", () => {
  it("opens on the brand profile", () => {
    expect(NAV_ITEMS[0]?.href).toBe("/brand");
  });

  it("names every grouped href, so nothing is filed under a group that does not hold it", () => {
    const hrefs = new Set(NAV_ITEMS.map((item) => item.href));
    for (const group of NAV_GROUPS) {
      for (const href of group.hrefs) expect(hrefs.has(href)).toBe(true);
    }
  });
});
