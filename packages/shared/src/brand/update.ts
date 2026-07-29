import { z } from 'zod'
import { BrandWebsiteUrlSchema } from './brand'

// Partial brand patch. At least one key must be present so a bare `{}` is
// rejected at the wire boundary rather than becoming a no-op write.
export const UpdateBrandInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
    websiteUrl: BrandWebsiteUrlSchema.nullable().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.websiteUrl !== undefined,
    { message: 'At least one of name, description or websiteUrl is required' },
  )

export type UpdateBrandInput = z.infer<typeof UpdateBrandInputSchema>
