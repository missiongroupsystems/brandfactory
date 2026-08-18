import { describe, expect, it } from "vitest";

import { influencerHref } from "./href";

describe("influencerHref", () => {
  it("prefers the slug, which is what makes the URL readable", () => {
    expect(influencerHref({ id: "0198e1c4-…", slug: "priyaskin" })).toBe("/influencers/priyaskin");
  });

  it("falls back to the id when the slug is empty", () => {
    // The route resolves either, so a record that somehow arrived without a slug
    // still has a page rather than a link to `/influencers/`.
    expect(influencerHref({ id: "abc", slug: "" })).toBe("/influencers/abc");
  });

  it("takes a bare ref, so a caller holding only an id does not have to branch", () => {
    expect(influencerHref("abc")).toBe("/influencers/abc");
  });
});
