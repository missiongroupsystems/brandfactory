import { describe, expect, it } from "vitest";

import { resolveMock } from "./mock";

/**
 * The mock's **routing rules**, and one of them is a guard rather than a feature.
 *
 * Rule 3 — an unregistered mutation refuses with a 503 — is the promise that no screen in this
 * app can look like it saved something when nothing was stored. It had one exception while
 * Marketing Requests was a sample; MKT-5 Phase 2 moved that screen to the Hono server and the
 * exception went with it. The test below asserts the old write paths refuse like every other
 * mutation, so the exception cannot come back by accident.
 *
 * These are transport-level rules with no rendering, which is precisely the class of thing a
 * browser pass cannot show you.
 */
describe("reads", () => {
  it("answers a registered GET from its fixture", () => {
    const result = resolveMock("GET", "/brands");

    expect(result.ok).toBe(true);
    // `/brands` answers a page; a non-empty one proves the fixture, not rule 2's empty value.
    expect((result.ok && (result.body as { items: unknown[] }).items.length) || 0).toBeGreaterThan(
      0,
    );
  });

  it("answers an unregistered GET with the both-shapes empty value", () => {
    const result = resolveMock("GET", "/nothing-here");

    expect(result).toMatchObject({ ok: true });
    // Satisfies `T[]` and `Page<T>` at once — rule 2, and the reason fifteen unfixtured areas
    // render their real empty states instead of throwing.
    const body = result.ok ? (result.body as unknown[] & { items: unknown[] }) : null;
    expect(body).toHaveLength(0);
    expect(body?.items).toEqual([]);
  });
});

describe("writes", () => {
  it("refuses an unregistered mutation with a 503 and says why", () => {
    const result = resolveMock("POST", "/outlets", { name: "New outlet" });

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(result.ok === false && result.detail).toMatch(/nothing is stored/i);
  });

  it("refuses every mutation, the old Marketing Requests paths included", () => {
    for (const [method, path] of [
      ["POST", "/forms/marketing-request/submissions"],
      ["POST", "/public/forms/request/submissions"],
      ["PATCH", "/forms/submissions/MR-1033"],
      ["DELETE", "/brands"],
    ] as const) {
      expect(resolveMock(method, path, { payload: {} }), `${method} ${path}`).toMatchObject({
        ok: false,
        status: 503,
      });
    }
  });

  it("no longer answers the sample inbox's read from a fixture", () => {
    // Rule 2 answers it empty: the screen reads the Hono server, and a fixture here would be a
    // second source for one table.
    const result = resolveMock("GET", "/forms/marketing-request/submissions");
    expect(result.ok && (result.body as unknown[]).length).toBe(0);
  });
});
