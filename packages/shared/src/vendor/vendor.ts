import { z } from 'zod'
import { BrandIdSchema, VendorIdSchema, WorkspaceIdSchema } from '../ids'
import { SlugSchema } from '../slug'
import { WebsiteUrlSchema } from '../url'

// ---------------------------------------------------------------------------
// Vendor — a company the workspace buys from
// ---------------------------------------------------------------------------
//
// The record on screen today is `S["VendorRead"]`, an alias over a `schema.d.ts`
// generated from a FastAPI document this repository does not contain, with
// `pnpm gen:api` deleted and the file frozen. It is not ours to extend. This is
// the shape in the place a shape belongs.
//
// **A counterparty is a noun this schema did not have.** `outlets` is a place the
// brand trades *from*; `brands` is the thing the work is for; `influencers` is a
// person the brand engages. None of the three is a company you hold an agreement
// with, and none of them could be widened into one without carrying a follower
// count or a lease beside a UEN.
//
// **Workspace-scoped with a many-to-many brand relation**, not brand-scoped, for
// outlets' and influencers' reason unchanged: the screen filters *by* brand,
// which is not a question a list holding one brand can answer, and a vendor
// nobody has assigned yet has no brand at all. The relation is `vendor_brands`,
// not a `uuid[]` column — see that table for why.
//
// **No `kind`.** 1.38.0 took the counterparty-kind control off the screen —
// marketing buys from no landlords — and left `VendorKind` on the record it
// controlled. The column does not survive the move.
//
// **No contract aggregates.** `contracts_total`, `contracts_active` and
// `next_contract_end` were computed from `fixtures/contracts.ts`. A count derived
// from a fixture and rendered beside a real row is a false statement that looks
// like a true one, so the three go rather than being carried across as zeros.

/**
 * What the counterparty *is* — an agency, a studio, a press office, a tool.
 *
 * **Not `ContractCategory`, and the difference is the whole reason this enum
 * exists.** That vocabulary names what an *agreement buys* — `retainer`,
 * `media_buy`, `production`, `sponsorship`. One company sells three of those and
 * one agreement buys one, so a media agency on a retainer would have to be filed
 * under `retainer`, which is a fact about the paperwork rather than about the
 * company. The vendor form's hint has promised the two are shared since 1.37.0
 * and has been wrong for four releases; the hint is what gets rewritten.
 *
 * It replaces `ServiceCategory`, thirteen *building trades* — `aircon`,
 * `pest_control`, `grease_trap` — of which a talent agency could only ever be
 * `other`. Four of the six agency fixtures carry `other` for exactly that reason.
 *
 * Member list duplicated with the `vendor_category` pgEnum in `@brandfactory/db`,
 * per the zod-⇄-pgEnum convention `outlets.ts`, `social_posts.ts` and
 * `influencers.ts` already follow; `vendor.test.ts` pins the list.
 */
export const VendorCategorySchema = z.enum([
  'creative_agency',
  'media_agency',
  'talent_agency',
  'pr_agency',
  'production',
  'events',
  'research',
  'software',
  'freelancer',
  'other',
])
export type VendorCategory = z.infer<typeof VendorCategorySchema>

/**
 * Where the trading relationship stands.
 *
 * `blacklisted` is a stronger statement than `inactive` and the two are not
 * interchangeable: one is a company nobody is buying from at the moment, the
 * other is one nobody may buy from. A screen that collapsed them would lose the
 * only fact on this record that is a decision rather than a status.
 *
 * Member list duplicated with the `vendor_status` pgEnum; `vendor.test.ts` pins
 * it.
 */
export const VendorStatusSchema = z.enum(['active', 'inactive', 'blacklisted'])
export type VendorStatus = z.infer<typeof VendorStatusSchema>

/**
 * The URL segment, generated from the **name** at create and frozen after.
 *
 * From the name because there is nothing else — a company has no handle, unlike
 * a creator. `/vendors/northlight-talent-pte-ltd` reads as the company it points
 * at, and it keeps resolving after somebody corrects the spelling of that name.
 */
export const VendorSlugSchema = SlugSchema

export const VendorNameSchema = z.string().trim().min(1).max(200)

/**
 * The Singapore Unique Entity Number, or whatever the equivalent registration is.
 *
 * **Unique when present, and that is this aggregate's 409.** A UEN genuinely is
 * one company's identifier, unlike a name, so entering a company that is already
 * in the book is a duplicate rather than a second record. Postgres treats NULLs
 * as distinct, so the many unrecorded rows cost nothing and no partial index is
 * needed.
 *
 * **Not format-validated beyond a length**, on `InfluencerHandleSchema`'s
 * argument: UEN grammar has several forms, a foreign agency has none at all, and
 * refusing a whole import over a character class loses the value entirely.
 */
export const VendorUenSchema = z.string().trim().min(1).max(50)

export const VendorNotesSchema = z.string().max(5000)

export const VendorContactNameSchema = z.string().trim().min(1).max(200)
export const VendorContactRoleSchema = z.string().trim().min(1).max(120)

