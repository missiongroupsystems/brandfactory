import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'

// Member lists duplicated with `VendorCategorySchema` / `VendorStatusSchema` in
// `@brandfactory/shared`, per the zod-⇄-pgEnum convention `outlets.ts`,
// `social_posts.ts` and `influencers.ts` already follow; `vendor.test.ts` pins
// both lists.
export const vendorCategory = pgEnum('vendor_category', [
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
export const vendorStatus = pgEnum('vendor_status', ['active', 'inactive', 'blacklisted'])

// A company the workspace buys from — an agency, a studio, a press office, a tool.
//
// **The first counterparty record in this schema.** Seventeen tables held no
// company of any kind: `outlets` is a place the brand trades *from*, `brands` is
// the thing the work is for, `influencers` is a person the brand engages. None of
// the three could be widened into this one without carrying a lease or a follower
// count beside a UEN.
//
// **Workspace-scoped with a many-to-many brand relation**, not brand-scoped, for
// outlets' and influencers' reason unchanged: the screen filters *by* brand, which
// is not a question a list holding one brand can answer, and a vendor nobody has
// assigned yet has no brand at all. The relation is `vendor_brands`, not a
// `uuid[]` column — see that table for why.
//
// **No `kind` column.** 1.38.0 took the counterparty-kind control off the screen —
// marketing buys from no landlords — and left `VendorKind` on the record it
// controlled. It does not survive the move.
//
// **No contract columns.** The screen's `contracts_total`, `contracts_active` and
// `next_contract_end` were computed from `fixtures/contracts.ts`, and a count
// derived from a fixture beside a real row is a false statement that looks like a
// true one. Nothing here holds an agreement; `/contracts` is where they live.
//
// No CHECK constraints. The one invariant worth stating spans rows rather than
// columns — at most one primary contact — and it is a zod refinement on the wire,
// where a full-replacement write can satisfy it in a single request. Zod at the
// route boundary is the single enforcement point (`brands.website_url`'s
// precedent, not `brand_assets_source_exactly_one`'s).
export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Derived from the **name** at create and frozen after, so a shared link
    // survives a corrected spelling. Unique per workspace — see the index below.
    slug: text('slug').notNull(),
    // **Not unique**, unlike an influencer's `(platform, handle)`. A company name
    // is not an identifier: it carries legal suffixes, trading names and
    // abbreviations, so refusing "Sunbeam Social" because "Sunbeam Social Pte Ltd"
    // exists would refuse a legitimate second record while catching none of the
    // real duplicates. The slug takes a `-2` and the row lands.
    name: text('name').notNull(),
    // `null` = nobody has said; the `other` member = somebody said, and none of
    // these. Both are load-bearing and they are different facts.
    category: vendorCategory('category'),
    // Defaults to `active`, not to a prospect state. A vendor somebody enters is
    // one the business is already buying from.
    status: vendorStatus('status').notNull().default('active'),
    // The Singapore UEN, or whatever the equivalent registration is. `null` = not
    // recorded, which is most rows. **Unique when present** — see the index below.
    uen: text('uen'),
    // Validated as http/https at the wire boundary (`WebsiteUrlSchema`), because
    // it is rendered into an `href`.
    website: text('website'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The read path, and the table's own order: a workspace's vendors, A to Z.
    // Ascending, and not on anything derived — this list is read as a directory,
    // which is the opposite of `influencers_workspace_followers_idx` and its
    // deliberate `desc`.
    index('vendors_workspace_name_idx').on(table.workspaceId, table.name),
    // What makes `/vendors/northlight-talent` resolve to exactly one row, and what
    // `uniqueVendorSlug` is picking a free value against. Per workspace, because
    // two workspaces are allowed the same readable name.
    unique('vendors_workspace_slug_key').on(table.workspaceId, table.slug),
    // One company, one UEN. **This is the aggregate's 409** — a UEN genuinely is
    // an identifier where a name is not, so entering a company already in the book
    // is a duplicate rather than a second record.
    //
    // Postgres treats NULLs as distinct in a unique index, so the many unrecorded
    // rows cost nothing here and no partial index is needed. That property is
    // untestable through the screen and is pinned by `vendors.live.test.ts`.
    unique('vendors_workspace_uen_key').on(table.workspaceId, table.uen),
  ],
)
