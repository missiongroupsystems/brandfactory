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

  it("puts the outlet under the brand when the caller is inside one", () => {
    // The same record, two homes. Reached from a brand it has to stay under `/brands/:id`, or
    // opening a location reverts the whole sidebar to the workspace.
    expect(outletHref({ id: "abc", slug: "casa-vostra" }, "/brands/b1/outlets")).toBe(
      "/brands/b1/outlets/casa-vostra",
    );
    expect(outletHref("abc", "/brands/b1/outlets")).toBe("/brands/b1/outlets/abc");
  });

  it("defaults to the workspace-wide list, so no existing caller had to change", () => {
    expect(outletHref("abc")).toBe(outletHref("abc", "/outlets"));
  });
});
