import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
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
    // Derived from the **name** at create and frozen after, so a shared link
    // survives a corrected spelling. Unique per workspace — see the index below.
    //
    // It came from the handle until `influencer_accounts` landed. A person carries
    // up to ten handles now, so naming the URL after one of them would be the
    // arbitrary choice that change removed. **No slug already in the table moved**:
    // migration 0016 touches no `slug` value, so every link shared before it still
    // resolves.
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // `handle`, `platform`, `followers` and `engagement_rate` used to sit here.
    // They describe an **account**, not a person, and they moved to
    // `influencer_accounts` in migration 0016. Nothing about them was widened on
    // the way down; they were declared on the wrong noun, which is a different
    // defect from being wrong.

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
    // The tie-break in `byInfluencerReach`, and the nearest thing this table has
    // to a read path of its own. **`influencers_workspace_followers_idx` is
    // gone** — there is no `followers` column to index, and reach is now a sum
    // over the child rows. `listInfluencersByWorkspace` sorts the assembled array
    // in memory; see its docstring for the size that stops being true at.
    index('influencers_workspace_name_idx').on(table.workspaceId, table.name),
    // What makes `/influencers/priya-raman` resolve to exactly one row, and what
    // `uniqueInfluencerSlug` is picking a free value against. Per workspace,
    // because two workspaces are allowed the same readable name.
    unique('influencers_workspace_slug_key').on(table.workspaceId, table.slug),
    // `influencers_workspace_platform_handle_key` moved to
    // `influencer_accounts` with the two columns it named.
  ],
)
