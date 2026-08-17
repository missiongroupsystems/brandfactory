import { describe, expect, it } from "vitest";

import { resolveMock } from "./mock";

/**
 * The mock's **routing rules**, and one of them is a guard rather than a feature.
 *
 * Rule 3 — an unregistered mutation refuses with a 503 — is the promise that no screen in this
 * app can look like it saved something when nothing was stored. Marketing Requests is the single
 * exception to it, and an exception is exactly the kind of thing that widens by accident: the
 * next person adding a fixture route has no reason to notice which list they put it in. So both
 * halves are asserted here, together, and a change that turns the blanket 503 into a blanket
 * success fails this file rather than shipping a form that lies.
 *
 * These are transport-level rules with no rendering, which is precisely the class of thing a
 * browser pass cannot show you.
 */
describe("reads", () => {
  it("answers a registered GET from its fixture", () => {
    const result = resolveMock("GET", "/forms/marketing-request/submissions");

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.ok && result.body)).toBe(true);
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

  it("refuses a registered path under the wrong verb", () => {
    // The verb is matched, not just the path — otherwise a DELETE would fall through the POST
    // route's regex and appear to succeed.
    expect(resolveMock("DELETE", "/forms/marketing-request/submissions")).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("accepts the in-app submit and returns the created row", () => {
    const result = resolveMock("POST", "/forms/marketing-request/submissions", {
      payload: { Summary: "From the sheet", "Requested by": "Marcus Tan" },
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.body).toMatchObject({
      status: "new",
      summary: "From the sheet",
      submitter: "Marcus Tan",
    });
  });

  it("accepts the public submit and returns only a reference", () => {
    const result = resolveMock("POST", "/public/forms/request/submissions", {
      payload: { Summary: "From the public page" },
    });

    // A public submitter gets the receipt and nothing internal — no id, no status, no payload.
    expect(result.ok && Object.keys(result.body as object)).toEqual(["reference"]);
  });

  it("survives a submit whose body is not the {payload} envelope", () => {
    const result = resolveMock("POST", "/forms/marketing-request/submissions", "not json");

    expect(result.ok).toBe(true);
    expect(result.ok && result.body).toMatchObject({ summary: "(no summary)" });
  });

  it("moves a status, and 404s on an id it does not hold", () => {
    const created = resolveMock("POST", "/forms/marketing-request/submissions", {
      payload: { Summary: "To be resolved" },
    });
    const id = created.ok ? (created.body as { id: string }).id : "";

    expect(resolveMock("PATCH", `/forms/submissions/${id}`, { status: "resolved" })).toMatchObject({
      ok: true,
      body: { status: "resolved" },
    });
    expect(resolveMock("PATCH", "/forms/submissions/MR-nope", { status: "resolved" })).toMatchObject(
      { ok: false, status: 404 },
    );
  });

  it("falls back to New rather than writing a status the enum does not have", () => {
    const created = resolveMock("POST", "/forms/marketing-request/submissions", {
      payload: { Summary: "Bad status incoming" },
    });
    const id = created.ok ? (created.body as { id: string }).id : "";

    expect(resolveMock("PATCH", `/forms/submissions/${id}`, { status: "banana" })).toMatchObject({
      ok: true,
      body: { status: "new" },
    });
  });
});
