import { date, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { workspaces } from './workspaces'

// Member lists duplicated with `OutletTypeSchema` / `OutletStatusSchema` in
// `@brandfactory/shared`, per the zod-⇄-pgEnum convention `social_posts.ts`
// already follows; the shared tests pin the lists.
export const outletType = pgEnum('outlet_type', [
  'restaurant',
  'bar',
  'cafe',
  'central_kitchen',
  'office',
])
export const outletStatus = pgEnum('outlet_status', [
  'pipeline',
  'fitting_out',
  'open',
  'temporarily_closed',
  'closed',
])

// A place the business trades from — open, or still a plan.
//
// **Workspace-scoped, brand optional.** Every other aggregate in this schema
// hangs off a brand, and this one deliberately does not: the outlets screen
// filters and groups *by* brand, which is not a question a list holding one
// brand can answer, and a site whose brand is undecided is a normal state rather
// than a row waiting for a foreign key.
//
// `brand_id` is therefore `ON DELETE SET NULL` and not `CASCADE`. Deleting a
// brand must not delete the premises — the lease outlives the branding, and a
// cascade here would destroy the record the next brand is going to be attached
// to.
//
// No CHECK constraints. The one invariant worth stating spans columns — a
// closing date should not precede an opening date — and it is not enforced
// anywhere yet: an imported row carrying both the wrong way round is a data
// fault to surface on screen, not a reason to refuse the import that found it.
// Zod at the route boundary is the single enforcement point for everything else
// (`brands.website_url`'s precedent).
export const outlets = pgTable(
  'outlets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    // Derived from the name at create and frozen after, so a shared link
    // survives a rename. Unique per workspace — see the index below.
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    outletType: outletType('outlet_type').notNull(),
    status: outletStatus('status').notNull().default('pipeline'),
    address: text('address'),
    unit: text('unit'),
    postalCode: text('postal_code'),
    // A tag list, not an enum: outlets arrive by import and a source system's
    // extra tag must not fail a batch. `@brandfactory/shared`'s
    // `OUTLET_ATTRIBUTES` is the offered catalogue, not the permitted set.
    attributes: text('attributes').array().notNull().default([]),
    // `date`, not `timestamp`. An outlet opens on a day where it stands; it does
    // not open at an instant that readers in two zones see as two days.
    targetOpeningDate: date('target_opening_date', { mode: 'string' }),
    openingDate: date('opening_date', { mode: 'string' }),
    closingDate: date('closing_date', { mode: 'string' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The read path: a workspace's outlets in directory order.
    index('outlets_workspace_name_idx').on(table.workspaceId, table.name),
    // The brand filter and the "By brand" grouping.
    index('outlets_brand_idx').on(table.brandId),
    // What makes `/outlets/casa-vostra` resolve to exactly one row, and what
    // `uniqueOutletSlug` is picking a free value against. Per workspace, because
    // two workspaces are allowed the same readable name.
    unique('outlets_workspace_slug_key').on(table.workspaceId, table.slug),
  ],
)
