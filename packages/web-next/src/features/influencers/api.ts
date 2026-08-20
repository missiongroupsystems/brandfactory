import type {
  CreateInfluencerInput,
  Influencer,
  LookupInfluencerInput,
  LookupInfluencerResult,
  UpdateInfluencerInput,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Influencers — the creators the brands engage, read and written against the Hono server.
 *
 * **This file used to call `lib/api/mock.ts`.** The route was this app's own invention answered
 * from `fixtures/influencers.ts`, and its docstring said what that cost: nothing was stored, a
 * mutation refused with a 503, and the shape was safe only because no server existed to disagree
 * with it. All three are now false. The fixture is deleted, the `/influencers` branch is out of
 * `mock.ts`, and the type lives in `@brandfactory/shared` where the server parses against it.
 *
 * **Not to be confused with `features/contacts/`**, which is the Operations Hub's address book:
 * `ContactRead`, snake_case, a `vendor_id`, a FastAPI service this repository does not contain.
 * It is still live — `useContactMutations` runs on the tenancy intake sheet and the review
 * queue — and it is still correct for a landlord's site manager. The two share nothing but the
 * fact that both rows are people. The same split `features/outlets` and `features/registry` have.
 *
 * **Workspace-scoped, because the record is.** `GET /workspaces/:workspaceId/influencers` is the
 * only list route; there is no `GET /influencers`. A creator's brands are a join table, not their
 * parent — see `influencer/influencer.ts` in `@brandfactory/shared` for why.
 *
 * The paths below are checked against the server's own route tree at compile time — `bf` is
 * `hc<AppType>`, and `AppType` is inferred from the chained `.route()` calls in
 * `packages/server/src/app.ts`. A renamed segment is a type error here, not a 404 in a browser.
 */
export const influencerService = {
  /**
   * Every creator in the workspace, biggest reach first.
   *
   * **A plain array, not a page, and no filter parameters at all.** The route returns one array —
   * there is no cursor to exhaust and nothing on the server to narrow. `InfluencerFilters`,
   * `cursor` and `limit` are gone with `useInfluencerPages`.
   *
   * That is what makes the screen's tier bands honest: it holds the whole roster, so a band's
   * count is the tier's count rather than the count of what happened to be fetched. The note the
   * old screen printed above the table — *"Showing the first N creators — bands below may be
   * incomplete"* — was built in order to be deleted here.
   */
  list: async (workspaceId: string): Promise<Influencer[]> =>
    callJson<Influencer[]>(
      await bf.workspaces[":workspaceId"].influencers.$get({ param: { workspaceId } }),
    ),

  /**
   * One creator by **slug or id**. `GET /workspaces/:id/influencers/:ref` resolves either, which
   * is what lets a link emit the readable form when it holds the record and the bare id when it
   * does not.
   */
  get: async (workspaceId: string, influencerRef: string): Promise<Influencer> =>
    callJson<Influencer>(
      await bf.workspaces[":workspaceId"].influencers[":influencerRef"].$get({
        param: { workspaceId, influencerRef },
      }),
    ),

  /** Answers `201` with the row, slug and all — the slug is chosen server-side from the handle. */
  create: async (workspaceId: string, input: CreateInfluencerInput): Promise<Influencer> =>
    callJson<Influencer>(
      await bf.workspaces[":workspaceId"].influencers.$post({
        param: { workspaceId },
        json: input,
      }),
    ),

  /**
   * A real partial patch: an omitted key is left alone and an explicit `null` clears it, so there
   * is no read-before-write to do.
   *
   * `brandIds` is the exception and is a **full replacement** — the client holds the whole set and
   * sends the whole set, the same call `attributes` makes on an outlet.
   */
  update: async (
    workspaceId: string,
    influencerId: string,
    input: UpdateInfluencerInput,
  ): Promise<Influencer> =>
    callJson<Influencer>(
      await bf.workspaces[":workspaceId"].influencers[":influencerRef"].$patch({
        param: { workspaceId, influencerRef: influencerId },
        json: input,
      }),
    ),

  /**
   * Quick add's lookup — a platform and a handle in, a draft out.
   *
   * **It writes nothing**, which is why it is safe to retry and why it answers `200` rather than
   * `201`. A creator who could not be found comes back as `outcome: "not-found"` in the body, not
   * as a failed request: it is an answer about a creator rather than a fault the client can act on
   * by retrying. `callJson` therefore throws only on a real refusal — a 400 on the body, a 503
   * where the deployment has no search-grounded model, a 5xx.
   *
   * The platform is `LookupPlatform`, which is five of the record's six: XiaoHongShu is excluded
   * because the spike could not name a single creator on it and the one model that retrieved
   * nothing produced the most convincing answers there. See `LOOKUP_PLATFORMS`.
   */
  lookup: async (
    workspaceId: string,
    input: LookupInfluencerInput,
  ): Promise<LookupInfluencerResult> =>
    callJson<LookupInfluencerResult>(
      await bf.workspaces[":workspaceId"].influencers.lookup.$post({
        param: { workspaceId },
        json: input,
      }),
    ),

  /** Hard delete, answering with the row that went — brand links included. */
  remove: async (workspaceId: string, influencerId: string): Promise<Influencer> =>
    callJson<Influencer>(
      await bf.workspaces[":workspaceId"].influencers[":influencerRef"].$delete({
        param: { workspaceId, influencerRef: influencerId },
      }),
    ),
};
