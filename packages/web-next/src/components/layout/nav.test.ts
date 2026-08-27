import { describe, expect, it } from "vitest";

import {
  BRAND_NAV_GROUPS,
  BRAND_NAV_ITEMS,
  NAV_GROUPS,
  NAV_ITEMS,
  brandIdFromPath,
  brandNavHref,
  isActiveBrandNav,
  isActivePath,
} from "./nav";

describe("isActivePath", () => {
  it("lights the item you are on", () => {
    expect(isActivePath("/brands", "/brands")).toBe(true);
  });

  it("lights a list while you are inside one of its records", () => {
    expect(isActivePath("/outlets/abc", "/outlets")).toBe(true);
    expect(isActivePath("/brands/abc", "/brands")).toBe(true);
  });

  it("stops at a path boundary, so one route does not light its neighbour", () => {
    // The reason this function exists rather than a plain `startsWith`.
    expect(isActivePath("/tools/funnelling", "/tools/funnel")).toBe(false);
    expect(isActivePath("/brands", "/brand")).toBe(false);
  });
});

describe("the workspace nav", () => {
  it("opens on Dashboard and Brands, unlabelled and together", () => {
    // Dashboard is where the work is and Brands is the way into one; neither is an area of the
    // product, so the group carries no eyebrow.
    expect(NAV_GROUPS[0]).toEqual({ label: null, hrefs: ["/dashboard", "/brands"] });
  });

  it("has no Registry group, and holds neither of the items that were in it", () => {
    // Both left the workspace nav entirely — see BRAND_NAV_ITEMS. A regression here would be a
    // brand-scoped screen offered from a workspace page, where it has no brand to be about.
    expect(NAV_GROUPS.some((group) => group.label === "Registry")).toBe(false);
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(hrefs).not.toContain("/brand");
    expect(hrefs).not.toContain("/outlets");
  });

  it("carries a Tools group, and every page in it says it is empty", () => {
    const tools = NAV_GROUPS.find((group) => group.label === "Tools");
    expect(tools?.hrefs).toEqual(["/tools/funnel", "/tools/photography"]);
    // The honesty half. A placeholder that looks finished is how somebody files a bug against a
    // feature nobody has started.
    for (const href of tools!.hrefs) {
      expect(NAV_ITEMS.find((item) => item.href === href)?.tag).toBe("Empty");
    }
  });

  it("tags Contracts as a sample, because the screen beside it stopped being one", () => {
    // The honesty this release owes. `/vendors` reads the server as of 1.43.0 and `/contracts`
    // still reads `fixtures/contracts.ts` plus a vendor book of its own, so two vendor books are
    // on screen at once and a company created on one cannot be chosen on the other. The tag is
    // what makes that visible; it goes when the contracts conversion closes the gap.
    expect(NAV_ITEMS.find((item) => item.href === "/contracts")?.tag).toBe("Sample");
    // And the one beside it does *not* carry one, which is the half that makes the tag mean
    // something: a tag on every row is a tag on none.
    expect(NAV_ITEMS.find((item) => item.href === "/vendors")?.tag).toBeUndefined();
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

  it("has no group called Resources — that word belongs to the brand-scoped feature", () => {
    expect(NAV_GROUPS.map((g) => g.label)).not.toContain("Resources");
  });

  it("files Review and Marketing Requests under Queues, because both are queues", () => {
    const group = NAV_GROUPS.find((g) => g.label === "Queues");
    expect(group?.hrefs).toEqual(["/review", "/marketing-requests"]);
  });
});

describe("brandIdFromPath", () => {
  it("names the brand under /brands/:id and everything below it", () => {
    expect(brandIdFromPath("/brands/abc")).toBe("abc");
    expect(brandIdFromPath("/brands/abc/outlets")).toBe("abc");
    expect(brandIdFromPath("/brands/abc/outlets/casa-vostra")).toBe("abc");
  });

  it("leaves the gallery itself in the workspace", () => {
    // `/brands` is where you *choose* a brand, so the sidebar there is the workspace's. A brand
    // column over the gallery would offer the way back to the page you are already on.
    expect(brandIdFromPath("/brands")).toBe(null);
    expect(brandIdFromPath("/brands/")).toBe(null);
  });

  it("is not fooled by a route that merely starts with the same letters", () => {
    expect(brandIdFromPath("/dashboard")).toBe(null);
    expect(brandIdFromPath("/brandsomething")).toBe(null);
    // The Operations Hub's outlet-brand registry, which is a different noun entirely.
    expect(brandIdFromPath("/registry-brands/abc")).toBe(null);
  });

  it("decodes the segment, and survives one that cannot be decoded", () => {
    expect(brandIdFromPath("/brands/a%2Fb")).toBe("a/b");
    // A malformed escape is a broken URL, not a brand. `decodeURIComponent` throws on this.
    expect(brandIdFromPath("/brands/%zz")).toBe(null);
  });

  it("round-trips whatever brandNavHref writes", () => {
    // The pair is the whole switch between the two sidebars, so a helper that escapes and a
    // reader that does not would be a brand column that vanishes on the one id with a character
    // in it. Asserting the two together is what stops them drifting apart.
    for (const id of ["abc", "a/b", "a b", "0198e4f2-1c3d-7000-8000-000000000000"]) {
      expect(brandIdFromPath(brandNavHref(id, ""))).toBe(id);
      expect(brandIdFromPath(brandNavHref(id, "outlets"))).toBe(id);
    }
  });
});

describe("the brand nav", () => {
  it("puts the profile at the brand's own path and every other screen under it", () => {
    expect(brandNavHref("abc", "")).toBe("/brands/abc");
    expect(brandNavHref("abc", "outlets")).toBe("/brands/abc/outlets");
  });

  it("lights the profile only on the brand's own page", () => {
    // The reason `isActiveBrandNav` is not `isActivePath`. Every brand screen lives *under*
    // `/brands/:id`, so a prefix test would light two rows at once on the outlets list — and the
    // wrong one of the two is the one that looks like home.
    expect(isActiveBrandNav("/brands/abc", "/brands/abc", "")).toBe(true);
    expect(isActiveBrandNav("/brands/abc/outlets", "/brands/abc", "")).toBe(false);
  });

  it("lights a brand list while you are inside one of its records", () => {
    const href = brandNavHref("abc", "outlets");
    expect(isActiveBrandNav("/brands/abc/outlets", href, "outlets")).toBe(true);
    expect(isActiveBrandNav("/brands/abc/outlets/casa-vostra", href, "outlets")).toBe(true);
  });

  it("holds exactly one root item, so the sidebar has one home row", () => {
    const roots = BRAND_NAV_ITEMS.filter((item) => item.segment === "");
    expect(roots).toHaveLength(1);
    expect(roots[0]?.title).toBe("Brand profile");
  });

  it("leaves the brand's own page ungrouped", () => {
    expect(BRAND_NAV_GROUPS.find((g) => g.label === null)?.segments).toEqual([""]);
  });

  it("never orphans a brand nav row", () => {
    const grouped = new Set(BRAND_NAV_GROUPS.flatMap((g) => g.segments));
    for (const item of BRAND_NAV_ITEMS) expect(grouped.has(item.segment)).toBe(true);
  });

  it("groups in list order, so grouping never reorders", () => {
    const order = BRAND_NAV_ITEMS.map((i) => i.segment);
    const flat = BRAND_NAV_GROUPS.flatMap((g) => g.segments).filter((sgmt) =>
      order.includes(sgmt),
    );
    expect(flat).toEqual(order);
  });
});
