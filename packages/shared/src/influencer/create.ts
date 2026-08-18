import { z } from 'zod'
import {
  InfluencerBrandIdsSchema,
  InfluencerEngagementRateSchema,
  InfluencerFollowersSchema,
  InfluencerHandleSchema,
  InfluencerNameSchema,
  InfluencerNotesSchema,
  InfluencerPlatformSchema,
  InfluencerStatusSchema,
  InfluencerVerticalSchema,
} from './influencer'

/**
 * The create body is the row minus everything the server owns: `id`,
 * `workspaceId` (it is in the path), `slug` (derived from the handle — see
 * `uniqueInfluencerSlug`), `createdAt`, `updatedAt`.
 *
 * **`name`, `handle`, `platform` and `followers` are all required**, which is one
 * more than outlets asks for and is the shape of the record rather than an
 * oversight. A creator with no handle cannot be found again, a handle with no
 * platform does not identify an account, and a reach figure is what the whole
 * screen sorts, groups and counts by — a row with no follower count would fall
 * out of the tier grouping, which is the one thing a total grouping may not do.
 *
 * The cost is stated rather than dodged: a follower count has to be looked up
 * before the row can be saved. That is the honest requirement — the alternative is
 * a nullable column and an unknown tier, and the value nobody looked up would then
 * be the value on the screen.
 *
 * `status` defaults to `prospect`, not `active`. A creator somebody has just
 * entered is on a shortlist; nobody has booked them yet.
 *
 * `brandIds` defaults to empty, which is the same statement as omitting it: not
 * engaged yet. Every id in it is checked against the workspace, and the route
 * turns a miss into a 400 `BRAND_NOT_IN_WORKSPACE`.
 */
export const CreateInfluencerInputSchema = z.object({
  name: InfluencerNameSchema,
  handle: InfluencerHandleSchema,
  platform: InfluencerPlatformSchema,
  followers: InfluencerFollowersSchema,
  status: InfluencerStatusSchema.default('prospect'),
  engagementRate: InfluencerEngagementRateSchema.nullable().optional(),
  vertical: InfluencerVerticalSchema.nullable().optional(),
  brandIds: InfluencerBrandIdsSchema.optional(),
  notes: InfluencerNotesSchema.nullable().optional(),
})

export type CreateInfluencerInput = z.infer<typeof CreateInfluencerInputSchema>
