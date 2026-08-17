import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, callJson } from "./bf-client";

/**
 * `callJson` and the two shapes the BrandFactory server refuses in.
 *
 * These exist because the second shape was unhandled for the whole of 1.33.0 and nothing above
 * could see it: the type system cannot describe what a route answers on the failure path, and the
 * one form that posts to this server was never clicked against a running one. The symptom was a
 * form that blamed the network for a complaint about its own input.
 */

const h = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock("@/auth/store", () => ({
  logout: () => h.logout(),
  getAuthToken: () => null,
}));

vi.mock("@/auth/session", () => ({
  getFreshAuthToken: () => Promise.resolve(null),
}));

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("callJson", () => {
  beforeEach(() => h.logout.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("returns the parsed body on 2xx", async () => {
    await expect(callJson<{ id: string }>(json({ id: "b1" }, 200))).resolves.toEqual({ id: "b1" });
  });

  it("reads the error middleware's shape — code and message", async () => {
    // `middleware/error.ts`, which every `HttpError` goes through.
    const err = await callJson(json({ code: "NOT_FOUND", message: "workspace not found" }, 404))
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "NOT_FOUND", message: "workspace not found", status: 404 });
    expect((err as AppError).isNotFound).toBe(true);
  });

  it("reads the zod-validator's shape, which carries no code and no message", async () => {
    // `@hono/zod-validator` answers `c.json(result, 400)` itself and never throws, so the handler
    // above never sees it. zod 4 serialises the error with `issues` as a *JSON string* under
    // `message`, because `issues` is a getter and does not survive `JSON.stringify`.
    const issues = [{ path: ["name"], message: "Too small: expected string to have >=1 characters" }];
    const err = (await callJson(
      json({ success: false, error: { name: "ZodError", message: JSON.stringify(issues) } }, 400),
    ).catch((caught: unknown) => caught)) as AppError;

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("VALIDATION");
    expect(err.isValidation).toBe(true);
    // Named per field: "validation failed" does not say which of three inputs to look at.
    expect(err.message).toBe("name: Too small: expected string to have >=1 characters");
  });

  it("reads a zod 3 style issues array as well", async () => {
    const err = (await callJson(
      json({ success: false, error: { issues: [{ path: ["websiteUrl"], message: "bad url" }] } }, 400),
    ).catch((caught: unknown) => caught)) as AppError;

    expect(err.message).toBe("websiteUrl: bad url");
  });

  it("summarises rather than printing every issue", async () => {
    const issues = [
      { path: ["a"], message: "one" },
      { path: ["b"], message: "two" },
      { path: ["c"], message: "three" },
    ];
    const err = (await callJson(
      json({ success: false, error: { name: "ZodError", message: JSON.stringify(issues) } }, 400),
    ).catch((caught: unknown) => caught)) as AppError;

    expect(err.message).toBe("a: one; b: two; and 1 more");
  });

  it("never throws an empty message", async () => {
    // `res.statusText` is empty over HTTP/2, which is what the Next rewrite speaks. An AppError
    // with no message renders as a blank alert — a form that looks like it did nothing.
    const err = (await callJson(new Response("<html>502</html>", { status: 502 })).catch(
      (caught: unknown) => caught,
    )) as AppError;

    expect(err.message).not.toBe("");
    expect(err.message).toContain("502");
    expect(err.code).toBe("UNKNOWN");
  });

  it("signs out on 401, from any call site rather than only the boot probe", async () => {
    await callJson(json({ code: "UNAUTHORIZED", message: "no" }, 401)).catch(() => undefined);
    expect(h.logout).toHaveBeenCalled();
  });

  it("does not sign out on a 403, which is a live session being refused", async () => {
    await callJson(json({ code: "FORBIDDEN", message: "no" }, 403)).catch(() => undefined);
    expect(h.logout).not.toHaveBeenCalled();
  });
});
