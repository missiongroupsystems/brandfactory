import { z } from 'zod'
import { UserIdSchema, WorkspaceIdSchema } from '../ids'

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().min(1).max(120),
  ownerUserId: UserIdSchema,
  /**
   * Does Mission Passport know about this workspace as an organisation?
   *
   * Same meaning and same reasoning as `Brand.linkedToPassport`. `false` is a usable state:
   * a workspace created here before a super admin created the matching organisation.
   *
   * Note the access consequence, which differs from a brand's (plan phase 8d): an
   * **unlinked workspace is visible to its creator only**, because there is no organisation
   * to scope membership against and the alternative would be "every authenticated user".
   */
  linkedToPassport: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Workspace = z.infer<typeof WorkspaceSchema>
