import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Validated as http/https at the wire boundary (`BrandWebsiteUrlSchema`),
    // stored as plain text: a CHECK here would duplicate a rule that already
    // has one enforcement point and no second writer.
    websiteUrl: text('website_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('brands_workspace_id_idx').on(table.workspaceId)],
)
