import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Duplicated with `CredentialAuditActionSchema` in `@brandfactory/shared`'s
// `member/role.ts`, per the zod-⇄-pgEnum convention.
export const credentialAuditAction = pgEnum('credential_audit_action', [
  'set-on-create',
  'reset',
  'granted',
  'revoked',
  'role_changed',
  'deactivated',
  'reactivated',
])

// Who changed whose access, and when. The plan is
// `docs/executing/members-passwords-and-brand-access-plan.md`.
//
// ⚠️ **IT STORES NO PASSWORD, and it never will.** It records *that* a
// credential was set and *who* set it, never what it was.
//
// **No foreign keys, and the emails are denormalised.** An audit row is a
// record of an act, not a relationship. With no FK a hard delete leaves the
// ids standing, which is more information than a cascaded-away row, and the
// stored email still says who the act was about. Launchpad reached the same
// shape the hard way: an FK from its audit table to `users` took `FOR KEY
// SHARE` on a row the request's own transaction held `FOR UPDATE`, and every
// user create deadlocked for two months.
//
// **A person setting their own password writes no row.** This table logs admin
// acts on other people's credentials; somebody choosing their own password is
// not one, and logging it would make the table answer a different question
// than its name.
//
// ⚠️ **Nothing reads this yet.** An unread audit table returns zero rows and
// no error, which reads as *nobody has ever done anything*. Whoever builds the
// reader should confirm it against a row they just wrote.
export const credentialAudit = pgTable(
  'credential_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    subjectId: uuid('subject_id'),
    subjectEmail: text('subject_email'),
    action: credentialAuditAction('action').notNull(),
    // Set on the three membership actions, null on the credential ones.
    brandId: uuid('brand_id'),
    fromRole: text('from_role'),
    toRole: text('to_role'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('credential_audit_subject_idx').on(table.subjectId, table.createdAt),
    index('credential_audit_created_idx').on(table.createdAt),
  ],
)
