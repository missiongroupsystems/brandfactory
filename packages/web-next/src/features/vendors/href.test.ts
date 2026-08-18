import { describe, expect, it } from "vitest";

import { vendorHref } from "./href";

describe("vendorHref", () => {
  it("prefers the slug, which is what makes the URL readable", () => {
    expect(vendorHref({ id: "0198e1c4-…", slug: "northlight-talent-pte-ltd" })).toBe(
      "/vendors/northlight-talent-pte-ltd",
    );
  });

  it("falls back to the id when the slug is empty", () => {
    // The route resolves either, so a record that somehow arrived without a slug
    // still has a page rather than a link to `/vendors/`.
    expect(vendorHref({ id: "abc", slug: "" })).toBe("/vendors/abc");
  });

  it("takes a bare ref, so a caller holding only an id does not have to branch", () => {
    expect(vendorHref("abc")).toBe("/vendors/abc");
  });
});
