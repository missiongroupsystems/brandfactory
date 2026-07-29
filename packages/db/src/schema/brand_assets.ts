import { sql } from 'drizzle-orm'
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'

export const assetKind = pgEnum('asset_kind', ['color', 'image', 'file'])
export const assetSource = pgEnum('asset_source', ['inline', 'blob', 'link'])
export const assetRole = pgEnum('asset_role', ['logo', 'mark', 'primary'])
export const assetStatus = pgEnum('asset_status', ['proposed', 'active'])

// One wide table on three orthogonal axes — `kind` (what it is), `source`
// (where the bytes live), `status` (how settled) — mirroring the shared
// `BrandAsset` discriminated union. Same shape and same reasoning as
// `canvas_blocks`: nullable per-variant columns beat table-per-variant when the
// read path wants all of them at once.
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
