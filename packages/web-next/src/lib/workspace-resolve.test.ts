import type { Workspace } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { resolveLandingWorkspaceId } from "./workspace-resolve";

function workspace(id: string, createdAt: string): Workspace {
  return {
    id,
    name: id,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    createdAt,
    updatedAt: createdAt,
  } as Workspace;
}

describe("resolveLandingWorkspaceId", () => {
  const older = workspace("ws-older", "2026-01-01T00:00:00.000Z");
  const newer = workspace("ws-newer", "2026-06-01T00:00:00.000Z");

  it("prefers the last used one", () => {
    expect(resolveLandingWorkspaceId([older, newer], "ws-newer")).toBe("ws-newer");
  });

  it("discards a stored id that is not in the list", () => {
    // A workspace deleted, or a different user signed in on the same browser. Resolving it
    // would put the shell somewhere it cannot fetch.
    expect(resolveLandingWorkspaceId([older, newer], "ws-gone")).toBe("ws-older");
  });

  it("falls back to the oldest by createdAt, not to list order", () => {
    // The API's ordering is not a promise. Sorting here is what stops tomorrow's query plan
    // from moving somebody to a different workspace.
    expect(resolveLandingWorkspaceId([newer, older], null)).toBe("ws-older");
  });

  it("is null on an empty list", () => {
    // First run, before any workspace exists. Distinct from "we have not loaded yet", which the
    // caller reports separately — see `useActiveWorkspace`.
    expect(resolveLandingWorkspaceId([], "ws-older")).toBeNull();
  });
});
