import { z } from 'zod'
import { AssetLinkUrlSchema } from '../asset/asset'
import { BrandIdSchema, BrandResourceIdSchema } from '../ids'

// A named external link a team member has to find fast — a font shop, a stock
// library, an icon set. **Not a `brand_assets` row**, and the near miss is
// worth knowing: that table models a link on somebody else's host too, but its
// `kind` is `color | image | file` and a website is none of the three. The app
// stores no bytes here, ever.
export const ResourceTypeSchema = z.enum(['font', 'image', 'icon', 'tool', 'reference', 'other'])
export type ResourceType = z.infer<typeof ResourceTypeSchema>

export const ResourceTitleSchema = z.string().trim().min(1).max(200)
/** A short reminder of what the link is for, not a description of the site. */
export const ResourceNoteSchema = z.string().trim().max(500)

export const BrandResourceSchema = z.object({
  id: BrandResourceIdSchema,
  brandId: BrandIdSchema,
  type: ResourceTypeSchema,
  title: ResourceTitleSchema,
  url: AssetLinkUrlSchema,
  note: ResourceNoteSchema.nullable(),
})
export type BrandResource = z.infer<typeof BrandResourceSchema>

export const CreateBrandResourceInputSchema = BrandResourceSchema.omit({ id: true, brandId: true })
export type CreateBrandResourceInput = z.infer<typeof CreateBrandResourceInputSchema>

export const UpdateBrandResourceInputSchema = CreateBrandResourceInputSchema.partial()
export type UpdateBrandResourceInput = z.infer<typeof UpdateBrandResourceInputSchema>
