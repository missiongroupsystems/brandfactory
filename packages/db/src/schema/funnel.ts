import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { socialPosts } from './social_posts'

// A brand's user journey, in order. **`position` earns its column here** where
// `brand_resources` and `decks` refused one: the request's whole subject is
// *ordered stages*, and a journey read out of order is not a journey.
export const funnelStages = pgTable(
  'funnel_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('funnel_stages_brand_position_idx').on(table.brandId, table.position)],
)

// Where a brand shows up — Instagram, Google Ads, email, the shop window.
//
// **Brand-scoped rows and not `social_platform`.** That enum has eight *social*
// members; a funnel names channels well outside it, and reusing it would file
// three quarters of a brand's funnel under `other`. Rows also settle the
// vocabulary question without a migration: a brand can name one *the shop
// window*.
export const platforms = pgTable(
  'platforms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Nullable: not every place a brand shows up has a URL.
    url: text('url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('platforms_brand_name_idx').on(table.brandId, table.name)],
)

// Which platforms serve which stage — **the third many-to-many in this schema,
// and it earns it for the same reason as the first two.**
//
// Instagram serves Awareness and it serves Loyalty. As a row belonging to one
// stage it would be typed twice, its link typed twice, and a correction applied
// to one of the two. `vendor_brands` and `influencer_brands` each left a
// docstring explaining why an array or a duplicate would not do; this is that
// argument a third time.
export const stagePlatforms = pgTable(
  'stage_platforms',
  {
    stageId: uuid('stage_id')
      .notNull()
      .references(() => funnelStages.id, { onDelete: 'cascade' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // The pair is the row, exactly as in `vendor_brands`. It is also what makes a
    // duplicate a unique violation rather than two link rows.
    primaryKey({ columns: [table.stageId, table.platformId] }),
    // The reverse read — "which stages does this platform serve" — which the
    // primary key's own index cannot answer, since it leads with `stage_id`.
    index('stage_platforms_platform_idx').on(table.platformId),
  ],
)

// Member list duplicated with `FunnelActivityStatusSchema` in
// `@brandfactory/shared`, per the zod-⇄-pgEnum convention.
export const funnelActivityStatus = pgEnum('funnel_activity_status', [
  'planned',
  'running',
  'paused',
  'done',
])

// What the brand runs at a stage, now.
//
// **`platform_id` restricts rather than cascades.** An activity whose platform
// vanished is an activity that ran nowhere; platforms are cheap to keep, and a
// cascade here would delete work records as a side effect of tidying a channel
// list. `ON DELETE RESTRICT` makes the screen ask instead.
//
// **No CHECK tying the dates to the status.** A Done activity with no end date
// is a record somebody has not finished filling in, not a corrupt row — this
// screen is for planning rather than bookkeeping.
export const funnelActivities = pgTable(
  'funnel_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => funnelStages.id, { onDelete: 'cascade' }),
    platformId: uuid('platform_id').references(() => platforms.id, { onDelete: 'restrict' }),
    // **The typed link, and only one of the three the request named is real.**
    //
    // The request lets an activity point at *"a social-calendar push, an
    // influencer program, or a contract"*. Of those three, only the first has a
    // table: there is no `program` record anywhere in this schema, and contracts
    // are a 647-line fixture whose own docstring says there is no server. So this
    // is one nullable column rather than a polymorphic pair, and the other two
    // arrive as columns beside it when their aggregates do — which is the shape
    // that stays honest in the meantime, because a `target_type` enum listing two
    // values nothing can hold is a lie the schema tells about itself.
    //
    // `ON DELETE SET NULL`: deleting a post must not delete the activity that
    // referenced it. The plan survives the post — that is the whole point of the
    // funnel being a planning surface rather than a log.
    socialPostId: uuid('social_post_id').references(() => socialPosts.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    status: funnelActivityStatus('status').notNull().default('planned'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('funnel_activities_stage_idx').on(table.stageId)],
)
