import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { photoCategories } from './photo_categories'

export const assetKind = pgEnum('asset_kind', ['color', 'image', 'file'])
export const assetSource = pgEnum('asset_source', ['inline', 'blob', 'link'])
// `typeface` joined in 0011, which is its own file and adds nothing else:
// Postgres permits `ALTER TYPE … ADD VALUE` inside a transaction but forbids
// *using* the new value in that same transaction, and the migrator runs the
// whole pending batch in one. So no `UPDATE` anywhere may reference it — not in
// 0011, and not in 0010.
export const assetRole = pgEnum('asset_role', ['logo', 'mark', 'primary', 'typeface'])
export const assetStatus = pgEnum('asset_status', ['proposed', 'active'])
export const assetLibrary = pgEnum('asset_library', ['identity', 'photography', 'collateral'])

// One wide table on four orthogonal axes — `kind` (what it is), `source`
// (where the bytes live), `status` (how settled), `library` (which shelf it is
// filed on) — mirroring the shared `BrandAsset` discriminated union. Same shape
// and same reasoning as `canvas_blocks`: nullable per-variant columns beat
// table-per-variant when the read path wants all of them at once.
export const brandAssets = pgTable(
  'brand_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    kind: assetKind('kind').notNull(),
    source: assetSource('source').notNull(),
    // Nullable, and non-unique in every value it can take — see
    // `AssetRoleSchema`. `position` is what orders competing roles.
    role: assetRole('role'),
    status: assetStatus('status').notNull().default('active'),
    // **No `.default()`, deliberately.** A DB default would be a fourth home for
    // a rule that already lives in `defaultLibraryFor` and 0010's `CASE`, and it
    // would be wrong for two of the three shelves. The column is `NOT NULL` and
    // the server always supplies a value — see `POST /brands/:id/assets`.
    library: assetLibrary('library').notNull(),
    label: text('label').notNull(),
    // Exactly one of these three is set, per `source`. Enforced by the CHECK
    // below and by the shared union at the wire.
    value: text('value'),
    blobKey: text('blob_key'),
    url: text('url'),
    alt: text('alt'),
    mime: text('mime'),
    filename: text('filename'),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes'),
    // Sparse ints, as `guideline_sections.priority` already is.
    position: integer('position').notNull(),
    // **The pin, and it is a second axis rather than a replacement for
    // `position`.** The request draws the line itself: *the pin is a separate
    // mark on the photo, not the manual drag order the library already
    // supports.* So a pinned photo keeps the position somebody dragged it to,
    // and unpinning restores that order rather than dropping it at the end.
    //
    // The pair is `canvas_blocks`' exactly — see `is_pinned` / `pinned_at`
    // there. **No index here**, unlike that table: `listAssetsByBrand` reads
    // every non-deleted row of a brand in one query and the client sections it,
    // so the pin sorts a list already in memory. A partial index on pinned rows
    // would serve a per-shelf server-side read that does not exist; if one ever
    // arrives, the index it wants is `(brand_id, library, is_pinned DESC,
    // position)` — one composite covering the whole sort — and not the partial
    // shape, which finds pinned rows rather than ordering them.
    isPinned: boolean('is_pinned').notNull().default(false),
    // **Nullable, and that is not laziness.** Every photo in this table when the
    // column arrived had no category, and no rule could give it one:
    // `defaultLibraryFor` could derive a shelf from `kind` and `role` because
    // purpose was recoverable from the bytes, and nothing recovers *interior*
    // from a PNG. A backfill here would be a guess written into a column, which
    // is the failure `library.ts` opens by describing.
    //
    // `ON DELETE SET NULL`: deleting a category uncategorises its photos rather
    // than deleting them. A subject bucket is a filing decision, and undoing it
    // must not destroy what was filed.
    //
    // **No CHECK tying this to `library`.** Nothing stops a photography category
    // attaching to a logo, and that is a decision: only the photography screen
    // writes one, and a stray category on an identity asset is invisible rather
    // than corrupting — the `brands.website_url` precedent (one enforcement
    // point, no second writer) rather than the
    // `brand_assets_source_exactly_one` one (an invariant spanning columns that
    // several writers could break). Revisit if a second writer ever appears.
    categoryId: uuid('category_id').references(() => photoCategories.id, {
      onDelete: 'set null',
    }),
    pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'string' }),
    // Soft-delete — a discarded asset hides, it does not vanish
    // (`docs/vision.md:51`), which is why `DELETE` does not sweep its bytes.
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The read path: every asset of a brand, by kind, in order.
    index('brand_assets_brand_kind_position_active_idx')
      .on(table.brandId, table.kind, table.position)
      .where(sql`${table.deletedAt} IS NULL`),
    // The shelf path: one library's rows, in order. The `(kind, position)`
    // index above stays and stays the read order — `listAssetsByBrand` returns
    // the whole brand and the client sections it, so this one is here for the
    // per-shelf counts and any future server-side filter.
    index('brand_assets_brand_library_position_active_idx')
      .on(table.brandId, table.library, table.position)
      .where(sql`${table.deletedAt} IS NULL`),
    // `BrandMark`'s path: the brand's logo, which is a role lookup.
    index('brand_assets_brand_role_active_idx')
      .on(table.brandId, table.role)
      .where(sql`${table.deletedAt} IS NULL AND ${table.status} = 'active'`),
    // The belt-and-braces half of the exactly-one-of rule. Worth duplicating
    // the shared union in SQL — unlike `brands.website_url`, which deliberately
    // has no CHECK — because this invariant spans three columns and any future
    // writer that reaches the table without going through a route could
    // plausibly violate it. There is a test that inserts a violating row and
    // expects this to fire; a CHECK nobody has seen fail is a CHECK that may
    // not exist.
    check(
      'brand_assets_source_exactly_one',
      sql`(
    (${table.source} = 'inline' AND ${table.value} IS NOT NULL AND ${table.blobKey} IS NULL AND ${table.url} IS NULL) OR
    (${table.source} = 'blob' AND ${table.blobKey} IS NOT NULL AND ${table.value} IS NULL AND ${table.url} IS NULL) OR
    (${table.source} = 'link' AND ${table.url} IS NOT NULL AND ${table.value} IS NULL AND ${table.blobKey} IS NULL)
  )`,
    ),
  ],
)
