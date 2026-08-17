import type { PassportAccess } from './passport/access'
import type { ResolvedBrand } from './structure'

/**
 * Who may reach a workspace and a brand, once Passport owns structure.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8d.
 * Decision: proposal §8 `D1-b`.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ WRITTEN AND TESTED, DELIBERATELY NOT WIRED IN
 * ---------------------------------------------------------------------------
 *
 * `authz.ts` still runs the interim shared-access model, and arming this before the
 * operator gate is not a change of behaviour — **it is a lockout of everyone**.
 *
 * The gate (plan, "The operator gate") is `unit_app_membership > 0` and `unmatched = 0`. Until
 * an organisation, an entitlement and the memberships exist in Passport, every derivation
 * returns an empty map and every rule below denies. `D1-b` does not soften that: with an
 * empty projection every local row is unlinked, and the unlinked rules need an active org
 * membership, of which there are none.
 *
 * So this module is pure and complete, and `authz.ts` calls it on the day the gate passes.
 * That is one edit, reviewable on its own, rather than a behaviour change buried in a phase.
 *
 * ---------------------------------------------------------------------------
 * The ladder is ALREADY in `rolesByUnit`. Do not check it again.
 * ---------------------------------------------------------------------------
 *
 * `access.ts` documents the derivation: an org `Owner`/`Admin` reaches a unit **through**
 * `rolesAtUnits`, alongside an explicit role row and the cascade. So the linked-brand rule is
 * a single map lookup, and adding `|| orgRole === 'Owner'` beside it would not be defensive —
 * it would **over-permit**, granting an Owner a unit that carries no `unit_app_access` row,
 * which by Passport's own rule confers access to nobody.
 */

/** Why a decision went the way it did. Logged, and asserted in tests. */
export type AccessVia =
  | 'passport-role'
  | 'unlinked-brand-org-member'
  | 'linked-workspace-org-member'
  | 'unlinked-workspace-creator'

export type AccessDenial =
  | 'no-passport-identity'
  | 'not-an-active-member'
  | 'not-entitled'
  | 'no-role-at-this-unit'
  | 'not-the-creator'
  | 'wrong-organisation'

export type AccessDecision =
  | { allowed: true; via: AccessVia }
  | { allowed: false; because: AccessDenial }

const allow = (via: AccessVia): AccessDecision => ({ allowed: true, via })
const deny = (because: AccessDenial): AccessDecision => ({ allowed: false, because })

export interface WorkspaceFacts {
  /** The workspace's Passport organisation, or null when Passport does not know it. */
  organizationId: string | null
  ownerUserId: string
}

/**
 * Reach a workspace.
 *
 * | Workspace | Rule |
 * | --- | --- |
 * | **unlinked** | its **creator only** |
 * | linked | an active member of that organisation, with this app entitled |
 *
 * **The unlinked rule is narrow on purpose.** There is no organisation to scope membership
 * against, so the alternative would be "every authenticated user" — the interim model this
 * whole phase exists to remove. Creating an entire organisation during an outage is rare, so
 * the narrow rule costs little; a brand inside an existing workspace is the case that matters
 * and it is handled below.
 *
 * `access` is the caller's derivation **for this workspace's organisation**. Passing another
 * org's is the cross-tenant bug, so it is checked rather than trusted.
 */
export function decideWorkspaceAccess(input: {
  workspace: WorkspaceFacts
  userId: string
  access: PassportAccess | null
}): AccessDecision {
  const { workspace, userId, access } = input

  if (workspace.organizationId === null) {
    return workspace.ownerUserId === userId
      ? allow('unlinked-workspace-creator')
      : deny('not-the-creator')
  }

  if (!access) return deny('no-passport-identity')
  // Never trust the caller to have derived for the right org. A mismatch here is a
  // cross-tenant grant, and it is the kind of thing a refactor introduces silently.
  if (access.organizationId !== workspace.organizationId) return deny('wrong-organisation')
  // `orgRole` is null for ANY membership that is not active — a FULL gate, including
  // suspension, which deliberately does not cascade to role rows.
  if (access.orgRole === null) return deny('not-an-active-member')
  if (!access.entitled) return deny('not-entitled')

  return allow('linked-workspace-org-member')
}

/**
 * Reach a brand.
 *
 * | Brand | Rule |
 * | --- | --- |
 * | **linked** | `rolesByUnit[unitId]` — an explicit role, the cascade, or the org ladder |
 * | **unlinked** | any active member of the workspace's organisation, with this app entitled |
 *
 * ⚠️ **The unlinked rule is a knowing widening, and it is the weakest part of `D1-b`.**
 * During the window before a brand links, it is visible to the whole organisation rather than
 * to the people holding a role at it. Three things bound it, none of which removes it:
 *
 * - the window is short — the queued create links the row as soon as Passport answers;
 * - the count of unlinked brands is surfaced to Admins, so an outage that never resolves is
 *   visible rather than assumed;
 * - an unlinked brand confers no structure-write capability, because the write client refuses
 *   any token that is not Passport-issued.
 *
 * Note that the unlinked rule tests `entitled`, **not** `hasAccess`. `hasAccess` additionally
 * requires a unit carrying this app, which an unlinked brand by definition does not have — so
 * using it would deny every member of an organisation whose brands are all still waiting, the
 * exact state after an outage.
 */
export function decideBrandAccess(input: {
  brand: Pick<ResolvedBrand, 'unitId' | 'organizationId'>
  workspace: WorkspaceFacts
  userId: string
  access: PassportAccess | null
}): AccessDecision {
  const { brand, workspace, userId, access } = input

  // The workspace gate runs FIRST, and it is not redundant. An unlinked workspace has no
  // organisation, so neither brand rule below can be evaluated at all — and skipping straight
  // to the brand would read `access` for an org that does not exist.
  const workspaceDecision = decideWorkspaceAccess({ workspace, userId, access })
  if (!workspaceDecision.allowed) return workspaceDecision

  // An unlinked workspace admitted its creator. Everything inside it follows, because there
  // is no Passport structure under it to scope against.
  if (workspace.organizationId === null) return allow('unlinked-workspace-creator')

  // Past the workspace gate, `access` is non-null, active and entitled for this org.
  const derived = access!

  if (brand.unitId === null) {
    // The widening. See the note above.
    return allow('unlinked-brand-org-member')
  }

  // ONE map lookup. The ladder and the cascade are already inside it — see the header.
  return derived.rolesByUnit[brand.unitId] !== undefined
    ? allow('passport-role')
    : deny('no-role-at-this-unit')
}
