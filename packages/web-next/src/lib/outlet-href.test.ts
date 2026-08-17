import { describe, expect, it } from "vitest";

import { outletHref } from "./outlet-href";

describe("outletHref", () => {
  it("prefers the readable slug when the caller holds the record", () => {
    expect(outletHref({ id: "0198…", slug: "casa-vostra" })).toBe("/outlets/casa-vostra");
  });

  it("falls back to the id when the slug is empty", () => {
    // Not a state the server can produce — `slug` is NOT NULL and generated —
    // but the fallback is what makes the link survive a record that arrived any
    // other way. A `/outlets/` with nothing after it is a 404 nobody can debug.
    expect(outletHref({ id: "abc", slug: "" })).toBe("/outlets/abc");
  });

  it("accepts a bare id, for a caller that holds only that", () => {
    expect(outletHref("abc")).toBe("/outlets/abc");
  });
});
