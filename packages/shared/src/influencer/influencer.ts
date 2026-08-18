import { z } from 'zod'
import { BrandIdSchema, InfluencerIdSchema, WorkspaceIdSchema } from '../ids'
import { SlugSchema } from '../slug'

// ---------------------------------------------------------------------------
// Influencer — a creator the brands engage
// ---------------------------------------------------------------------------
//
// The record was declared in `packages/web-next`'s `lib/api/types.ts` and said so
// in its own docstring: it was safe there *only* because no server existed to
// refuse a field, and "the day a real backend arrives it is generated against
// this shape". This is that shape, in the place a shape belongs.
//
// **A creator is not a contact with extra columns.** The Operations Hub's address
// book (`ContactRead`: name, role, email, phone, `vendor_id`, `is_primary`) is
// still live and still correct for a landlord's site manager. It carries none of
// the six fields an influencer is chosen by — handle, platform, reach,
// engagement, vertical, the brands they work for — and widening it to hold both
// would rebuild the exact record 1.39.0 spent a release taking apart. Different
// noun, different table.
//
// **Workspace-scoped with a brand relation**, not brand-scoped, and for outlets'
// reason unchanged: the screen filters and groups *by* brand, which is not a
// question a list holding one brand can answer, and a prospect nobody has booked
// has no brand at all.
//
// There is no agency on this record and no email or phone, which are 1.39.0's
// decisions rather than omissions. A creator is reached at their handle; the
// mobile number is their agent's business; an agency is a company you hold an
// agreement with, which is what `/vendors` and `/contracts` are for.

/**
 * Where the reach is.
 *
 * The row carries **one** platform, not a set, and that is a deliberate
 * simplification of a real many-to-many: a creator with an Instagram grid and a
 * TikTok account has two different follower counts and two different engagement
 * rates, so one row with a platform array would have to pick one number to
 * show — and every reach figure on the screen would silently be "on whichever
 * platform we happened to record". One row per platform keeps every number
 * attributable, which is why `(workspace_id, platform, handle)` is the unique key
 * rather than `(workspace_id, handle)`.
 *
 * `xiaohongshu` is in the list because this is a Singapore group and it is not
 * optional here.
 *
 * Member list duplicated with the `influencer_platform` pgEnum in
 * `@brandfactory/db`, per the zod-⇄-pgEnum convention `outlets.ts` and
 * `social_posts.ts` already follow; `influencer.test.ts` pins the list.
 */
export const InfluencerPlatformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube',
  'xiaohongshu',
  'facebook',
  'linkedin',
])
export type InfluencerPlatform = z.infer<typeof InfluencerPlatformSchema>

/**
 * What the creator is about — the vocabulary that replaced the Operations Hub's
 * thirteen building trades on this screen, of which a talent agency could only
 * ever be `other`.
 *
 * **Nullable, and there is no `other` member.** A generalist genuinely has no
 * vertical, and inventing `other` for them would file them beside the ones nobody
 * has classified yet — two different facts under one label.
 */
export const InfluencerVerticalSchema = z.enum([
  'beauty',
  'fashion',
  'food',
  'fitness',
  'travel',
  'home',
  'tech',
  'parenting',
  'motoring',
  'family',
])
export type InfluencerVertical = z.infer<typeof InfluencerVerticalSchema>

/**
 * Where the relationship stands.
 *
 * Three values and no `archived`: a creator you worked with and stopped working
 * with is `past`, which is a thing you look up rather than a thing you hide.
 * `prospect` is the state the old address book had no way to hold — a person on a
 * shortlist who has never been booked — and it is the create default for exactly
 * that reason.
 */
export const InfluencerStatusSchema = z.enum(['active', 'prospect', 'past'])
export type InfluencerStatus = z.infer<typeof InfluencerStatusSchema>

/**
 * The URL segment, generated from the **handle** at create and frozen after.
 *
 * From the handle rather than the name because the handle is the creator's own
 * identifier, it is what the search box already treats as one, and it is close to
 * URL-safe before `slugify` touches it — `/influencers/priyaskin` reads as the
 * person it points at.
 *
 * Known cost: one person on two platforms gives `priyaskin` and `priyaskin-2`,
 * and the URL does not say which is which. The detail page names the platform in
 * its first line. The alternative (`priyaskin-instagram`) is unambiguous and puts
 * a suffix on the 90% of creators who are on one platform.
 */
export const InfluencerSlugSchema = SlugSchema

export const InfluencerNameSchema = z.string().trim().min(1).max(200)

