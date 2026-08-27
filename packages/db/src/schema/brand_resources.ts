import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'

// Member list duplicated with `ResourceTypeSchema` in `@brandfactory/shared`,
// per the zod-⇄-pgEnum convention; the shared test pins both lists.
export const resourceType = pgEnum('resource_type', [
  'font',
  'image',
  'icon',
  'tool',
  'reference',
  'other',
])

// **No `deleted_at`.** Soft delete is `brand_assets`' and `canvas_blocks`' rule
// and it has a reason those two share (`docs/vision.md:51`): a discarded *idea*
// hides rather than vanishes. A link to a font shop is not a discarded idea, and
// the three aggregates built most recently — influencers, vendors, outlets —
// carry no `deleted_at` at all.
//
// **No `position`.** `vendor_brands` refused one and said why. The requirement
// asks for grouping by type and never for ordering inside a group; title order
// is the read order.
export const brandResources = pgTable(
  'brand_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: resourceType('type').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  // The read path is the whole list, grouped. No CHECK: no invariant here spans
  // columns, so zod at the route boundary is the single enforcement point — the
  // `brands.website_url` precedent, not `brand_assets_source_exactly_one`.
  (table) => [index('brand_resources_brand_type_idx').on(table.brandId, table.type)],
)
