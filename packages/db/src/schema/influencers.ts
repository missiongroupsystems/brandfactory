import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'

// Member lists duplicated with `InfluencerPlatformSchema` /
// `InfluencerVerticalSchema` / `InfluencerStatusSchema` in
// `@brandfactory/shared`, per the zod-⇄-pgEnum convention `outlets.ts` and
// `social_posts.ts` already follow; `influencer.test.ts` pins all three lists.
export const influencerPlatform = pgEnum('influencer_platform', [
  'instagram',
  'tiktok',
  'youtube',
  'xiaohongshu',
  'facebook',
  'linkedin',
])
export const influencerVertical = pgEnum('influencer_vertical', [
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
export const influencerStatus = pgEnum('influencer_status', ['active', 'prospect', 'past'])

// A creator the brands engage — booked, past, or still a name on a shortlist.
//
// **The first person record in this schema, and deliberately not a general one.**
// The Operations Hub's address book is a different table in a different service:
// its `ContactRead` files a person under the company they sit with, which is
// correct for a landlord's site manager and was only ever wrong for a creator. A
// `contacts` table wide enough to hold both would carry a follower count beside a
// `vendor_id`, which is two domains in one row.
//
// **Workspace-scoped with a many-to-many brand relation.** Outlets' argument
// unchanged: the screen filters and groups *by* brand, which is not a question a
// list holding one brand can answer, and a prospect nobody has booked has no
// brand at all. The relation is `influencer_brands` below, not a `uuid[]` column —
// see that table for why.
//
// No `agency_id`, no `email`, no `phone`. 1.39.0's decisions stand: a creator is
// reached at their handle, the mobile number is their agent's business, and an
// agency is a company you hold an agreement with (`vendors`, `contracts`), not the
// axis you file a person under.
//
// No CHECK constraints. No invariant here spans columns, so zod at the route
// boundary is the single enforcement point — the `brands.website_url` precedent,
// not the `brand_assets_source_exactly_one` one.
export const influencers = pgTable(
  'influencers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Derived from the **handle** at create and frozen after, so a shared link
    // survives a corrected spelling. Unique per workspace — see the index below.
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // Without the `@`. Every surface adds the sigil, and `InfluencerHandleSchema`
    // rejects a leading one rather than stripping it, so the column holds one
    // spelling of a handle and the unique key below means what it says.
    handle: text('handle').notNull(),
    platform: influencerPlatform('platform').notNull(),
    // **Not nullable**, and that is what makes the screen's reach-tier grouping
    // total: every row lands in exactly one band and the band counts always sum
    // to the rows. `features/influencers/tiers.ts` is written against that
    // promise. `integer` and not `bigint` — 2.1 billion is above every follower
    // count on any platform.
    followers: integer('followers').notNull(),
    // A percent — `3.80` is 3.8%. `null` = nobody has measured it, which is a real
    // state: a prospect you have not run a campaign with has no engagement
    // history.
    //
    // `numeric` rather than `real` because a rate is quoted to two decimals and a
    // float would render 3.8 as 3.7999999. **It comes back from `node-postgres` as
    // a string** — `'3.80'`, not `3.8` — and `rowToInfluencer` is what converts
    // it. That conversion is the one shape trap in this aggregate: it type-checks
    // clean either way and reaches the screen as `3.80%` in a column of `3.8%`.
    engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }),
    // `null` = a genuine generalist, not an unclassified row. There is no `other`
    // member for the same reason.
    vertical: influencerVertical('vertical'),
    // Defaults to `prospect`, not `active`. A creator somebody has just entered is
    // on a shortlist; nobody has booked them yet.
    status: influencerStatus('status').notNull().default('prospect'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The read path, and the table's own order: a workspace's creators, biggest
    // reach first. Descending in the index because that is the direction the query
    // scans — reach descending is the order a budget conversation happens in, and
    // it is the opposite of every other list in this schema.
    index('influencers_workspace_followers_idx').on(table.workspaceId, table.followers.desc()),
    // What makes `/influencers/priyaskin` resolve to exactly one row, and what
    // `uniqueInfluencerSlug` is picking a free value against. Per workspace,
    // because two workspaces are allowed the same readable handle.
    unique('influencers_workspace_slug_key').on(table.workspaceId, table.slug),
    // One row per creator per platform. Two platforms means two follower counts
    // and two engagement rates, so it is two rows; the same handle twice on one
    // platform is a duplicate import, not a second creator.
    unique('influencers_workspace_platform_handle_key').on(
      table.workspaceId,
      table.platform,
      table.handle,
    ),
  ],
)
