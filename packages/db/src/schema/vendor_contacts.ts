import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { vendors } from './vendors'

// The people at a vendor — the account manager, the producer, the person who
// answers the phone.
//
// **A value object, not an entity, and the columns it does not have say so.** No
// surrogate id and no timestamps: the write replaces the whole list, so a
// `created_at` would reset on every unrelated edit of the vendor and read as a
// lie about when somebody joined. `(vendor_id, position)` is the key and the wire
// is a plain ordered array — `brand_assets.position` and `canvas_blocks.position`
// are the precedent for an ordered child row.
//
// **This is not the Operations Hub's `contacts` table.** That one is the address
// book: a standalone row with its own id, edited from the tenancy sheet and the
// review queue, outliving any single vendor write. Two records that both describe
// a person, in two services, and neither is the other with extra columns. The
// address book is untouched by this aggregate.
//
// **At most one `is_primary`, and it is not enforced here.** A partial unique
// index would refuse the second half of a primary swap; a full-replacement write
// satisfies the rule in one request, so the check is a zod refinement on
// `VendorContactsSchema` at the route boundary. The repo's stated rule — no CHECK
// constraints, zod as the single enforcement point — and here it also removes
// work rather than only moving it.
//
// The whole list goes with the vendor by cascade. A contact with no company is
// not a record this table can describe.
export const vendorContacts = pgTable(
  'vendor_contacts',
  {
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    // The order the form sent them, which is the order they are read back in.
    // Dense from 0 because the write replaces the list: there is no gap for a
    // removed row to leave behind.
    position: integer('position').notNull(),
    name: text('name').notNull(),
    role: text('role'),
    email: text('email'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.vendorId, table.position] })],
)
