import { z } from 'zod'
import { UserIdSchema } from '../ids'

/**
 * Who a workspace's work can be handed to.
 *
 * Read by `GET /workspaces/:workspaceId/people`, which any member of the
 * workspace may call — unlike `/members`, which is admin-only by its mount in
 * `app.ts`. The plan is `docs/completions/assignee-picker-plan.md`.
 *
 * ⚠️ **This is deliberately not `MemberSummary`, and it must not become it.**
 * That shape is the admin screen's: it carries `role`, `mustSetPassword`,
 * `deactivatedAt`, `createdAt` and every brand grant with its role. A picker
 * needs a name. Reusing it here would make *who holds a temporary password*
 * readable from the marketing inbox, and the two shapes would then drift in the
 * direction of more fields rather than fewer.
 *
 * Three fields is the contract. A reader who finds `WorkspacePerson` in a
 * feature folder should be able to tell from its size that this route is safe to
 * call from anywhere.
 *
 * `email` is in because it is the label's fallback, not as a contact detail:
 * `personLabel` renders *their name if they set one, else their email*, and most
 * accounts here have no display name. A picker listing blanks is not a picker.
 */
export const WorkspacePersonSchema = z.object({
  id: UserIdSchema,
  displayName: z.string().nullable(),
  email: z.string(),
})
export type WorkspacePerson = z.infer<typeof WorkspacePersonSchema>

export const WorkspacePeopleResponseSchema = z.object({
  people: z.array(WorkspacePersonSchema),
})
export type WorkspacePeopleResponse = z.infer<typeof WorkspacePeopleResponseSchema>
