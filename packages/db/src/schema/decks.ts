import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'

// The named folder a team hangs deck versions off. `deck_versions` holds the
// stack; see that file for why the two tables are split rather than one wide
// table, and for the CHECK that is the whole argument for the split existing.
//
// **No `position`.** `vendor_brands`' rule: nothing orders decks against each
// other, so there is nothing a `position` column would record.
export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  // The read path: a brand's decks, in directory order.
  (table) => [index('decks_brand_name_idx').on(table.brandId, table.name)],
)
