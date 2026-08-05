import { z } from 'zod'
import { AssetLibrarySchema, AssetRoleSchema, AssetStatusSchema } from './asset'

/**
 * Partial asset patch. At least one key must be present so a bare `{}` is
 * rejected at the wire rather than becoming a no-op write — the same rule
 * `UpdateBrandInputSchema` carries.
 *
 * **`source`, `kind` and the three source columns are deliberately absent.**
 * Changing where an asset's bytes live is not an edit to that asset, it is a
 * different asset — and a patch that could set `value`, `blobKey` or `url`
 * one at a time is the one shape that walks a row past
 * `brand_assets_source_exactly_one` a column at a time. Swap by creating a new
 * row and soft-deleting the old one; that also keeps the old one recoverable,
 * which an in-place rewrite would not.
 *
 * `null` clears `role` and `alt`; omitting a key leaves the column alone.
 *
 * **`library` is here, and it is the whole of Move to….** A lone
 * `{ library }` patch is the feature, which is why it needs its own clause in
 * the `.refine` below — without one the only call the feature ever makes is
 * rejected as an empty body.
 */
export const UpdateBrandAssetInputSchema = z
  .object({
    label: z.string().min(1).max(200).optional(),
    position: z.number().int().optional(),
    role: AssetRoleSchema.nullable().optional(),
    status: AssetStatusSchema.optional(),
    alt: z.string().max(1000).nullable().optional(),
    library: AssetLibrarySchema.optional(),
  })
  .refine(
    (v) =>
      v.label !== undefined ||
      v.position !== undefined ||
      v.role !== undefined ||
      v.status !== undefined ||
      v.alt !== undefined ||
      v.library !== undefined,
    { message: 'At least one of label, position, role, status, alt or library is required' },
  )

export type UpdateBrandAssetInput = z.infer<typeof UpdateBrandAssetInputSchema>
