import type {
  CreateMarketingRequestInput,
  MarketingRequest,
  UpdateMarketingRequestInput,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Marketing Requests — read and written against the Hono server (MKT-5, Phase 2).
 *
 * **Workspace-scoped, because the record is.** Every route sits under
 * `/workspaces/:workspaceId/marketing-requests`, the outlets shape, and `bf` checks each path
 * against the server's route tree at compile time.
 *
 * **There is no public submit any more.** The sample's `/f/request` page posted with no token to
 * an Ops path; the product decision for MKT-5 is signed-in users only, so `/f/request` now
 * redirects into the app and the requester comes from the session on the server. A body here
 * never names who sent it.
 */
export const requestService = {
  /** Every live request, newest first. A plain array — the inbox counts each rung over it. */
  list: async (workspaceId: string): Promise<MarketingRequest[]> =>
    callJson<MarketingRequest[]>(
      await bf.workspaces[":workspaceId"]["marketing-requests"].$get({ param: { workspaceId } }),
    ),

  /** Answers `201` with the row, number and requester included. */
  create: async (
    workspaceId: string,
    input: CreateMarketingRequestInput,
  ): Promise<MarketingRequest> =>
    callJson<MarketingRequest>(
      await bf.workspaces[":workspaceId"]["marketing-requests"].$post({
        param: { workspaceId },
        json: input,
      }),
    ),

  /** A real partial patch: an omitted key is left alone and `null` clears it. */
  update: async (
    workspaceId: string,
    requestId: string,
    input: UpdateMarketingRequestInput,
  ): Promise<MarketingRequest> =>
    callJson<MarketingRequest>(
      await bf.workspaces[":workspaceId"]["marketing-requests"][":requestId"].$patch({
        param: { workspaceId, requestId },
        json: input,
      }),
    ),
};
