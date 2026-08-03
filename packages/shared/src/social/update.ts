import { z } from 'zod'
import {
  SocialPostAssetIdsSchema,
  SocialPostBodySchema,
  SocialPlatformSchema,
  SocialPostStatusSchema,
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
export const UpdateSocialPostInputSchema = z
  .object({
    platform: SocialPlatformSchema.optional(),
    scheduledAt: z.iso.datetime().nullable().optional(),
    body: SocialPostBodySchema.optional(),
    status: SocialPostStatusSchema.optional(),
    assetIds: SocialPostAssetIdsSchema.optional(),
  })
  .refine(
    (v) =>
      v.platform !== undefined ||
      v.scheduledAt !== undefined ||
      v.body !== undefined ||
      v.status !== undefined ||
      v.assetIds !== undefined,
    { message: 'At least one of platform, scheduledAt, body, status or assetIds is required' },
  )

export type UpdateSocialPostInput = z.infer<typeof UpdateSocialPostInputSchema>
