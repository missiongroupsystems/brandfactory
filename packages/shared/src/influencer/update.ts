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
 * **`name` is patchable and the slug does not follow.** A misspelled name is
 * exactly the thing a patch is for, so `/influencers/priya-raman` can end up
 * pointing at a record that now reads *Priya Nair* — the same trade every renamed
 * outlet already makes, and the alternative is a URL that rots every time somebody
 * fixes a spelling.
 *
 * **`accounts` is a full replacement**, not an add/remove pair, and so is
 * `brandIds`. What a person means by submitting the list is *these are the
 * accounts*, so there is no merge for two writers to disagree about — the same
 * call `attributes` makes on an outlet and `contacts` on a vendor. An omitted
 * `accounts` leaves every existing account alone, which is what makes a patch of
 * `notes` alone safe.
 *
 * There is no way to send an empty account list: `InfluencerAccountsSchema` is
 * `.min(1)`, so the patch that unsets every account is a delete of the creator.
 *
 * The nullable keys — vertical and notes — clear on an explicit `null` and are
 * left alone on omission. `name` and `status` are not nullable: a creator always
 * has both.
 */
export const UpdateInfluencerInputSchema = z
  .object({
    name: InfluencerNameSchema.optional(),
    accounts: InfluencerAccountsSchema.optional(),
    status: InfluencerStatusSchema.optional(),
    vertical: InfluencerVerticalSchema.nullable().optional(),
    brandIds: InfluencerBrandIdsSchema.optional(),
    notes: InfluencerNotesSchema.nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one field is required',
  })

export type UpdateInfluencerInput = z.infer<typeof UpdateInfluencerInputSchema>
