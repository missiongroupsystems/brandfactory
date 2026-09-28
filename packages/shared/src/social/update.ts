import { z } from 'zod'
import { SocialPostIdSchema } from '../ids'
import {
  SocialPostAssetIdsSchema,
  SocialPostBodySchema,
  SocialPlatformSchema,
  SocialPostHookSchema,
  SocialPostPlanFieldSchema,
  SocialPostStatusSchema,
  SocialPostUrlSchema,
} from './post'

/**
 * Partial post patch. At least one key must be present so a bare `{}` is
 * rejected at the wire rather than becoming a no-op write — the same rule
 * `UpdateBrandInputSchema` and `UpdateBrandAssetInputSchema` carry.
 *
 * `scheduledAt` is the one **nullable** patch key: `null` moves the post to
 * the unscheduled tray, omission leaves the slot alone. Nothing else here is
 * clearable — a post always has a platform, a status and a (possibly empty)
 * body.
 *
 * `assetIds` is a **full replacement**, order = array order. Add/remove/
 * reorder are all the same verb, which is what keeps the join table an
 * implementation detail of the query layer.
 *
 * `deletedAt` is deliberately absent — deletion is its own verb
 * (DELETE / POST :postId/restore), never a patch.
 */
const PATCHABLE = [
  'platform',
  'scheduledAt',
  'body',
  'status',
  'assetIds',
  'format',
  'hook',
  'dish',
  'talent',
  'filmedBy',
  'canvaUrl',
  'clearedWith',
  'shootId',
  'eventsEventId',
] as const

export const UpdateSocialPostInputSchema = z
  .object({
    platform: SocialPlatformSchema.optional(),
    scheduledAt: z.iso.datetime().nullable().optional(),
    body: SocialPostBodySchema.optional(),
    status: SocialPostStatusSchema.optional(),
    assetIds: SocialPostAssetIdsSchema.optional(),

    /**
     * Every plan field is nullable here as well as optional, unlike `body`:
     * omission leaves it alone and `null` clears it. A hook that turned out to
     * be wrong has to be erasable, and `''` would be a second way to say the
     * same thing.
     */
    format: SocialPostPlanFieldSchema.optional(),
    hook: SocialPostHookSchema.optional(),
    dish: SocialPostPlanFieldSchema.optional(),
    talent: SocialPostPlanFieldSchema.optional(),
    filmedBy: SocialPostPlanFieldSchema.optional(),
    canvaUrl: SocialPostUrlSchema.optional(),
    clearedWith: SocialPostPlanFieldSchema.optional(),
    shootId: SocialPostIdSchema.nullable().optional(),
    eventsEventId: z.uuid().nullable().optional(),
  })
  // `kind` is deliberately absent: a shoot does not become a post. Delete it
  // and write the other, the way `createdBy` is a fact about creation.
  //
  // `approvedAt` and `approvedBy` are absent because the server stamps them —
  // a client that could set its own approval would make the stamp worthless.
  .refine((v) => PATCHABLE.some((k) => v[k] !== undefined), {
    message: `At least one of ${PATCHABLE.join(', ')} is required`,
  })

export type UpdateSocialPostInput = z.infer<typeof UpdateSocialPostInputSchema>
