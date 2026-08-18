import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { influencers } from './influencers'

// Which brands a creator is engaged for — **the first many-to-many between a
// brand and anything in this schema.**
//
// A join table and not a `uuid[]` column on `influencers`, and the reason is a
// rendering one rather than a purity one. An array cannot carry a foreign key:
// delete a brand and every array holding its id keeps holding it. The influencers
// table resolves those ids against a cached brand index, and its rule is that *a
// cached index that has not arrived is a pending request, never a missing fact* —
// so an unresolvable id renders as `…`. A dangling id and a request in flight
// would then look identical, permanently, in the one cell that rule exists to
// protect.
//
// **Both sides cascade.** Deleting a brand removes the *link* and keeps the
// creator, which is the many-to-many equivalent of the `ON DELETE SET NULL`
// outlets chose for `brand_id`, and for the same reason: the relationship outlives
// the branding, and the creator is the record the next brand gets attached to.
// Deleting a creator takes their links with them; there is nothing left to
// describe.
//
// No `position` column, unlike `social_post_assets`. The wire sorts `brandIds`
// server-side so two reads of one row are byte-identical, and nothing about a
// creator's brands has an order a person chose — a set of ticked boxes is a set.
export const influencerBrands = pgTable(
  'influencer_brands',
  {
    influencerId: uuid('influencer_id')
      .notNull()
      .references(() => influencers.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // The pair is the row. It is also what makes a duplicate `brandId` in one body
    // a unique violation rather than two link rows — which is why
    // `InfluencerBrandIdsSchema` rejects duplicates at the wire, so the violation
    // is never reached.
    primaryKey({ columns: [table.influencerId, table.brandId] }),
    // The `brand_id → creators` direction: the cascade when a brand is deleted, and
    // any future "which creators work for this brand" read. The primary key's own
    // index leads with `influencer_id`, so it cannot serve this one.
    index('influencer_brands_brand_idx').on(table.brandId),
  ],
)
