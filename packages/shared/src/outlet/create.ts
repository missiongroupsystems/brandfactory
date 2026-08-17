import { z } from 'zod'
import { BrandIdSchema } from '../ids'
import {
  OutletAttributesSchema,
  OutletDateSchema,
  OutletNameSchema,
  OutletNotesSchema,
  OutletStatusSchema,
  OutletTypeSchema,
} from './outlet'

/**
 * The create body is the row minus everything the server owns: `id`,
 * `workspaceId` (it is in the path), `slug` (derived from the name — see
 * `uniqueOutletSlug`), `createdAt`, `updatedAt`.
 *
 * **`name` and `outletType` are the only required keys.** A site in the pipeline
 * is often nothing more than a name and a kind; an address, a brand and a date
 * all arrive later, and a form that demanded them would push people into typing
 * placeholder values that then look like facts.
 *
 * `status` defaults to `pipeline` — the case worth optimising for, since an
 * outlet already trading is the rarer thing to be entering by hand.
 *
 * Every nullable field accepts an explicit `null` as well as omission, so
 * "created without an address" and "omitted the key" are one statement rather
 * than two the server has to reconcile.
 */
export const CreateOutletInputSchema = z.object({
  name: OutletNameSchema,
  outletType: OutletTypeSchema,
  status: OutletStatusSchema.default('pipeline'),
  brandId: BrandIdSchema.nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  attributes: OutletAttributesSchema.optional(),
  targetOpeningDate: OutletDateSchema.nullable().optional(),
  openingDate: OutletDateSchema.nullable().optional(),
  closingDate: OutletDateSchema.nullable().optional(),
  notes: OutletNotesSchema.nullable().optional(),
})

export type CreateOutletInput = z.infer<typeof CreateOutletInputSchema>
