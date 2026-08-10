import { z } from 'zod'
import {
  SocialPostAssetIdsSchema,
  SocialPostBodySchema,
  SocialPlatformSchema,
  SocialPostCreatedBySchema,
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
  /**
   * Who is writing this row. `.default('user')` rather than `.optional()`, the
   * `UpdateBrandGuidelinesSectionInput` precedent: the same field, on the same
   * kind of input, with the same default and for the same reason — a payload
   * that omits the key means *a person wrote this*, which is what every client
   * written before the planner existed meant.
   *
   * The default also means the value is present by the time the query layer
   * reads it, so there is no third place deciding what an absent author is.
   *
   * **Deliberately absent from the patch schema.** Provenance is a fact about
   * creation, and editing a post the planner wrote does not make the editor its
   * author — it makes them its reviewer, which is what `status: 'ready'`
   * records.
   */
  createdBy: SocialPostCreatedBySchema.default('user'),
  assetIds: SocialPostAssetIdsSchema.optional(),
})

export type CreateSocialPostInput = z.infer<typeof CreateSocialPostInputSchema>
