import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Duplicated with `WorkspaceRoleSchema` in `@brandfactory/shared`'s
// `member/role.ts`, per the zod-⇄-pgEnum convention.
export const workspaceRole = pgEnum('workspace_role', ['admin'])

export const users = pgTable(
  'users',
  {
    // **The Supabase `sub`, not a value of ours.** `upsertUserById` conflicts
    // on this column only, so a row created with a random uuid instead would
    // collide on `email` the first time its owner signed in, and the adapter
    // swallows that error — leaving a row nothing can ever reach. Whatever
    // creates a user must take the `sub` from the auth account first.
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name'),
    // `null` is an ordinary member. See `member/role.ts` on why this is an
    // enum rather than text.
    role: workspaceRole('role'),
    // **Set by an admin, cleared only by the person themselves.** True means
    // somebody else chose the password on this account, so the only routes
    // this user may call are the three on the flagged allow-list.
    //
    // A Google sign-in does **not** clear it. Until the person sets their own
    // password, the one their admin chose is a live credential that was read
    // off a screen and sent through a chat message.
    //
    // Default true: a row that arrives without an opinion arrived from an
    // admin create, which is the case that must be flagged.
    mustSetPassword: boolean('must_set_password').notNull().default(true),
    // Presence revokes at the gate. Reversible on purpose — for nine people a
    // deactivation is nearly always temporary, and a hard delete can come
    // later behind a typed-email confirmation.
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // **The unique constraint on `email` is case-sensitive**, so `Bob@x.com`
    // and `bob@x.com` can both exist. On a path that hands out a session that
    // is a way to authenticate somebody as the wrong person, and the admin
    // create is a path that types an address by hand. Launchpad has the same
    // constraint, hit the same gap, and names this index as its own owed fix.
    uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  ],
)
