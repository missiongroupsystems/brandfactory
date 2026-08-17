import type { CreateOutletInput, Outlet, UpdateOutletInput } from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Outlets — the places the brand trades from, read and written against the Hono
 * server.
 *
 * **Not to be confused with `features/registry/`**, which is the Operations Hub's
 * outlet: a different shape (snake_case, `entity_id`, `attributes` from a
 * reference endpoint), a different backend (the fixtures in `lib/api/mock.ts`)
 * and a different lifetime. The two share the word and nothing else, exactly as
 * `features/brands` and `features/registry-brands` do. That folder kept the
 * `/outlets` screens until this one needed them; twenty-six files across fourteen
 * cut-from-nav Ops areas still resolve an `outlet_id` to a name through its
 * `useOutletIndex`, which is why it stays.
 *
 * **Workspace-scoped, because the record is.** `GET /workspaces/:workspaceId/
 * outlets` is the only list route; there is no `GET /outlets`. An outlet's brand
 * is a nullable column, not its parent — see `outlet/outlet.ts` in
 * `@brandfactory/shared` for why.
 *
 * The paths below are checked against the server's own route tree at compile time
 * — `bf` is `hc<AppType>`, and `AppType` is inferred from the chained `.route()`
 * calls in `packages/server/src/app.ts`. A renamed segment is a type error here,
 * not a 404 in a browser.
 */
export const outletService = {
  /**
   * Every outlet in the workspace, in name order.
   *
   * **A plain array, not a page.** The route returns one — there is no cursor and
   * nothing to exhaust, the same shape `brandService.list` has. The Ops sibling
   * of this function walks pages through `listEvery` and the screen above it
   * accumulates them with `useCursorPages`; neither applies here, and copying
   * either would be a loop waiting for a `next_cursor` that never arrives.
   *
   * It is also why the filters on that screen run client-side: the client holds
   * the whole set, so a filtered count is a true count and a group is a whole
   * group.
   */
  list: async (workspaceId: string): Promise<Outlet[]> =>
    callJson<Outlet[]>(await bf.workspaces[":workspaceId"].outlets.$get({ param: { workspaceId } })),

  /**
   * One outlet by **slug or id**. `GET /workspaces/:id/outlets/:ref` resolves
   * either, which is what lets `outletHref` emit the readable form when it holds
   * the record and the bare id when it does not.
   */
  get: async (workspaceId: string, outletRef: string): Promise<Outlet> =>
    callJson<Outlet>(
      await bf.workspaces[":workspaceId"].outlets[":outletRef"].$get({
        param: { workspaceId, outletRef },
      }),
    ),

  /** Answers `201` with the row, slug and all — the slug is chosen server-side. */
  create: async (workspaceId: string, input: CreateOutletInput): Promise<Outlet> =>
    callJson<Outlet>(
      await bf.workspaces[":workspaceId"].outlets.$post({ param: { workspaceId }, json: input }),
    ),

  /**
   * A real partial patch — unlike `PATCH /brands/:id/guidelines`, which takes a
   * complete list and deletes what it is not sent. An omitted key here is left
   * alone and an explicit `null` clears it, so there is no read-before-write to
   * do and no window in which a concurrent change is lost.
   */
  update: async (
    workspaceId: string,
    outletId: string,
    input: UpdateOutletInput,
  ): Promise<Outlet> =>
    callJson<Outlet>(
      await bf.workspaces[":workspaceId"].outlets[":outletRef"].$patch({
        param: { workspaceId, outletRef: outletId },
        json: input,
      }),
    ),

  /** Hard delete, answering with the row that went. */
  remove: async (workspaceId: string, outletId: string): Promise<Outlet> =>
    callJson<Outlet>(
      await bf.workspaces[":workspaceId"].outlets[":outletRef"].$delete({
        param: { workspaceId, outletRef: outletId },
      }),
    ),
};
