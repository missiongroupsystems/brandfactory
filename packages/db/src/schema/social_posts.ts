import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { brandAssets } from './brand_assets'
import { brands } from './brands'

// Member lists duplicated with `SocialPlatformSchema` / `SocialPostStatusSchema`
// in `@brandfactory/shared`, per the zod-⇄-pgEnum convention; the shared tests
// pin both lists against each other.
export const socialPlatform = pgEnum('social_platform', [
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'x',
  'youtube',
  'pinterest',
  'other',
])
export const socialPostStatus = pgEnum('social_post_status', ['draft', 'ready', 'posted'])

// Who wrote the row. **The word is `agent`, not `planner`** — the same two
// members `guideline_section_created_by` and `canvas_block_created_by` already
// carry, and CLAUDE.md's one-word-one-meaning rule outranks the fact that this
// particular writer is called the Post Planner.
export const socialPostCreatedBy = pgEnum('social_post_created_by', ['user', 'agent'])

// A planned post, not a published one — the social calendar is a conceptual
// scheduling tool (`docs/executing/social-calendar.md`), so the row is
// deliberately small: destination, slot, copy, status. Nothing publishes and
// nothing auto-flips `status` when `scheduled_at` passes.
//
// No CHECK constraints: no invariant here spans columns, so zod at the route
// boundary is the single enforcement point (the `brands.website_url`
// precedent, not the `brand_assets_source_exactly_one` one).
export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    platform: socialPlatform('platform').notNull(),
    // `null` = unscheduled — the idea tray in the list view, a first-class
    // state, not an error.
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'string' }),
    // `''` = slot claimed, copy pending.
    body: text('body').notNull().default(''),
    status: socialPostStatus('status').notNull().default('draft'),
    // Provenance, and it cannot be backfilled — a column added after the
    // planner ships starts empty for every row the planner already wrote.
    //
    // The default is what makes the migration honest rather than merely
    // convenient: every row in this table today was typed by a person, so
    // `'user'` is the true value for all of them.
    //
    // Paired with `status`, this is the question a marketer actually asks:
    // `created_by = 'agent' AND status = 'draft'` is the unreviewed pile, and
    // it is the only pile that matters before something goes out under the
    // brand's name. That composition is why the column exists — see
    // `SocialPostCreatedBySchema`.
    createdBy: socialPostCreatedBy('created_by').notNull().default('user'),
    // Soft-delete — a discarded post hides, it does not vanish
    // (`docs/vision.md:51`); its join rows stay put so restore brings the
    // attachments back intact.
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The read path: a brand's live plan in calendar order
    // (`scheduled_at asc nulls first, created_at asc`).
    index('social_posts_brand_scheduled_active_idx')
      .on(table.brandId, table.scheduledAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

// Attachments as a join table, never blob columns: posts hold no `blobKey`s,
// so blob lifecycle stays entirely owned by `brand_assets` —
// `listBlobKeysByBrand` / `listStillReferencedBlobKeys` need no changes, and
// brand delete neither leaks nor over-deletes bytes.
//
// Join rows survive asset soft-delete on purpose: the client resolves
// `assetIds` against the live asset list and skips unresolved ids, so
// restoring an asset brings it back onto its posts for free — the same
// recoverability contract soft-delete has everywhere else.
export const socialPostAssets = pgTable(
  'social_post_assets',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => brandAssets.id, { onDelete: 'cascade' }),
    // Display order, written as `(i + 1) * 100` on every full replacement —
    // sparse ints, as `brand_assets.position` already is.
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.assetId] }),
    // The `asset_id → posts` direction: the cascade when an asset is hard-
    // deleted, and any future "which posts use this asset" affordance.
    index('social_post_assets_asset_idx').on(table.assetId),
  ],
)
