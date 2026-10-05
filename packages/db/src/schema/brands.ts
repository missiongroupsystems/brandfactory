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
    // **Stored, never inferred**, and production is the argument rather than
    // the counter-example. Verified 5 October 2026: six of the seven brands are
    // mapped, every one to a live outlet whose slug is just its name
    // lower-cased — `carlitos`, `casa-vostra`, `chin-mee-chin`, `petra`,
    // `temper`, `willow`. A normaliser would work on all six.
    //
    // It is still wrong, for a reason that only showed up on the real data:
    // **their `slug` is not unique.** `carlitos`, `chin-mee-chin`, `firebird`,
    // `temper` and `willow` each exist twice over there, one row soft-deleted
    // and one live, and the deleted `temper` is named `Temper.` while the live
    // one is `Temper`. Matching on a slug would have to pick between them, and
    // the id does not. A wrong mapping here shows another brand's parties on
    // this brand's calendar.
    //
    // The seventh brand is `Mission Group`, which is group-level and has no
    // outlet to map to. `null` there is the right answer, not a gap.
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
