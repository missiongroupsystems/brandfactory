import { describe, expect, it } from "vitest";

import { MAX_BRAND_PILLARS, brandPillars } from "./pillars";

/**
 * The sample pillars are hardcoded, so most of what could be asserted about them is a
 * restatement of the file. These four are the claims a reader *cannot* check by looking, and each
 * one is a rule that survives the move to stored rows.
 */
describe("brandPillars", () => {
  it("never answers more than the cap", () => {
    // The cap is the product decision — a brand that stands on nine things stands on nothing —
    // and it is enforced here rather than by the grid, so it still holds when a table feeds this.
    expect(brandPillars().length).toBeLessThanOrEqual(MAX_BRAND_PILLARS);
  });

  it("gives every pillar a title, a commitment and a glyph", () => {
    // A pillar missing its description is a bold line in a card of white space, and the grid has
    // no branch for it: the design assumes all three parts are there.
    for (const pillar of brandPillars()) {
      expect(pillar.title.trim().length).toBeGreaterThan(0);
      expect(pillar.description.trim().length).toBeGreaterThan(0);
      // A lucide icon is a `forwardRef` object rather than a function, so this is a presence
      // check and not a type check — the point is that the row carries its own glyph.
      expect(pillar.icon).toBeTruthy();
    }
  });

  it("keeps the titles distinct", () => {
    // The band keys the list on the title. Two pillars named the same thing would drop one card
    // and warn about it in the console rather than failing anything.
    const titles = brandPillars().map((pillar) => pillar.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("answers a fresh array, so a caller cannot edit the sample", () => {
    // `slice` rather than the constant. A component that sorted the result in place would
    // reorder the pillars for every brand for the life of the tab.
    const first = brandPillars();
    first.pop();
    expect(brandPillars().length).toBeGreaterThan(first.length);
  });
});
