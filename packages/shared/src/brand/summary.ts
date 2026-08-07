import { z } from 'zod'
import { BrandSchema } from './brand'

// Brand row plus aggregate counts for list/grid surfaces (workspace home).
// `sectionCount` is the number of guideline_sections *rows*, not sections
// with non-empty bodies — documented imprecision, not a hidden heuristic.
export const BrandSummarySchema = BrandSchema.extend({
  sectionCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
  /**
   * The brand's `TL;DR` section flattened to one line, or `null` when it has
   * none. Feeds `brandDescriptionLine`, which prefers it over `description`.
   *
   * **A resolved string, not the section**, and that is the whole reason it is
   * a field here rather than something the card derives. `BrandSummary` exists
   * so the workspace grid is one round trip; shipping the TL;DR's ProseMirror
   * doc — let alone every section of every brand — to render two clamped lines
   * would trade that away for markup the card immediately throws out. The
   * flattening is `sectionBodyToLine`, run once in the db mapper.
   *
   * Nullable and *not* defaulted, deliberately: a missing field and an absent
   * TL;DR must not be the same value at this boundary, because the first is a
   * query that forgot to select it and the second is most brands.
   */
  tldr: z.string().nullable(),
})

export type BrandSummary = z.infer<typeof BrandSummarySchema>
