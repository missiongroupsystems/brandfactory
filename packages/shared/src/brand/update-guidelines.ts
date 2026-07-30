import { z } from 'zod'
import { SectionIdSchema } from '../ids'
import { ProseMirrorDocSchema } from '../json'
import { GUIDELINE_LABEL_MAX_CHARS, GuidelineSectionCreatedBySchema } from './guideline-section'

// Upsert-and-reorder over the full section list. `id` present → update that
// row; `id` absent → insert. Section deletion is out of scope for Phase 4 and
// arrives with shortlist promotion (Phase 5/6).
export const UpdateBrandGuidelinesSectionInputSchema = z.object({
  id: SectionIdSchema.optional(),
  label: z.string().min(1).max(GUIDELINE_LABEL_MAX_CHARS),
  body: ProseMirrorDocSchema,
  priority: z.number().int(),
  /**
   * Who authored this section. On the wire since Stage 1B; the column and its
   * `'agent'` value have existed since 0.3.0 with no producer.
   *
   * **This is not a new field so much as a fix to an old lie.** The payload is
   * the brand's *complete* section list, so before Stage 1B — with the route
   * synthesising `createdBy: 'user'` for every row — saving an edit to one
   * section silently rewrote every other section's author. A section stored as
   * `'agent'` reverted to `'user'` on the next unrelated save.
   *
   * The `.default('user')` is what keeps an older client both compiling and
   * correct: a payload that omits the key means "a person wrote this", which is
   * what every pre-1B client meant. Stage 3E is the first producer of `'agent'`.
   */
  createdBy: GuidelineSectionCreatedBySchema.default('user'),
})

export type UpdateBrandGuidelinesSectionInput = z.infer<
  typeof UpdateBrandGuidelinesSectionInputSchema
>

export const UpdateBrandGuidelinesInputSchema = z.object({
  sections: z.array(UpdateBrandGuidelinesSectionInputSchema),
})

export type UpdateBrandGuidelinesInput = z.infer<typeof UpdateBrandGuidelinesInputSchema>
