import { z } from 'zod'
import { BrandAssetIdSchema } from '../ids'

/**
 * A batch re-position, as one atomic call.
 *
 * `reorderAssets` has existed in the db layer since 2A and had **no route and
 * no caller** — 2B declined to ship one with nothing to use it, and 2E's drag
 * handler settled for N independent `PATCH`es of `{ position }` instead. The
 * Stage 1–2 review called that pair what it was: a live, transactional,
 * live-tested query that production could not reach, next to a caller that
 * re-implemented it non-atomically.
 *
 * The N-patches version was not merely inelegant. Dragging one swatch rewrites
 * every position after it, so a nine-colour palette fired eight concurrent
 * requests whose interleaving decided the final order, and any one of them
 * failing left the ramp half-renumbered with a toast that named no row. The
 * transaction was already written; it just needed a door.
 *
 * The list is the moved rows, not the whole palette — `reorderAssets` touches
 * exactly what it is given. The cap is a guard against an unbounded transaction,
 * set far above any real palette or grid.
 */
export const ReorderBrandAssetsInputSchema = z.object({
  updates: z
    .array(
      z.object({
        id: BrandAssetIdSchema,
        position: z.number().int(),
      }),
    )
    .min(1)
    .max(500),
})

export type ReorderBrandAssetsInput = z.infer<typeof ReorderBrandAssetsInputSchema>
