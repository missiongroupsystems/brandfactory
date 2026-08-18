import { z } from 'zod'
import {
  InfluencerAccountsSchema,
  InfluencerBrandIdsSchema,
  InfluencerNameSchema,
  InfluencerNotesSchema,
  InfluencerStatusSchema,
  InfluencerVerticalSchema,
} from './influencer'

/**
 * The create body is the row minus everything the server owns: `id`,
 * `workspaceId` (it is in the path), `slug` (derived from the name — see
 * `uniqueInfluencerSlug`), `createdAt`, `updatedAt`.
 *
 * **`name` and `accounts` are both required**, and the second one carries what
 * used to be four required top-level fields. A creator with no account cannot be
 * found again, cannot be reached, and has no reach figure — and a row with no
 * reach figure would fall out of the tier grouping, which is the one thing a
 * total grouping may not do.
 *
 * The cost is stated rather than dodged: a follower count has to be looked up per
 * account before the row can be saved. That is the honest requirement — the
 * alternative is a nullable column and an unknown tier, and the value nobody
 * looked up would then be the value on the screen.
 *
 * **The first account is the one the creator is known by.** The form sends the
 * list in the order somebody arranged it and the server writes those positions
 * unchanged; there is no primary flag to set.
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
  accounts: InfluencerAccountsSchema,
  status: InfluencerStatusSchema.default('prospect'),
  vertical: InfluencerVerticalSchema.nullable().optional(),
  brandIds: InfluencerBrandIdsSchema.optional(),
  notes: InfluencerNotesSchema.nullable().optional(),
})

export type CreateInfluencerInput = z.infer<typeof CreateInfluencerInputSchema>
