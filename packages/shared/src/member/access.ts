import { BRAND_ROLE_ORDER, type BrandRole, type WorkspaceRole } from './role'

/**
 * The access rules, as pure functions over two facts: the person's row and
 * their grant on the brand in question.
 *
 * **One definition, imported by three callers** — `packages/server/src/authz.ts`,
 * and both frontends' rendering gates. The house rule this follows is
 * Launchpad's:
 *
 * > *"Permission gates are computed, never attempted … it is a rendering gate,
 * > not a security boundary — the service re-checks everything, so getting it
 * > wrong makes the UI wrong, never the data."*
 *
 * So a frontend may call these to decide whether to draw a control, and may
 * never treat the answer as the reason the data is safe. The server calls the
 * same functions, and its call is the boundary.
 *
 * **No RLS.** Launchpad enforces the equivalent in Postgres with session
 * variables and paid for it: a request-long transaction that became a
 * connection-pool crisis, a policy whose own subquery was filtered so a
 * directory silently returned one row, four tables needing explicit `REVOKE`,
 * and a replay harness built only so a policy could be changed safely. At this
 * size one tested function is the honest boundary, and RLS can land later as a
 * second rail over a model that already works.
 */

/** The slice of a `users` row these rules read. Nothing else is relevant. */
export interface AccessSubject {
  role: WorkspaceRole | null
  deactivatedAt: string | null
}

/**
 * Deactivation is reversible and revokes at the gate. Checked before anything
 * else, including admin: an administrator whose access was withdrawn is
 * withdrawn.
 */
export function isActive(user: AccessSubject): boolean {
  return user.deactivatedAt === null
}

export function isAdmin(user: AccessSubject): boolean {
  return isActive(user) && user.role === 'admin'
}

/**
 * Whether the person may read the brand, given their grant on it (`null` for
 * no grant).
 *
 * An admin needs no grant — that is what the workspace role means, and it is
 * why `user_brands` holds no rows for one.
 */
export function canReadBrand(user: AccessSubject, grant: BrandRole | null): boolean {
  if (!isActive(user)) return false
  if (isAdmin(user)) return true
  return grant !== null
}

/**
 * Whether the person may write to the brand.
 *
 * ⚠️ **No route enforces this yet.** Read access is enforced from Phase C;
 * `viewer` versus `editor` is not, because enforcing it means a write gate on
 * every mutating route and that is its own phase. Until then this function is
 * correct and unused by the server, and **Phase D refuses to store a `viewer`
 * grant** rather than let the column imply a restriction nothing applies. Do
 * not ship a UI that offers `viewer` before the write gate exists: a grant
 * whose meaning is not enforced is worse than no column at all.
 */
export function canWriteBrand(user: AccessSubject, grant: BrandRole | null): boolean {
  if (!isActive(user)) return false
  if (isAdmin(user)) return true
  if (grant === null) return false
  return BRAND_ROLE_ORDER.indexOf(grant) >= BRAND_ROLE_ORDER.indexOf('editor')
}
