import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { vendors } from './vendors'

// Which brands a company works on — `influencer_brands`' shape exactly, and for
// the same reasons.
//
// A join table and not a `uuid[]` column on `vendors`, and the reason is a
// rendering one rather than a purity one. An array cannot carry a foreign key:
// delete a brand and every array holding its id keeps holding it. The vendors
// table resolves those ids against a cached brand index, and its rule is that *a
// cached index that has not arrived is a pending request, never a missing fact* —
// so an unresolvable id renders as `…`. A dangling id and a request in flight
// would then look identical, permanently, in the one cell that rule exists to
// protect.
//
// **The link is a stated fact, not a projection.** The Brands column on this
// screen used to be computed from `fixtures/contracts.ts`' `brand_ids_covered`:
// which brands the company happens to hold live agreements for. This table
// answers a different question — which brands the company *works on* — and it is
// the one a person can actually enter.
//
// **Both sides cascade.** Deleting a brand removes the *link* and keeps the
// vendor; the relationship outlives the branding, and the vendor is the record the
// next brand gets attached to. Deleting a vendor takes their links with them;
// there is nothing left to describe.
//
// No `position` column. The wire sorts `brandIds` server-side so two reads of one
// row are byte-identical, and a set of ticked boxes is a set.
export const vendorBrands = pgTable(
  'vendor_brands',
  {
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // The pair is the row. It is also what makes a duplicate `brandId` in one body
    // a unique violation rather than two link rows — which is why
    // `VendorBrandIdsSchema` rejects duplicates at the wire, so the violation is
    // never reached.
    primaryKey({ columns: [table.vendorId, table.brandId] }),
    // The `brand_id → vendors` direction: the cascade when a brand is deleted, and
    // any future "which vendors work on this brand" read. The primary key's own
    // index leads with `vendor_id`, so it cannot serve this one.
    index('vendor_brands_brand_idx').on(table.brandId),
  ],
)