/**
 * The handle, **without the `@`**. Every surface adds the sigil, so a row that
 * carried one would render `@@priyaskin` on the screen and `-priyaskin` in the
 * slug — which is why a leading `@` is rejected here rather than stripped.
 * Stripping would accept two spellings of one handle and let both into the table
 * under the unique key.
 *
 * Otherwise unvalidated beyond a length. Handle grammar differs per platform and
 * xiaohongshu handles are not latin at all; refusing a whole import over a
 * character class is the failure `OutletAttributesSchema` already argues against.
 */
export const InfluencerHandleSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((handle) => !handle.startsWith('@'), {
    message: 'A handle is stored without the @ — every surface adds it',
  })

/**
 * Follower count, and **it is not nullable**.
 *
 * A creator's follower count is public and is the first thing anyone looks up, so
 * "we have not recorded it" is not a state this record needs to carry. That is
 * what makes the reach-tier grouping in `packages/web-next`'s
 * `features/influencers/tiers.ts` *total*: every row lands in exactly one band,
 * the band counts always sum to the rows, and no unknown bucket exists. The tier
 * is derived from this number and never stored.
 */
export const InfluencerFollowersSchema = z.number().int().nonnegative()

/**
 * Engagement rate as a percent — `3.8` is 3.8%.
 *
 * `null` where nobody has measured it, which is a real state rather than a gap: a
 * prospect you have not run a campaign with has no engagement history.
 *
 * Capped at 100 because it is a percentage of an audience. The column behind it is
 * `numeric(5,2)`, so a third decimal is rounded on write rather than refused —
 * a measurement is an estimate and refusing an import over its precision would
 * lose the figure entirely.
 */
export const InfluencerEngagementRateSchema = z.number().min(0).max(100)

export const InfluencerNotesSchema = z.string().max(5000)

/**
 * The brands a creator is engaged for, as a set.
 *
 * **Duplicates are rejected rather than deduplicated**, and that is not fussiness:
 * `influencer_brands` is keyed on `(influencer_id, brand_id)`, so a repeated id
 * would take a unique violation inside the write transaction and surface as a 500
 * for what is really a malformed body. Two `brandId`s the same are not a stronger
 * statement, and the multi-select cannot produce one — a client that does is
 * broken and should be told so.
 *
 * The cap is 50. A creator engaged for fifty brands is not a case this product
 * has, and the bound is what stops one body from writing an unbounded number of
 * link rows.
 */
export const InfluencerBrandIdsSchema = z
  .array(BrandIdSchema)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'brandIds must not contain duplicates',
  })

export const InfluencerSchema = z.object({
  id: InfluencerIdSchema,
  workspaceId: WorkspaceIdSchema,
  slug: InfluencerSlugSchema,
  name: InfluencerNameSchema,
  handle: InfluencerHandleSchema,
  platform: InfluencerPlatformSchema,
  followers: InfluencerFollowersSchema,
  /** `null` = nobody has measured it. */
  engagementRate: InfluencerEngagementRateSchema.nullable(),
  /** `null` = a genuine generalist, not an unclassified row. */
  vertical: InfluencerVerticalSchema.nullable(),
  /**
   * The brands this creator is engaged for. **An empty array is a fact** — "not
   * engaged yet" — never a gap.
   *
   * Assembled server-side from the `influencer_brands` join table and **sorted**,
   * so two reads of one row are byte-identical and a diff of the row is never
   * noise. A join table rather than a `uuid[]` column because an array cannot
   * carry a foreign key, and a dangling id would render identically to a brand
   * index still in flight in the one cell that distinguishes them.
   */
  brandIds: InfluencerBrandIdsSchema,
  status: InfluencerStatusSchema,
  notes: InfluencerNotesSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Influencer = z.infer<typeof InfluencerSchema>

/**
 * The canonical ordering, mirroring `listInfluencersByWorkspace`'s SQL
 * (`followers desc, name asc, id asc`).
 *
 * **Reach descending, the opposite of every other list in this repo**, which sort
 * alphabetically because they are read as directories. This one is read as a
 * budget conversation: the few expensive names at the top, the long tail below.
 * The reach tiers are ordered the same way for the same reason.
 *
 * `name` breaks a tie because two creators on a round number — 10,000 followers
 * is common — would otherwise order by id, which is to say arbitrarily and
 * differently on every read.
 */
export function byInfluencerReach(a: Influencer, b: Influencer): number {
  if (a.followers !== b.followers) return b.followers - a.followers
  const byName = a.name.localeCompare(b.name)
  return byName !== 0 ? byName : a.id.localeCompare(b.id)
}
