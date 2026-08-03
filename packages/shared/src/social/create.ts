import { z } from 'zod'
import {
  SocialPostAssetIdsSchema,
  SocialPostBodySchema,
  SocialPlatformSchema,
  SocialPostStatusSchema,
} from './post'

/**
 * The create body is the row minus everything the server owns: `id`,
 * `brandId` (it is in the path), `deletedAt`, `createdAt`, `updatedAt`.
 *
 * Only `platform` is required — a post can be claimed with nothing but a
 * destination. The server defaults the rest: `scheduledAt: null` (the
 * unscheduled tray), `body: ''` (copy pending), `status: 'draft'`,
 * `assetIds: []`. `scheduledAt` also accepts an explicit `null` so "create
 * unscheduled" and "omit the field" are the same statement, not two shapes
 * the server has to reconcile.
 */
export const CreateSocialPostInputSchema = z.object({
  platform: SocialPlatformSchema,
  scheduledAt: z.iso.datetime().nullable().optional(),
  body: SocialPostBodySchema.optional(),
  status: SocialPostStatusSchema.optional(),
  assetIds: SocialPostAssetIdsSchema.optional(),
})

export type CreateSocialPostInput = z.infer<typeof CreateSocialPostInputSchema>
