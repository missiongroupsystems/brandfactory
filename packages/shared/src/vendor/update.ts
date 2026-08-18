import { z } from 'zod'
import { WebsiteUrlSchema } from '../url'
import {
  VendorBrandIdsSchema,
  VendorCategorySchema,
  VendorContactsSchema,
  VendorNameSchema,
  VendorNotesSchema,
  VendorStatusSchema,
  VendorUenSchema,
} from './vendor'

/**
 * Partial vendor patch. At least one key must be present so a bare `{}` is
 * rejected at the wire rather than becoming a no-op write — the rule
 * `UpdateOutletInputSchema`, `UpdateInfluencerInputSchema` and
 * `UpdateBrandInputSchema` all carry.
 *
 * **`slug` is deliberately absent**, as it is on an outlet and a creator. It is
 * derived at create and frozen after, which is the whole reason a link written
 * today survives a rename. Letting a patch move it would break every URL already
 * shared and hand the client a uniqueness rule only the query layer can enforce.
 *
 * **`name` is patchable and the slug still does not follow.** A company that adds
 * `Pte Ltd` to its trading name is exactly the correction a patch is for, so
 * `/vendors/northlight-talent` can end up naming *Northlight Talent Pte Ltd* —
 * the same trade every renamed outlet already makes.
 *
 * `brandIds` and `contacts` are **full replacements**, not add/remove pairs. What
 * a person means by ticking brands is *these are the brands*, and what they mean
 * by editing the contact rows is *these are the contacts* — so there is no merge
 * for two writers to disagree about. It is also what makes swapping the primary
 * contact one request instead of two.
 *
 * The nullable keys — category, UEN, website and notes — clear on an explicit
 * `null` and are left alone on omission. `name` and `status` are not nullable: a
 * vendor always has both.
 */
export const UpdateVendorInputSchema = z
  .object({
    name: VendorNameSchema.optional(),
    category: VendorCategorySchema.nullable().optional(),
    status: VendorStatusSchema.optional(),
    uen: VendorUenSchema.nullable().optional(),
    website: WebsiteUrlSchema.nullable().optional(),
    brandIds: VendorBrandIdsSchema.optional(),
    contacts: VendorContactsSchema.optional(),
    notes: VendorNotesSchema.nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one field is required',
  })

export type UpdateVendorInput = z.infer<typeof UpdateVendorInputSchema>
