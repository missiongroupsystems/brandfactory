import { index, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'
import { users } from './users'

// Duplicated with `BrandRoleSchema` in `@brandfactory/shared`'s
// `member/role.ts`, per the zod-⇄-pgEnum convention.
export const brandRole = pgEnum('brand_role', ['viewer', 'editor', 'manager'])

// Which brands a person may reach, and how much they may do there. The plan is
// `docs/completions/members-passwords-and-brand-access-plan.md`.
//
// **Presence is access; the role is the degree.** A workspace admin needs no
// row — `isAdmin` short-circuits ahead of this table — so a row here is only
// ever about an ordinary member.
//
// **One table, not two.** An earlier draft proposed `workspace_members` beside
// this one, with the workspace role as a row. Folding the admin flag onto the
// user instead keeps "is an admin" from being maintained as a row per brand,
// which is the state that drifts the first time somebody adds a brand.
//
// **Cascade from the user, cascade from the brand.** Access to a deleted brand
// is not a fact worth keeping, and a deleted user's grants are not either. The
// record that the grant existed lives in `credential_audit`, which holds no
// foreign keys for exactly this reason.
export const userBrands = pgTable(
  'user_brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    role: brandRole('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('user_brands_user_brand_key').on(table.userId, table.brandId),
    // The read path: every brand one person reaches, resolved on each request.
    // There is no cache in front of this — see the plan on why Launchpad's
    // 60-second one is the source of its worst failure shape.
    index('user_brands_user_idx').on(table.userId),
    index('user_brands_brand_idx').on(table.brandId),
  ],
)
