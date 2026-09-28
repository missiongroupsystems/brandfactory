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
    // The Mission Events outlet that stands for this brand — a *concept* in
    // that product's vocabulary, where an event names an outlet and no brand
    // entity exists at all.
    //
    // **Stored, never inferred.** Six of the seven brands match an Events
    // outlet by slug and `Firebird by Suetomi` matches `firebird`, so a
    // normaliser would work today and would quietly file the next brand under
    // whichever concept had a similar name. A wrong mapping here shows another
    // brand's parties on this brand's calendar.
    //
    // **No foreign key**, for the reason `social_posts.events_event_id` has
    // none: the row lives in another database owned by another app. An event
    // whose outlet maps to no brand is dropped from the calendar and counted,
    // so a missing mapping is visible rather than silent.
    eventsOutletId: uuid('events_outlet_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('brands_workspace_id_idx').on(table.workspaceId)],
)
