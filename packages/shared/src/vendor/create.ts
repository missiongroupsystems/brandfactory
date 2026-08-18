import { z } from 'zod'
import { WebsiteUrlSchema } from '../url'
import {
  VendorBrandIdsSchema,
  VendorCategorySchema,
  VendorContactsSchema,
  VendorNameSchema,
  VendorNotesSchema,
  VendorStatusSchema,
  VendorUenSchema,
} from './vendor'

/**
 * The create body is the row minus everything the server owns: `id`,
 * `workspaceId` (it is in the path), `slug` (derived from the name — see
 * `uniqueVendorSlug`), `createdAt`, `updatedAt`.
 *
 * **Only `name` is required** — one fewer than an outlet asks for and four fewer
 * than an influencer, and that is the shape of the record rather than an
 * oversight. A company you have just heard of has a name and nothing else
 * confirmed: the UEN is on a document nobody has opened, the category is a guess
 * until somebody asks what they actually sell, and the contact is the person who
 * has not replied yet.
 *
 * The contrast with influencers is deliberate. A creator with no follower count
 * would fall out of a *total* tier grouping, which is the one thing a total
 * grouping may not do, so four fields are required there. Nothing on this screen
 * is derived from a vendor's own columns, so nothing breaks when they are empty.
 *
 * `status` defaults to `active`, not to a prospect state. A vendor somebody
 * enters is one the business is already buying from — the opposite of a creator,
 * who is a name on a shortlist until they are booked.
 *
 * `brandIds` and `contacts` default to empty, which is the same statement as
 * omitting them: not assigned yet, nobody named yet. Every brand id is checked
 * against the workspace, and the route turns a miss into a 400
 * `BRAND_NOT_IN_WORKSPACE`.
 */
export const CreateVendorInputSchema = z.object({
  name: VendorNameSchema,
  category: VendorCategorySchema.nullable().optional(),
  status: VendorStatusSchema.default('active'),
  uen: VendorUenSchema.nullable().optional(),
  website: WebsiteUrlSchema.nullable().optional(),
  brandIds: VendorBrandIdsSchema.optional(),
  contacts: VendorContactsSchema.optional(),
  notes: VendorNotesSchema.nullable().optional(),
})

export type CreateVendorInput = z.infer<typeof CreateVendorInputSchema>
