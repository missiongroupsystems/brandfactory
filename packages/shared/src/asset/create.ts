import { z } from 'zod'
import { AssetKindSchema, AssetLinkUrlSchema, AssetRoleSchema, AssetStatusSchema } from './asset'

// The create body is the row union minus everything the server owns: `id`,
// `brandId` (it is in the path), `deletedAt`, `createdAt`, `updatedAt`.
//
// It stays a `discriminatedUnion` on `source` for one reason: that is what puts
// the exactly-one-of rule at the *wire*, so a body naming `blob` and carrying a
// `url` is a 400 with a field path, and `brand_assets_source_exactly_one` never
// sees it. A flat object with three optional columns and a `.refine` would
// enforce the same rule and report it as one opaque message on the whole body.
const CreateBrandAssetBaseShape = {
  kind: AssetKindSchema,
  label: z.string().min(1).max(200),
  role: AssetRoleSchema.nullable().optional(),
  status: AssetStatusSchema.optional(),
  alt: z.string().max(1000).nullable().optional(),
  mime: z.string().max(255).nullable().optional(),
  filename: z.string().max(255).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  /**
   * Optional, and the server appends when it is absent.
   *
   * Requiring it would mean every client reads the brand's assets before adding
   * one, just to learn the current maximum — the same query, done over the
   * network, by the party least able to do it atomically. Dropping five files on
   * the library at once (2E) would need five of them. A client that *does* care
   * about placement — a drag-reorder — sends the value it wants.
   */
  position: z.number().int().optional(),
}

export const CreateBrandAssetInputSchema = z.discriminatedUnion('source', [
  z.object({
    ...CreateBrandAssetBaseShape,
    source: z.literal('inline'),
    value: z.string().min(1).max(255),
  }),
  z.object({
    ...CreateBrandAssetBaseShape,
    source: z.literal('blob'),
    blobKey: z.string().min(1),
  }),
  z.object({
    ...CreateBrandAssetBaseShape,
    source: z.literal('link'),
    url: AssetLinkUrlSchema,
  }),
])

export type CreateBrandAssetInput = z.infer<typeof CreateBrandAssetInputSchema>
