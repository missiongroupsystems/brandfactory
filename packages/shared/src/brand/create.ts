import { z } from 'zod'
import { BrandWebsiteUrlSchema } from './brand'

export const CreateBrandInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  websiteUrl: BrandWebsiteUrlSchema.nullable().optional(),
})

export type CreateBrandInput = z.infer<typeof CreateBrandInputSchema>
