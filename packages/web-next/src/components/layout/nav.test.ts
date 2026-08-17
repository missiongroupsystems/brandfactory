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
  it("opens the Registry on the brand profile, above Outlets", () => {
    // The brand is the record every other record is *for*, so it leads the registry rather than
    // the whole nav; Dashboard is the home above it and is alone in the unlabelled group.
    const registry = NAV_GROUPS.find((group) => group.label === "Registry");
    expect(registry?.hrefs).toEqual(["/brand", "/outlets"]);
    expect(NAV_GROUPS[0]?.hrefs).toEqual(["/dashboard"]);
  });

  it("names every grouped href, so nothing is filed under a group that does not hold it", () => {
    const hrefs = new Set(NAV_ITEMS.map((item) => item.href));
    for (const group of NAV_GROUPS) {
      for (const href of group.hrefs) expect(hrefs.has(href)).toBe(true);
    }
  });

  it("groups without reordering, so the order lives in one place", () => {
    // The sidebar renders from `group.hrefs`, while the comments justifying each adjacency sit
    // on NAV_ITEMS — so a reorder has to be made twice and the two silently disagree if it is
    // not. Grouping is documented as presentation over the same order; this asserts it.
    const grouped = NAV_GROUPS.flatMap((group) => group.hrefs);
    const declared = NAV_ITEMS.map((item) => item.href).filter((href) => grouped.includes(href));
    expect(grouped).toEqual(declared);
  });
});
