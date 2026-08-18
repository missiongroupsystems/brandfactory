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
 * Partial influencer patch. At least one key must be present so a bare `{}` is
 * rejected at the wire rather than becoming a no-op write — the rule
 * `UpdateOutletInputSchema`, `UpdateBrandInputSchema` and
 * `UpdateSocialPostInputSchema` all carry.
 *
 * **`slug` is deliberately absent**, as it is on an outlet. It is derived at
 * create and frozen after, which is the whole reason a link written today survives
 * a rename. Letting a patch move it would break every URL already shared and hand
 * the client a uniqueness rule only the query layer can enforce.
 *
 * **`handle` and `platform` are patchable, and the slug still does not follow.**
 * A typo in a handle is exactly the thing a patch is for, and a creator who moves
 * an account between platforms is a real correction. So `/influencers/priyaskin`
 * can end up pointing at `@priyaskincare` — which is the same trade every renamed
 * outlet already makes, and the alternative is a URL that rots every time somebody
 * fixes a spelling.
 *
 * `brandIds` is a **full replacement**, not an add/remove pair. What a person means
 * by ticking brands is *these are the brands*, so there is no merge for two writers
 * to disagree about — the same call `attributes` makes on an outlet and `assetIds`
 * on a social post.
 *
 * The nullable keys — engagement rate, vertical and notes — clear on an explicit
 * `null` and are left alone on omission. `name`, `handle`, `platform`, `followers`
 * and `status` are not nullable: a creator always has all five.
 */
export const UpdateInfluencerInputSchema = z
  .object({
    name: InfluencerNameSchema.optional(),
    handle: InfluencerHandleSchema.optional(),
    platform: InfluencerPlatformSchema.optional(),
    followers: InfluencerFollowersSchema.optional(),
    status: InfluencerStatusSchema.optional(),
    engagementRate: InfluencerEngagementRateSchema.nullable().optional(),
    vertical: InfluencerVerticalSchema.nullable().optional(),
    brandIds: InfluencerBrandIdsSchema.optional(),
    notes: InfluencerNotesSchema.nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one field is required',
  })

export type UpdateInfluencerInput = z.infer<typeof UpdateInfluencerInputSchema>
