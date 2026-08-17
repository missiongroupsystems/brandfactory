import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /**
     * The Passport organisation this workspace corresponds to, or NULL.
     *
     * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8b.
     * Decision: proposal §8 `D1-b`.
     *
     * **NULL is a first-class state, not a defect.** It means "Passport does not know about
     * this workspace yet" — either because Passport is unreachable, or because no super
     * admin has created the matching organisation. A `NOT NULL` column here would make the
     * outage path impossible, which is the entire reason `D1-b` was chosen.
     *
     * No foreign key to `passport.organization`. The projection carries no constraints by
     * design, and a cross-schema FK to a table the sync deletes rows from would refuse a
     * legitimate delete.
     */
    passportOrganizationId: uuid('passport_organization_id'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('workspaces_owner_user_id_idx').on(table.ownerUserId),
    index('workspaces_passport_organization_id_idx').on(table.passportOrganizationId),
  ],
)
