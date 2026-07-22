import { z } from 'zod'
import { BrandSchema } from './brand'

// Brand row plus aggregate counts for list/grid surfaces (workspace home).
// `sectionCount` is the number of guideline_sections *rows*, not sections
// with non-empty bodies — documented imprecision, not a hidden heuristic.
export const BrandSummarySchema = BrandSchema.extend({
  sectionCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
})

export type BrandSummary = z.infer<typeof BrandSummarySchema>
