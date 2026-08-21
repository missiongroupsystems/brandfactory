import { z } from 'zod'
import { BrandIdSchema, InfluencerIdSchema, WorkspaceIdSchema } from '../ids'
import { SlugSchema } from '../slug'
import { WebsiteUrlSchema } from '../url'

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
 * Where the reach is — **a property of an account, not of the creator**.
 *
 * The record used to carry one platform, one handle and one follower count, and
 * that was a deliberate simplification of a real many-to-many. It cost more than
 * it saved: a creator with an Instagram grid and a TikTok account became two
 * rows with half a story each, the reach tiers filed one person into `Micro`
 * three times, and nothing linked the two rows — not a foreign key, not a name
 * match, nothing. `influencer_accounts` is the resolution; see
 * `InfluencerAccountSchema`.
 *
 * `xiaohongshu` is in the list because this is a Singapore group and it is not
 * optional here. It is also why the simplification had to go: a creator on
 * XiaoHongShu is on Instagram as well essentially always.
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
 * The URL segment, generated from the **name** at create and frozen after.
 * `/influencers/priya-raman`.
 *
 * **From the name rather than from the handle**, which is the resolution of a
 * cost this docstring used to record instead of fixing. The handle was the
 * source while the record *was* an account; the record is a person now, a person
 * carries up to ten handles, and picking one of them for the URL would put back
 * the arbitrary choice `influencer_accounts` exists to remove.
 *
 * Two people who genuinely share a name still get `-2`, which is what
 * `uniqueSlug` is for and is a far rarer collision than one person on two
 * platforms was.
 *
 * **Slugs written before this change do not move.** They are frozen at create and
 * the migration touches no `slug` value, so every link shared under the old rule
 * still resolves.
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
 * Follower count **on one account**, and it is not nullable.
 *
 * A creator's follower count is public and is the first thing anyone looks up, so
 * "we have not recorded it" is not a state this record needs to carry. That is
 * what keeps the reach-tier grouping in `packages/web-next`'s
 * `features/influencers/tiers.ts` *total*: a creator's reach is the sum over
 * their accounts, `InfluencerAccountsSchema` is `.min(1)`, so every creator has a
 * reach figure, every row lands in exactly one band, and no unknown bucket
 * exists. The tier is derived from the sum and never stored.
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

/**
 * One account the creator posts from.
 *
 * **A value object, not an entity.** No surrogate id and no timestamps: the write
 * replaces the whole list, so a `createdAt` here would reset on every unrelated
 * edit of the creator and then read as a lie about when the account started. The
 * wire is a plain ordered array and the table is keyed on
 * `(influencer_id, position)`. This is `vendor_contacts` exactly, and that table
 * makes the same argument.
 *
 * **Position 0 is the account the creator is known by.** There is no `is_primary`
 * flag — see `primaryAccount` in `reach.ts` for why the order carries that fact
 * here and a boolean carries it on a vendor contact.
 *
 * **The unique key moved down with the columns.** One account per
 * `(platform, handle)` per workspace, which is the same rule the parent used to
 * hold and is still the one refusal only the database can make. Two accounts on
 * the *same* platform with different handles are allowed on purpose: three
 * Instagram accounts is a real creator.
 *
 * When this shape has to change: the day an import refreshes one account's
 * follower count without a person editing the record, an account needs its own
 * `metrics_updated_at`, and a full-replacement write from the form would race it.
 * That is a real future release, recorded here so the trade is visible when it
 * arrives.
 */
export const InfluencerAccountSchema = z.object({
  platform: InfluencerPlatformSchema,
  handle: InfluencerHandleSchema,
  followers: InfluencerFollowersSchema,
  /** `null` = nobody has measured this account. */
  engagementRate: InfluencerEngagementRateSchema.nullable(),
  /**
   * The profile URL, `null` when nobody has recorded one.
   *
   * A handle resolves to a URL by templating for five of the six platforms. It
   * does not for **xiaohongshu**, which addresses users by an opaque numeric id —
   * so this column is what makes an XHS account clickable at all.
   *
   * **A stored URL is a fact; a derived one is a defensible guess, and the two
   * are not the same thing.** This column holds the first. `accountProfileUrl` in
   * `profile-url.ts` is what the screens call, and it puts this value ahead of
   * anything it would build — so a URL somebody checked, or one the quick-add
   * lookup grounded against a page it actually read, is never overridden. That
   * file also carries the argument for deriving at all, which was refused until
   * 215 of 216 accounts on the real roster arrived holding `null` here.
   *
   * It reuses `WebsiteUrlSchema` rather than a bare `z.url()`: the value is
   * rendered into an `href`, and that schema is where the `http`/`https` filter
   * lives — zod accepts `javascript:alert(1)` as a valid URL.
   */
  url: WebsiteUrlSchema.nullable(),
})
export type InfluencerAccount = z.infer<typeof InfluencerAccountSchema>

/**
 * The cap on one creator's account list.
 *
 * Ten is already two more than there are platforms in the enum, and it is the
 * bound that stops one body writing an unbounded number of child rows. Twenty was
 * right for `VendorContactsSchema` because a big agency really does have a dozen
 * named people; nobody posts from ten accounts.
 */
export const MAX_INFLUENCER_ACCOUNTS = 10

/**
 * The account list, in the order the form sent it, **first row first**.
 *
 * `.min(1)` is the status quo rather than a new demand — `handle`, `platform` and
 * `followers` are all required on the form today. It is also what keeps the tier
 * grouping total: a creator with no account would have no reach, would fall out
 * of every band, and the band counts would stop summing to the rows.
 *
 * **A repeated `(platform, handle)` pair is rejected, not deduplicated** — the
 * call `InfluencerBrandIdsSchema` already makes. The pair would take the unique
 * violation inside the write transaction and surface as a 409 about a conflict
 * with *another* creator, which is the wrong sentence for a malformed body. The
 * comparison is exact rather than case-folded, because the constraint behind it
 * is exact: refusing a pair the database would accept is its own defect.
 */
export const InfluencerAccountsSchema = z
  .array(InfluencerAccountSchema)
  .min(1)
  .max(MAX_INFLUENCER_ACCOUNTS)
  .superRefine((accounts, ctx) => {
    const seen = new Set<string>()
    accounts.forEach((account, index) => {
      const key = `${account.platform}\u0000${account.handle}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          // On the repeated row rather than on the list, so the form can put the
          // message where the person has to fix it. `use-submit.ts` keys the
          // field errors by this path.
          path: [index, 'handle'],
          message: `@${account.handle} on ${account.platform} is already listed above — one account per platform and handle`,
        })
      }
      seen.add(key)
    })
  })

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
  /**
   * Every account this creator posts from, ordered, **never empty**, and the
   * first one is the account they are known by.
   *
   * This is where the platform, the handle, the follower count and the engagement
   * rate live. Nothing about the person is down here and nothing about an account
   * is up here. The creator-level reach and engagement figures the screens print
   * are derived from this array by `totalReach` and `blendedEngagement`; neither
   * is a field on the wire, because a stored sum can disagree with the array
   * printed beside it.
   *
   * A write **replaces the whole list**, like `brandIds`.
   */
  accounts: InfluencerAccountsSchema,
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

// `byInfluencerReach` used to sit here. It moved to `reach.ts` the day reach
// became a sum over the accounts: the comparator now reads `totalReach`, and an
// import in this direction would be a cycle. It is re-exported from the package
// index, so no consumer's import changed.
