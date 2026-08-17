import { describe, expect, it } from 'vitest'
import type { PassportAccess } from './passport/access'
import { decideBrandAccess, decideWorkspaceAccess } from './structure-access'

/**
 * The access rules phase 8d will arm.
 *
 * Plan: phase 8d. Decision: proposal §8 `D1-b`.
 *
 * These run against a pure function, because arming the rules before the operator gate is a
 * lockout of everyone. Testing them now means the risky edit later is one line, already
 * covered.
 *
 * Four properties are worth more than the rest, and each fails silently:
 *
 * 1. **A suspended member is denied.** Suspension deliberately does not cascade to role rows,
 *    so their `unit_app_membership` rows are still `active` and a rule that only read those
 *    would let a disabled person keep working.
 * 2. **An org Owner is denied at a unit that carries no `unit_app_access` row.** The ladder is
 *    already inside `rolesByUnit`; re-checking `orgRole` beside it over-permits.
 * 3. **Cross-org derivation is refused rather than trusted.**
 * 4. **An unlinked brand is visible to an org member with NO unit role** — the knowing
 *    widening, asserted so that it is deliberate rather than accidental.
 */

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const UNIT = 'unit-1'
const CREATOR = 'user-creator'
const OTHER_USER = 'user-other'

function access(over: Partial<PassportAccess> = {}): PassportAccess {
  return {
    platformUserId: 'p-1',
    organizationId: ORG,
    orgRole: 'Member',
    rolesByUnit: { [UNIT]: 'Manager' },
    hasAccess: true,
    entitled: true,
    ...over,
  }
}

const linkedWorkspace = { organizationId: ORG, ownerUserId: CREATOR }
const unlinkedWorkspace = { organizationId: null, ownerUserId: CREATOR }
const linkedBrand = { unitId: UNIT, organizationId: ORG }
const unlinkedBrand = { unitId: null, organizationId: ORG }

describe('a workspace', () => {
  it('admits an active, entitled member when it is linked', () => {
    expect(
      decideWorkspaceAccess({ workspace: linkedWorkspace, userId: OTHER_USER, access: access() }),
    ).toEqual({ allowed: true, via: 'linked-workspace-org-member' })
  })

  it('denies a SUSPENDED member', () => {
    // `orgRole` is null for any membership that is not active. Suspension does not cascade to
    // role rows — that is what makes it reversible — so `rolesByUnit` is still populated here,
    // and a rule reading only that would let a disabled person keep working.
    const suspended = access({ orgRole: null, rolesByUnit: { [UNIT]: 'Manager' } })
    expect(
      decideWorkspaceAccess({ workspace: linkedWorkspace, userId: OTHER_USER, access: suspended }),
    ).toEqual({ allowed: false, because: 'not-an-active-member' })
  })

  it('denies when the app is not entitled in that organisation', () => {
    // The org-level kill switch. A missing entitlement row is not "active".
    expect(
      decideWorkspaceAccess({
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ entitled: false }),
      }),
    ).toEqual({ allowed: false, because: 'not-entitled' })
  })

  it('refuses a derivation made for a DIFFERENT organisation', () => {
    // The cross-tenant bug. Checked rather than trusted, because a refactor that threads the
    // wrong org through is silent and grants access across a tenant boundary.
    expect(
      decideWorkspaceAccess({
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ organizationId: OTHER_ORG }),
      }),
    ).toEqual({ allowed: false, because: 'wrong-organisation' })
  })

  it('denies somebody with no Passport identity at all', () => {
    expect(
      decideWorkspaceAccess({ workspace: linkedWorkspace, userId: OTHER_USER, access: null }),
    ).toEqual({ allowed: false, because: 'no-passport-identity' })
  })

  // ── unlinked ──────────────────────────────────────────────────────────────

  it('admits the creator of an UNLINKED workspace, with no Passport identity needed', () => {
    // The outage path. There is no organisation to derive against, so this must work with a
    // null derivation or a workspace created during an outage is unreachable by its author.
    expect(
      decideWorkspaceAccess({ workspace: unlinkedWorkspace, userId: CREATOR, access: null }),
    ).toEqual({ allowed: true, via: 'unlinked-workspace-creator' })
  })

  it('denies everybody else on an UNLINKED workspace, including an org Owner', () => {
    // Narrow on purpose: with no organisation, the only alternative is "every authenticated
    // user", which is the interim model this phase removes.
    expect(
      decideWorkspaceAccess({
        workspace: unlinkedWorkspace,
        userId: OTHER_USER,
        access: access({ orgRole: 'Owner' }),
      }),
    ).toEqual({ allowed: false, because: 'not-the-creator' })
  })
})