/**
 * A contact's email, and **this one is format-validated** where the UEN above is
 * not.
 *
 * The two are not the same call. A UEN has several national grammars and a
 * foreign vendor has none; an email address has one grammar everywhere. It is
 * also rendered into a `mailto:` href, which is `WebsiteUrlSchema`'s argument one
 * scheme over — a value that reaches an `href` is checked where it is declared
 * rather than at each surface that renders it.
 */
export const VendorContactEmailSchema = z.email().max(320)

/**
 * A phone number, unvalidated beyond a length and deliberately so. Numbers arrive
 * with country codes, extensions, spaces and brackets, in a different convention
 * per market, and there is no normal form worth refusing an entry over.
 */
export const VendorContactPhoneSchema = z.string().trim().min(1).max(50)

/**
 * One person at the company.
 *
 * **A value object, not an entity.** It carries no id and no timestamps: the
 * write replaces the whole list, so a `createdAt` would reset on every unrelated
 * edit of the vendor and read as a lie. The wire is a plain ordered array and the
 * table is keyed on `(vendor_id, position)`.
 *
 * **This is not the Operations Hub's `ContactRead`.** That row is the address
 * book's, it is edited from the tenancy sheet and the review queue, and it
 * outlives any single vendor write. Two records that both describe a person, in
 * two services, and neither is the other with extra columns.
 *
 * Only `name` is required. A contact somebody has just been told about is a name
 * and a job title at most.
 */
export const VendorContactSchema = z.object({
  name: VendorContactNameSchema,
  role: VendorContactRoleSchema.nullable(),
  email: VendorContactEmailSchema.nullable(),
  phone: VendorContactPhoneSchema.nullable(),
  isPrimary: z.boolean(),
})
export type VendorContact = z.infer<typeof VendorContactSchema>

/**
 * The contact list, in the order the form sent it.
 *
 * **At most one primary, enforced here and not by a partial unique index.** The
 * repo's rule — zod at the route boundary is the single enforcement point — and
 * here it also removes work: a full-replacement write makes swapping the primary
 * one request, where an index could refuse the second half of the swap.
 *
 * The cap is 20. A vendor with twenty named contacts is not a case this product
 * has, and the bound is what stops one body writing an unbounded number of child
 * rows.
 */
export const VendorContactsSchema = z
  .array(VendorContactSchema)
  .max(20)
  .refine((contacts) => contacts.filter((c) => c.isPrimary).length <= 1, {
    message: 'At most one contact can be the primary',
  })

/**
 * The brands this company works on, as a set.
 *
 * **Duplicates are rejected rather than deduplicated**, for `InfluencerBrandIds`'
 * reason unchanged: `vendor_brands` is keyed on `(vendor_id, brand_id)`, so a
 * repeated id would take a unique violation inside the write transaction and
 * surface as a 500 for what is really a malformed body. The multi-select cannot
 * produce one; a client that does is broken and should be told so.
 */
export const VendorBrandIdsSchema = z
  .array(BrandIdSchema)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'brandIds must not contain duplicates',
  })

export const VendorSchema = z.object({
  id: VendorIdSchema,
  workspaceId: WorkspaceIdSchema,
  slug: VendorSlugSchema,
  name: VendorNameSchema,
  /**
   * `null` = nobody has said. `other` = somebody said, and none of these.
   *
   * **Both are load-bearing and they are different facts.** This is the one place
   * vendors do the opposite of influencers on purpose: a creator with no vertical
   * is a genuine generalist, so there is no `other` to confuse them with, while a
   * company is always *something* and `other` means the list is short.
   */
  category: VendorCategorySchema.nullable(),
  status: VendorStatusSchema,
  /** `null` = not recorded, which is most rows. Unique across the workspace when present. */
  uen: VendorUenSchema.nullable(),
  website: WebsiteUrlSchema.nullable(),
  /**
   * The brands this company works on. **An empty array is a fact** — "not
   * assigned yet" — never a gap.
   *
   * Assembled server-side from `vendor_brands` and **sorted**, so two reads of one
   * row are byte-identical and a diff of the row is never noise. A stated fact
   * rather than a projection of live agreements, which is what the column showed
   * when it was derived from sixteen invented contracts.
   */
  brandIds: VendorBrandIdsSchema,
  /** In `position` order. **An empty array is a fact** — nobody named yet. */
  contacts: VendorContactsSchema,
  notes: VendorNotesSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Vendor = z.infer<typeof VendorSchema>

/**
 * The canonical ordering, mirroring `listVendorsByWorkspace`'s SQL
 * (`name asc, id asc`).
 *
 * **Alphabetical, and not by anything derived.** This screen is read as a
 * directory — you arrive knowing the company's name and looking for its row —
 * which is the opposite of `byInfluencerReach`, where the list is read as a
 * budget conversation and the expensive names belong at the top. Ordering a
 * directory by a computed figure would move a row every time the figure changed.
 *
 * `id` breaks a tie because two companies may legitimately carry the same name,
 * and ordering equal names arbitrarily would reshuffle the table on every read.
 */
export function byVendorName(a: Vendor, b: Vendor): number {
  const byName = a.name.localeCompare(b.name)
  return byName !== 0 ? byName : a.id.localeCompare(b.id)
}
