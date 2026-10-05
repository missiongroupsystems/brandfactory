import { WorkspaceIdSchema } from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { UnauthorizedError } from '../errors'

export interface PeopleDeps {
  db: Db
}

/**
 * Who a workspace's work can be handed to. One route, one read, three fields.
 * The plan is `docs/completions/assignee-picker-plan.md`.
 *
 * ⚠️ **This exists because `/members` is admin-only by its mount**, and that
 * mount is deliberately the whole rule — `app.ts` says *"there is no per-route
 * check in `routes/members.ts` to forget."* An assignee picker fed from
 * `GET /members` would work today only because every one of the nine current
 * users is an administrator, and it would be wrong twice:
 *
 *  - **It over-shares.** `MemberSummary` carries `role`, `mustSetPassword`,
 *    `deactivatedAt`, `createdAt` and every brand grant with its role. A picker
 *    needs a name. It would make *who holds a temporary password* readable from
 *    the marketing inbox.
 *  - **It breaks on the case the members work was built for.** The stated reason
 *    for that work is that the tenth person can be added as a *member* with two
 *    brands rather than an administrator with seven. That person would get a 403
 *    here, and the inbox they were added to work in could hand them nothing.
 *
 * So: a separate route, outside that prefix, returning `WorkspacePerson`.
 *
 * ⚠️ **Do not move this under `/members` to group the two people routes.** The
 * admin gate is mounted on that whole prefix, so a non-admin route there needs
 * the first per-route exception in that file and the next reader of the mount
 * would believe something false. `routes/members.ts` carries the mirror-image
 * warning — *"No self-service route may be added here"* — for the same reason.
 *
 * **`requireWorkspaceAccess` is the whole gate**, which for this read is the
 * right one: the answer is *who else works here*, and anybody who reaches the
 * workspace may ask it. There is no narrower truthful gate — see
 * `listActivePeople`, which has no workspace predicate because there is no
 * `user_workspaces` table.
 *
 * **Router-degradation check** (`routes/assets.ts`): `:workspaceId/people` sits
 * beside the other literal segments under `/workspaces`, and has no children.
 * No literal sits where a sibling has a param.
 */
export function createWorkspacePeopleRouter(deps: PeopleDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })

  return new Hono<AppEnv>().get(
    '/:workspaceId/people',
    zValidator('param', WorkspaceParam),
    async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      const people = await deps.db.listActivePeople()
      return c.json({ people })
    },
  )
}