describe('a LINKED brand', () => {
  it('admits somebody holding a role at that unit', () => {
    expect(
      decideBrandAccess({
        brand: linkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access(),
      }),
    ).toEqual({ allowed: true, via: 'passport-role' })
  })

  it('denies an org member with no role at that unit', () => {
    expect(
      decideBrandAccess({
        brand: linkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ rolesByUnit: {} }),
      }),
    ).toEqual({ allowed: false, because: 'no-role-at-this-unit' })
  })

  it('⚠️ denies an org OWNER at a unit that carries no app-access row', () => {
    // The over-permission this design is most likely to acquire. The ladder is already inside
    // `rolesByUnit`, so an empty map for an Owner means Passport's own rule said no — the unit
    // carries no `unit_app_access` row, and such a unit confers access to nobody, not even an
    // Owner. Adding `|| orgRole === 'Owner'` beside the lookup would look defensive and would
    // grant exactly what Passport refused.
    expect(
      decideBrandAccess({
        brand: linkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ orgRole: 'Owner', rolesByUnit: {}, hasAccess: false }),
      }),
    ).toEqual({ allowed: false, because: 'no-role-at-this-unit' })
  })

  it('does not collapse the roles map — a role at ANOTHER unit is not access here', () => {
    expect(
      decideBrandAccess({
        brand: linkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ rolesByUnit: { 'some-other-unit': 'Manager' } }),
      }),
    ).toEqual({ allowed: false, because: 'no-role-at-this-unit' })
  })

  it('applies the workspace gate first', () => {
    // A suspended member is denied at the workspace, so the unit lookup never runs. Without
    // this order a suspended person's stale role rows would admit them to the brand.
    expect(
      decideBrandAccess({
        brand: linkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ orgRole: null }),
      }),
    ).toEqual({ allowed: false, because: 'not-an-active-member' })
  })
})

describe('an UNLINKED brand — the knowing widening', () => {
  it('admits an org member with NO role at any unit', () => {
    // ⚠️ Asserted so the widening is deliberate rather than accidental. During the window
    // before it links, an unlinked brand is visible org-wide rather than to role-holders.
    // Recorded in proposal §8 `D1-b` as the weakest part of the decision.
    expect(
      decideBrandAccess({
        brand: unlinkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ rolesByUnit: {}, hasAccess: false }),
      }),
    ).toEqual({ allowed: true, via: 'unlinked-brand-org-member' })
  })

  it('admits when NO unit in the org carries the app yet', () => {
    // The case that makes `hasAccess` the wrong test. A fresh organisation whose brands are
    // all still waiting to be promoted has no unit carrying this app — so `hasAccess` is
    // false for everybody, and using it would deny every member of the organisation the
    // brands they just created. Exactly the post-outage state `D1-b` exists to keep workable.
    expect(
      decideBrandAccess({
        brand: unlinkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ rolesByUnit: {}, hasAccess: false }),
      }).allowed,
    ).toBe(true)
  })

  it('still denies a suspended member', () => {
    // The widening is to org members, not to everybody. The full membership gate still runs.
    expect(
      decideBrandAccess({
        brand: unlinkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ orgRole: null }),
      }),
    ).toEqual({ allowed: false, because: 'not-an-active-member' })
  })

  it('still denies when the app is not entitled', () => {
    expect(
      decideBrandAccess({
        brand: unlinkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ entitled: false }),
      }),
    ).toEqual({ allowed: false, because: 'not-entitled' })
  })

  it('still denies someone from another organisation', () => {
    expect(
      decideBrandAccess({
        brand: unlinkedBrand,
        workspace: linkedWorkspace,
        userId: OTHER_USER,
        access: access({ organizationId: OTHER_ORG }),
      }),
    ).toEqual({ allowed: false, because: 'wrong-organisation' })
  })
})

describe('an unlinked brand in an unlinked workspace', () => {
  it('admits the creator, with no Passport at all', () => {
    // The full outage path, end to end: a person creates a workspace and a brand while
    // Passport is unreachable, and keeps working in both.
    expect(
      decideBrandAccess({
        brand: { unitId: null, organizationId: null },
        workspace: unlinkedWorkspace,
        userId: CREATOR,
        access: null,
      }),
    ).toEqual({ allowed: true, via: 'unlinked-workspace-creator' })
  })

  it('denies everybody else', () => {
    expect(
      decideBrandAccess({
        brand: { unitId: null, organizationId: null },
        workspace: unlinkedWorkspace,
        userId: OTHER_USER,
        access: access({ orgRole: 'Owner' }),
      }),
    ).toEqual({ allowed: false, because: 'not-the-creator' })
  })
})
