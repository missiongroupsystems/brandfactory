import { describe, expect, it } from "vitest";

import { normalizeWebsiteUrl } from "./website-url";

describe("normalizeWebsiteUrl", () => {
  it("adds the scheme people leave off", () => {
    expect(normalizeWebsiteUrl("casavostra.com")).toEqual({
      ok: true,
      value: "https://casavostra.com",
    });
  });

  it("treats an empty field as no website, not as an error", () => {
    // It is how every brand without one submits.
    expect(normalizeWebsiteUrl("   ")).toEqual({ ok: true, value: null });
  });

  it("never rewrites a value that already carries a scheme", () => {
    // The whole reason `HAS_SCHEME` is broader than http/https: a bad scheme has to survive to
    // be *rejected* rather than be prefixed into `https://javascript:alert(1)`, which would
    // parse and reach an href.
    const result = normalizeWebsiteUrl("javascript:alert(1)");
    expect(result.ok).toBe(false);
  });

  it("keeps http as well as https", () => {
    expect(normalizeWebsiteUrl("http://example.com")).toEqual({
      ok: true,
      value: "http://example.com",
    });
  });
});
