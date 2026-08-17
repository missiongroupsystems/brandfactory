import type { Workspace } from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Workspaces — the top of the aggregate. A brand belongs to one, a project belongs to a brand,
 * and every authorization check in `packages/server/src/authz.ts` walks up to here.
 *
 * **The service layer for the real API, and the same shape as every Ops one beside it**:
 * `api.ts` is the only file that talks to the transport, `hooks.ts` is the only thing
 * components call. What differs is which transport — `bf` rather than `apiFetch` — and that
 * the response type comes from `@brandfactory/shared` rather than from a generated OpenAPI
 * document.
 *
 * `GET /workspaces` currently returns **every** workspace to any signed-in user (1.29.0's
 * interim shared-access model), not the ones you own. That is the server's decision and it
 * changes when Passport scopes the list by org membership; nothing here needs to move when it
 * does.
 */
export const workspaceService = {
  list: async (): Promise<Workspace[]> => callJson<Workspace[]>(await bf.workspaces.$get()),
};
