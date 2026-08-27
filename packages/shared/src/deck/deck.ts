import { z } from 'zod'
import { AssetLinkUrlSchema } from '../asset/asset'
import { BrandIdSchema, DeckIdSchema, DeckVersionIdSchema } from '../ids'

// A brand deck — the named folder a team hangs versions off. **No `position`**
// — `vendor_brands`' rule: nothing orders decks against each other, so there
// is nothing a `position` column would record.
export const DeckSchema = z.object({
  id: DeckIdSchema,
  brandId: BrandIdSchema,
  name: z.string().trim().min(1).max(200),
})
export type Deck = z.infer<typeof DeckSchema>

/**
 * Where a version's design lives and stays editable.
 *
 * **Not a second source alongside a snapshot.** A `'canva'` version carries a
 * frozen PDF beside the live link — see `CanvaDeckVersionSchema` below — and
 * that PDF is not a competing place the design lives; it is a copy of the one
 * true place, taken at the moment the version was recorded.
 *
 * Two members, and this is the pin test the `deckSource` pgEnum in
 * `@brandfactory/db` owes — the `resource.test.ts` convention, and `deck.test.ts`
 * is where it is paid.
 */
export const DeckSourceSchema = z.enum(['pdf', 'canva'])
export type DeckSource = z.infer<typeof DeckSourceSchema>

const DeckVersionBaseShape = {
  id: DeckVersionIdSchema,
  deckId: DeckIdSchema,
  /** A short caption for the version — "v3, client-approved", not a description. */
  label: z.string().trim().min(1).max(200),
  /**
   * The date the team typed, not when the row arrived. `z.iso.date()`, not
   * `z.iso.datetime()` — `OutletDateSchema`'s reason: a deck was finished on a
   * day, not at an instant two zones would read as two different days. This
   * is the field `byVersionRecency` in `ordering.ts` orders by first.
   */
  versionDate: z.iso.date(),
  /**
   * Text, not a FK to `users`. The author of a brand deck is frequently an
   * agency that will never hold a row in `users`, and a FK would write `null`
   * into the one field the version history is read for.
   */
  author: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(),
}

/** `source: 'pdf'` — the design's only copy is the file itself. */
export const PdfDeckVersionSchema = z.object({
  ...DeckVersionBaseShape,
  source: z.literal('pdf'),
  pdfBlobKey: z.string().min(1),
  canvaUrl: z.null(),
})
export type PdfDeckVersion = z.infer<typeof PdfDeckVersionSchema>

/**
 * `source: 'canva'` — the design lives at `canvaUrl` and stays editable there.
 *
 * `pdfBlobKey` is **required, not optional** — decision 3. A Canva version
 * always carries a frozen copy a reader can open without a Canva account, and
 * the blob sweep (Phase 2B) always has bytes to find when the brand goes.
 */
export const CanvaDeckVersionSchema = z.object({
  ...DeckVersionBaseShape,
  source: z.literal('canva'),
  canvaUrl: AssetLinkUrlSchema,
  pdfBlobKey: z.string().min(1),
})
export type CanvaDeckVersion = z.infer<typeof CanvaDeckVersionSchema>

/**
 * The exactly-one-of-with-a-twist rule, enforced by the union — `BrandAsset`'s
 * pattern, for the same reason. `deck_versions_source_shape` backs the same
 * rule in SQL, and duplicating it here is worth it because a future writer
 * that reaches the table without going through a route could plausibly
 * violate it, and a CHECK nobody has seen fire is a CHECK that may not exist.
 */
export const DeckVersionSchema = z.discriminatedUnion('source', [
  PdfDeckVersionSchema,
  CanvaDeckVersionSchema,
])
export type DeckVersion = z.infer<typeof DeckVersionSchema>

// The create body for a new deck — `brandId` is in the path and `id` is
// server-set, the same two omissions `CreateBrandResourceInputSchema` makes
// on `BrandResourceSchema`.
export const CreateDeckInputSchema = DeckSchema.omit({ id: true, brandId: true })
export type CreateDeckInput = z.infer<typeof CreateDeckInputSchema>

/**
 * The create body for one new version of a deck. Built from the two row
 * schemas above with `id`, `deckId` and `createdAt` omitted — the three
 * columns the server owns, never the caller.
 *
 * Staying a `discriminatedUnion` on `source` is what puts
 * `deck_versions_source_shape`'s rule at the wire: a `'pdf'` body carrying no
 * `pdfBlobKey` is a 400 with a field path, and the CHECK never sees it.
 * `CreateBrandAssetInputSchema` in `asset/create.ts` is the same move for
 * `brand_assets_source_exactly_one`.
 */
export const CreateDeckVersionInputSchema = z.discriminatedUnion('source', [
  PdfDeckVersionSchema.omit({ id: true, deckId: true, createdAt: true }),
  CanvaDeckVersionSchema.omit({ id: true, deckId: true, createdAt: true }),
])
export type CreateDeckVersionInput = z.infer<typeof CreateDeckVersionInputSchema>
