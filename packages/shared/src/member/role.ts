import { z } from 'zod'

/**
 * Who may do what. The plan is
 * `docs/executing/members-passwords-and-brand-access-plan.md`.
 *
 * Member lists are duplicated with the pgEnums in
 * `packages/db/src/schema/users.ts` and `user_brands.ts`, per the zod-⇄-pgEnum
 * convention; `role.test.ts` pins the values the schemas refuse.
 */

/**
 * The workspace role. One value, and `null` for an ordinary member.
 *
 * **An enum, not bare text.** Launchpad stores the same thing as `text` and
 * shipped a bug for it: an unrecognised value fell through to *no admin
 * access*, so editing somebody's phone number revoked their administrator
 * access with nothing said. It handles the symptom by offering the stored
 * value as its own option and warning above every field. Two values and an
 * enum remove the cause instead — the database refuses junk, so no value can
 * arrive that the vocabulary does not list.
 */
export const WorkspaceRoleSchema = z.enum(['admin'])
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>

/**
 * The per-brand role. Presence of a `user_brands` row is access; the role says
 * how much.
 *
 * - `viewer` reads the brand and everything under it.
 * - `editor` reads and writes.
 * - `manager` is `editor` plus the brand's own settings.
 *
 * Launchpad's `user_brands` has no role column and documents around the gap.
 * It is also empty in production, so this shape has never carried data
 * anywhere — a reason to get the column in now rather than add it later.
 */
export const BrandRoleSchema = z.enum(['viewer', 'editor', 'manager'])
export type BrandRole = z.infer<typeof BrandRoleSchema>

/** Ascending authority. `indexOf` is the comparison; do not reorder. */
export const BRAND_ROLE_ORDER: readonly BrandRole[] = BrandRoleSchema.options

/**
 * What `credential_audit` records. One table for credential acts and
 * membership changes, because both answer *who did what to whose access*.
 *
 * `set-on-create` and `reset` are admin acts on somebody else's credential. A
 * person setting **their own** password writes no row: the table logs admin
 * acts on other people's credentials, and logging a self-set would make it
 * answer a different question than its name.
 */
export const CredentialAuditActionSchema = z.enum([
  'set-on-create',
  'reset',
  'granted',
  'revoked',
  'role_changed',
  'deactivated',
  'reactivated',
])
export type CredentialAuditAction = z.infer<typeof CredentialAuditActionSchema>
