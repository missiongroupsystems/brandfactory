import { z } from 'zod'
import { BrandIdSchema } from '../ids'
import {
  OutletAttributesSchema,
  OutletDateSchema,
  OutletNameSchema,
  OutletNotesSchema,
  OutletStatusSchema,
  OutletTypeSchema,
} from './outlet'

/**
 * Partial outlet patch. At least one key must be present so a bare `{}` is
 * rejected at the wire rather than becoming a no-op write — the rule
 * `UpdateBrandInputSchema`, `UpdateBrandAssetInputSchema` and
 * `UpdateSocialPostInputSchema` all carry.
 *
 * **`slug` is deliberately absent.** It is derived at create and frozen after,
 * which is the whole reason a link written today survives a rename. Letting a
 * patch move it would break every URL already shared and hand the client a
 * uniqueness rule only the query layer can enforce.
 *
 * `attributes` is a **full replacement**, not a delta. What a person means by
 * ticking boxes is *these are the attributes*, and add/remove then need no second
 * verb — the same call `assetIds` makes on a social post.
 *
 * The nullable keys — brand, address, unit, postal code, the three dates and the
 * notes — clear on an explicit `null` and are left alone on omission. `name`,
 * `outletType` and `status` are not nullable: an outlet always has all three.
 */
export const UpdateOutletInputSchema = z
  .object({
    name: OutletNameSchema.optional(),
    outletType: OutletTypeSchema.optional(),
    status: OutletStatusSchema.optional(),
    brandId: BrandIdSchema.nullable().optional(),
    address: z.string().max(300).nullable().optional(),
    unit: z.string().max(50).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    attributes: OutletAttributesSchema.optional(),
    targetOpeningDate: OutletDateSchema.nullable().optional(),
    openingDate: OutletDateSchema.nullable().optional(),
    closingDate: OutletDateSchema.nullable().optional(),
    notes: OutletNotesSchema.nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one field is required',
  })

export type UpdateOutletInput = z.infer<typeof UpdateOutletInputSchema>
