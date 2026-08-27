import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'

// What a photograph is *of* — interior, food, people, product.
//
// **A table and not a pgEnum**, because the request says the set must be
// editable per brand and an enum makes every edit a migration. See the note at
// the top of `brand_assets.ts` for what `ALTER TYPE … ADD VALUE` costs inside a
// batch the migrator runs as one transaction.
//
// Brand-scoped, so two brands can both have a category called "Food" and mean
// different things by it. `unique (brand_id, name)` is deliberately **not**
// here: a team that wants "Food" and "Food (styled)" is not making a mistake,
// and the one real duplicate is cheaper to fix by renaming than to prevent with
// a constraint that would 500 the first time somebody hit it.
export const photoCategories = pgTable(
  'photo_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Sparse ints, as `guideline_sections.priority` already is.
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('photo_categories_brand_position_idx').on(table.brandId, table.position)],
)
