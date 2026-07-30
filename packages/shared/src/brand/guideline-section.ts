import { z } from 'zod'
import { BrandIdSchema, SectionIdSchema } from '../ids'
import { ProseMirrorDocSchema } from '../json'

export const GuidelineSectionCreatedBySchema = z.enum(['user', 'agent'])
export type GuidelineSectionCreatedBy = z.infer<typeof GuidelineSectionCreatedBySchema>

/**
 * The longest label a guideline section may carry — **the binding constraint for
 * everything that produces one**, which is why it is a named export rather than
 * a literal repeated at each schema.
 *
 * It was a literal in three places until the Stage 3 hardening pass, and the
 * third one disagreed: research drafts were shaped with `label` capped at 200
 * while this destination caps at 120. Because `PATCH /brands/:id/guidelines`
 * takes the brand's *complete* section list, one 130-character label from the
 * writing model returned `400` for the whole payload — losing all five drafts to
 * a toast, not just the long one. The same failure shape 3G already hit through
 * `min(1)`, one bound over.
 *
 * Anything that generates a label clamps to this rather than validating against
 * it: a truncated label is a cosmetic loss the user can fix in the editor, and a
 * rejected batch is the paid run's whole output on the floor.
 */
export const GUIDELINE_LABEL_MAX_CHARS = 120

export const BrandGuidelineSectionSchema = z.object({
  id: SectionIdSchema,
  brandId: BrandIdSchema,
  label: z.string().min(1).max(GUIDELINE_LABEL_MAX_CHARS),
  body: ProseMirrorDocSchema,
  // Sparse integer ordering. Reorders write a new `priority` without touching
  // siblings; re-balance on conflict. Swap for a lexorank string later if
  // reorder churn becomes a problem.
  priority: z.number().int(),
  createdBy: GuidelineSectionCreatedBySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type BrandGuidelineSection = z.infer<typeof BrandGuidelineSectionSchema>
