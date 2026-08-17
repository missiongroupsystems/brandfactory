import { describe, expect, it, vi } from 'vitest'
import { createPassportAccess, type PassportReader } from './access'
import type { PassportPlacement } from './registry'

/**
 * The access derivation, against fixtures. No database.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 4d.
 *
 * **Every case here is a silent failure if it regresses** — an over-permission or a
 * lockout, with nothing raised and nothing different on screen until somebody
 * notices they can see a brand they were removed from, or cannot see one they
 * manage. None of them shows up in a happy-path test.
 */

const APP = 'app-uuid'
const ORG_A = 'org-a'
const ORG_B = 'org-b'
const USER = 'platform-user-1'

const BRAND_A = 'unit-brand-a'
const OUTLET_A = 'unit-outlet-a'
const BRAND_B = 'unit-brand-b'

function placement(over: Partial<PassportPlacement> = {}): () => PassportPlacement {
  return () => ({
    unitScopes: ['entity', 'brand', 'outlet'],
    roleCascade: false,
    appId: APP,
    key: 'marketingbase',
    authoritative: true,
    ...over,
  })
}

interface Fixture {
  membership?: { role: string; status: string }
  entitlement?: { status: string }
  units?: Array<{ id: string; type: string; status?: string; organizationId?: string }>
  access?: string[]
  roles?: Array<{ unitId: string; role: string; status?: string }>
  relations?: Array<{ from: string; to: string; relation: string }>
}

function reader(f: Fixture, org = ORG_A): PassportReader {
  const row = (unitId: string, role: string, status: string) => ({
    id: `uam-${unitId}`,
    organizationId: org,
    platformUserId: USER,
    unitId,
    appId: APP,
    role,
    status,
    version: 1,
  })

  return {
    getMembership: async () =>
      f.membership
        ? {
            ...f.membership,
            organizationId: org,
            platformUserId: USER,
            email: 'bob@acme.test',
            displayName: 'Bob',
          }
        : undefined,
    listActiveMemberships: async () => [],
    findMembershipsByEmail: async () => [],
    getEntitlement: async () => (f.entitlement ? { ...f.entitlement, tier: null } : undefined),
    listUnits: async () =>
      (f.units ?? []).map((u) => ({
        id: u.id,
        organizationId: u.organizationId ?? org,
        type: u.type,
        name: u.id,
        externalRef: null,
        status: u.status ?? 'active',
        version: 1,
        uen: null,
        gstRegNo: null,
        registeredAddress: null,
        address: null,
        postal: null,
        contactPhone: null,
        kind: null,
      })),
    listUnitAppAccess: async () =>
      (f.access ?? []).map((unitId) => ({
        id: `uaa-${unitId}`,
        organizationId: org,
        unitId,
        appId: APP,
      })),
    listUnitAppMemberships: async () =>
      (f.roles ?? []).map((r) => row(r.unitId, r.role, r.status ?? 'active')),
    listUnitRelations: async () =>
      (f.relations ?? []).map((r, i) => ({
        id: `rel-${i}`,
        organizationId: org,
        fromUnitId: r.from,
        toUnitId: r.to,
        relation: r.relation,
      })),
    getIdentityLink: async () => undefined,
    replaceIdentityLink: async () => {},
  }
}

const ENTITLED_BRAND: Fixture = {
  entitlement: { status: 'active' },
  units: [{ id: BRAND_A, type: 'brand' }],
  access: [BRAND_A],
}

describe('passport access derivation', () => {
  describe('the org-role LADDER', () => {
    // The single most dangerous omission in the contract. An active org Owner or
    // Admin holds `Manager` at every unit carrying the app **with no role row at
    // all** — so passing `orgRole: null` (or forgetting it) silently denies every
    // Owner and every Admin, and no other test in this file catches it.
    it('gives an Owner Manager at every unit carrying the app, with NO role rows', async () => {
      const access = createPassportAccess({
        reader: reader({
          ...ENTITLED_BRAND,
          membership: { role: 'Owner', status: 'active' },
          units: [
            { id: BRAND_A, type: 'brand' },
            { id: OUTLET_A, type: 'outlet' },
          ],
          access: [BRAND_A, OUTLET_A],
          roles: [],
        }),
        placement: placement(),
      })

      const result = await access.forPlatformUser(USER, ORG_A)
      expect(result.rolesByUnit).toEqual({ [BRAND_A]: 'Manager', [OUTLET_A]: 'Manager' })
      expect(result.hasAccess).toBe(true)
    })

    it('does the same for an Admin, and nothing for a Member', async () => {
      const build = (role: string) =>
        createPassportAccess({
          reader: reader({ ...ENTITLED_BRAND, membership: { role, status: 'active' }, roles: [] }),
          placement: placement(),
        }).forPlatformUser(USER, ORG_A)

      expect((await build('Admin')).rolesByUnit).toEqual({ [BRAND_A]: 'Manager' })
      // A `Member` gets nothing from the ladder — only an explicit role row.
      expect((await build('Member')).rolesByUnit).toEqual({})
    })

    it('never overrides an explicit role: the ladder fills gaps only', async () => {
      const access = createPassportAccess({
        reader: reader({
          entitlement: { status: 'active' },
          membership: { role: 'Owner', status: 'active' },
          units: [
            { id: BRAND_A, type: 'brand' },
            { id: BRAND_B, type: 'brand' },
          ],
          access: [BRAND_A, BRAND_B],
          roles: [{ unitId: BRAND_A, role: 'Staff' }],
        }),
        placement: placement(),
      })

      const { rolesByUnit } = await access.forPlatformUser(USER, ORG_A)
      // Explicit `Staff` wins where it exists; the ladder fills the other unit.
      expect(rolesByUnit).toEqual({ [BRAND_A]: 'Staff', [BRAND_B]: 'Manager' })
    })
  })

  describe('the gates', () => {
    // Suspension deliberately does NOT cascade to role rows — that is what makes it
    // reversible and lossless — so a suspended member's rows are still `active`.
    // Reading `role` without checking `status` therefore lets a disabled person keep
    // working, which is exactly the bug the SDK's 3.0.0 gate fixed.
    it('denies a SUSPENDED member, even with an active role row', async () => {
      const access = createPassportAccess({
        reader: reader({
          ...ENTITLED_BRAND,
          membership: { role: 'Owner', status: 'suspended' },
          roles: [{ unitId: BRAND_A, role: 'Manager', status: 'active' }],
        }),
        placement: placement(),
      })

      const result = await access.forPlatformUser(USER, ORG_A)
      expect(result.orgRole).toBeNull()
      expect(result.rolesByUnit).toEqual({})
      expect(result.hasAccess).toBe(false)
    })

    it('denies a REMOVED member, whose tombstone is kept deliberately', async () => {
      const access = createPassportAccess({
        reader: reader({
          ...ENTITLED_BRAND,
          membership: { role: 'Owner', status: 'removed' },
          roles: [{ unitId: BRAND_A, role: 'Manager' }],
        }),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({})
    })

    it('denies somebody with no membership row at all', async () => {
      const access = createPassportAccess({
        reader: reader({ ...ENTITLED_BRAND, roles: [{ unitId: BRAND_A, role: 'Manager' }] }),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({})
    })

    // The org-level kill switch. Revocation arrives as a status change with no other
    // row touched, so restoring it restores the exact prior configuration.
    it('denies everyone, Owners included, when the entitlement is not active', async () => {
      for (const status of ['inactive', 'suspended']) {
        const access = createPassportAccess({
          reader: reader({
            ...ENTITLED_BRAND,
            entitlement: { status },
            membership: { role: 'Owner', status: 'active' },
            roles: [{ unitId: BRAND_A, role: 'Manager' }],
          }),
          placement: placement(),
        })
        expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit, status).toEqual({})
      }
    })

    // A MISSING entitlement row must read as inactive. Defaulting the other way
    // would grant everything in an org this app was never entitled to — which is
    // precisely the current state of every org, since no entitlement has synced yet.
    it('treats a missing entitlement as inactive, not as active', async () => {
      const access = createPassportAccess({
        reader: reader({
          units: [{ id: BRAND_A, type: 'brand' }],
          access: [BRAND_A],
          membership: { role: 'Owner', status: 'active' },
          roles: [{ unitId: BRAND_A, role: 'Manager' }],
        }),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).hasAccess).toBe(false)
    })

    // A unit with no `unit_app_access` row confers access to NOBODY — the ladder
    // still requires a unit that carries the app. This is the failure that follows
    // "we imported the brands and nobody can see anything".
    it('denies at a unit that does not carry the app, even for an Owner', async () => {
      const access = createPassportAccess({
        reader: reader({
          entitlement: { status: 'active' },
          membership: { role: 'Owner', status: 'active' },
          units: [{ id: BRAND_A, type: 'brand' }],
          access: [], // the app is switched on nowhere
          roles: [{ unitId: BRAND_A, role: 'Manager' }],
        }),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({})
    })

    it('denies at an ARCHIVED unit, with no role row changing', async () => {
      const access = createPassportAccess({
        reader: reader({
          entitlement: { status: 'active' },
          membership: { role: 'Member', status: 'active' },
          units: [{ id: BRAND_A, type: 'brand', status: 'archived' }],
          access: [BRAND_A],
          roles: [{ unitId: BRAND_A, role: 'Manager' }],
        }),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({})
    })

    it('ignores a REMOVED role row, which is a tombstone rather than a grant', async () => {
      const access = createPassportAccess({
        reader: reader({
          ...ENTITLED_BRAND,
          membership: { role: 'Member', status: 'active' },
          roles: [{ unitId: BRAND_A, role: 'Manager', status: 'removed' }],
        }),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({})
    })
  })

  describe('rule 9 — the org filter', () => {
    // Omitting the org filter makes an Owner of org A a Manager at every unit of
    // org B. We hold units and switch rows for EVERY org we are entitled to, so
    // this is not hypothetical the moment a second org exists.
    it('denies an Owner of org A at every unit of org B', async () => {
      const access = createPassportAccess({
        reader: reader(
          {
            entitlement: { status: 'active' },
            membership: { role: 'Owner', status: 'active' },
            // A unit belonging to another org, delivered to us legitimately.
            units: [{ id: BRAND_B, type: 'brand', organizationId: ORG_B }],
            access: [BRAND_B],
          },
          ORG_A,
        ),
        placement: placement(),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({})
    })
  })

  describe('rule 8 — checks are UNIT-SCOPED', () => {
    // The only test that catches a collapsed map. A global-flag implementation
    // passes every other case in this file and fails this one.
    it('grants at the unit a person holds a role at, and DENIES at the others', async () => {
      const access = createPassportAccess({
        reader: reader({
          entitlement: { status: 'active' },
          membership: { role: 'Member', status: 'active' },
          units: [
            { id: BRAND_A, type: 'brand' },
            { id: BRAND_B, type: 'brand' },
          ],
          access: [BRAND_A, BRAND_B],
          roles: [{ unitId: BRAND_A, role: 'Manager' }],
        }),
        placement: placement(),
      })

      const { rolesByUnit } = await access.forPlatformUser(USER, ORG_A)
      expect(rolesByUnit[BRAND_A]).toBe('Manager')
      expect(rolesByUnit[BRAND_B]).toBeUndefined()
    })

    it('keeps both vocabularies distinct, returning Manager and Staff verbatim', async () => {
      const access = createPassportAccess({
        reader: reader({
          entitlement: { status: 'active' },
          membership: { role: 'Member', status: 'active' },
          units: [
            { id: BRAND_A, type: 'brand' },
            { id: BRAND_B, type: 'brand' },
          ],
          access: [BRAND_A, BRAND_B],
          roles: [
            { unitId: BRAND_A, role: 'Manager' },
            { unitId: BRAND_B, role: 'Staff' },
          ],
        }),
        placement: placement(),
      })

      // Not mapped onto a local enum, and not conflated with Owner|Admin|Member.
      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({
        [BRAND_A]: 'Manager',
        [BRAND_B]: 'Staff',
      })
    })
  })

  describe('placement and the cascade', () => {
    const withOutlet: Fixture = {
      entitlement: { status: 'active' },
      membership: { role: 'Member', status: 'active' },
      units: [
        { id: BRAND_A, type: 'brand' },
        { id: OUTLET_A, type: 'outlet' },
      ],
      access: [BRAND_A, OUTLET_A],
      roles: [{ unitId: BRAND_A, role: 'Manager' }],
      relations: [{ from: OUTLET_A, to: BRAND_A, relation: 'belongs_to_brand' }],
    }

    // BrandFactory's registered placement, confirmed against the live registry:
    // all three unit types, and therefore NO cascade — Passport answers 422 to
    // `role_cascade: true` on any shape other than {entity,outlet} or {brand,outlet}.
    it('does NOT reach the outlet from the brand on this app’s placement', async () => {
      const access = createPassportAccess({
        reader: reader(withOutlet),
        placement: placement({ unitScopes: ['entity', 'brand', 'outlet'], roleCascade: false }),
      })

      const { rolesByUnit } = await access.forPlatformUser(USER, ORG_A)
      expect(rolesByUnit).toEqual({ [BRAND_A]: 'Manager' })
      expect(rolesByUnit[OUTLET_A]).toBeUndefined()
    })

    // Pinned so that answering `D3` later — narrowing placement in the Passport
    // console — is a restart rather than a rewrite. Same fixtures, one flag.
    it('DOES reach the outlet once placement narrows and the cascade is on', async () => {
      const access = createPassportAccess({
        reader: reader(withOutlet),
        placement: placement({ unitScopes: ['brand', 'outlet'], roleCascade: true }),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({
        [BRAND_A]: 'Manager',
        [OUTLET_A]: 'Manager',
      })
    })

    it('lets an explicit outlet role override the inherited one', async () => {
      const access = createPassportAccess({
        reader: reader({
          ...withOutlet,
          roles: [
            { unitId: BRAND_A, role: 'Manager' },
            { unitId: OUTLET_A, role: 'Staff' },
          ],
        }),
        placement: placement({ unitScopes: ['brand', 'outlet'], roleCascade: true }),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({
        [BRAND_A]: 'Manager',
        [OUTLET_A]: 'Staff',
      })
    })

    // Two levels no longer implies inheritance, and inferring it from the shape
    // would over-permit. This is the case the old single-field vocabulary could not
    // even express.
    it('does not infer the cascade from a two-level placement', async () => {
      const access = createPassportAccess({
        reader: reader(withOutlet),
        placement: placement({ unitScopes: ['brand', 'outlet'], roleCascade: false }),
      })

      expect((await access.forPlatformUser(USER, ORG_A)).rolesByUnit).toEqual({
        [BRAND_A]: 'Manager',
      })
    })

    // `relations` is threaded through even when it changes no answer, so a later
    // narrowing cannot silently lose the cascade to a missing argument.
    it('passes relations even while the cascade is off', async () => {
      const listUnitRelations = vi.fn(async () => [])
      const access = createPassportAccess({
        reader: { ...reader(withOutlet), listUnitRelations },
        placement: placement({ roleCascade: false }),
      })

      await access.forPlatformUser(USER, ORG_A)
      expect(listUnitRelations).toHaveBeenCalledWith(ORG_A)
    })
  })

  describe('hasAccess is the emptiness of the map', () => {
    it('agrees with rolesByUnit in both directions', async () => {
      const granted = createPassportAccess({
        reader: reader({ ...ENTITLED_BRAND, membership: { role: 'Owner', status: 'active' } }),
        placement: placement(),
      })
      const denied = createPassportAccess({
        reader: reader({ ...ENTITLED_BRAND, membership: { role: 'Member', status: 'active' } }),
        placement: placement(),
      })

      const a = await granted.forPlatformUser(USER, ORG_A)
      const b = await denied.forPlatformUser(USER, ORG_A)

      expect(a.hasAccess).toBe(Object.keys(a.rolesByUnit).length > 0)
      expect(b.hasAccess).toBe(Object.keys(b.rolesByUnit).length > 0)
      expect(a.hasAccess).toBe(true)
      expect(b.hasAccess).toBe(false)
    })
  })

  describe('resolving a session subject', () => {
    it('returns null for a subject with no identity link', async () => {
      const access = createPassportAccess({
        reader: { ...reader(ENTITLED_BRAND), getIdentityLink: async () => undefined },
        placement: placement(),
      })

      // Not an error: an unlinked session is simply not a Passport user yet, which
      // is the normal state on a first login.
      expect(await access.forSubject('subject-1', ORG_A)).toBeNull()
    })

    it('derives through the link when one exists', async () => {
      const access = createPassportAccess({
        reader: {
          ...reader({ ...ENTITLED_BRAND, membership: { role: 'Owner', status: 'active' } }),
          getIdentityLink: async () => ({ platformUserId: USER }),
        },
        placement: placement(),
      })

      const result = await access.forSubject('subject-1', ORG_A)
      expect(result?.platformUserId).toBe(USER)
      expect(result?.hasAccess).toBe(true)
    })
  })

  describe('identity linking', () => {
    const membershipRow = (email: string) => ({
      role: 'Member',
      status: 'active',
      organizationId: ORG_A,
      platformUserId: USER,
      email,
      displayName: null,
    })

    it('resolves the platform user by verified email and writes the link', async () => {
      const replaceIdentityLink = vi.fn(async () => {})
      const access = createPassportAccess({
        reader: {
          ...reader(ENTITLED_BRAND),
          // Stored in Passport's case, which is not the case the person typed.
          findMembershipsByEmail: async () => [membershipRow('Bob@Acme.test')],
          replaceIdentityLink,
        },
        placement: placement(),
        newId: () => 'link-uuid',
      })

      const result = await access.linkIdentity('subject-1', 'bob@acme.test')

      expect(result).toBe(USER)
      expect(replaceIdentityLink).toHaveBeenCalledWith({
        id: 'link-uuid',
        // NEVER a token's `sub` claim: that is an auth-user id from a different
        // UUID space, and a wrong value here looks linked and resolves to nobody.
        platformUserId: USER,
        appId: APP,
        subject: 'subject-1',
        linkedVia: 'email_match',
      })
    })

    it('writes nothing when the email matches no active membership', async () => {
      const replaceIdentityLink = vi.fn(async () => {})
      const access = createPassportAccess({
        reader: {
          ...reader(ENTITLED_BRAND),
          findMembershipsByEmail: async () => [],
          replaceIdentityLink,
        },
        placement: placement(),
      })

      // The normal state for somebody who can sign in here but is not in Passport.
      expect(await access.linkIdentity('subject-1', 'stranger@example.test')).toBeNull()
      expect(replaceIdentityLink).not.toHaveBeenCalled()
    })

    // Fails CLOSED. On a path that hands out a session, picking the first of two
    // case-variant matches silently authenticates somebody as the wrong person.
    it('refuses to guess between two case-variant memberships', async () => {
      const replaceIdentityLink = vi.fn(async () => {})
      const access = createPassportAccess({
        reader: {
          ...reader(ENTITLED_BRAND),
          findMembershipsByEmail: async () => [
            membershipRow('bob@acme.test'),
            membershipRow('Bob@acme.test'),
          ],
          replaceIdentityLink,
        },
        placement: placement(),
      })

      expect(await access.linkIdentity('subject-1', 'bob@acme.test')).toBeNull()
      expect(replaceIdentityLink).not.toHaveBeenCalled()

      const resolved = await access.membershipForEmail('bob@acme.test')
      expect(resolved).toEqual({ ok: false, reason: 'ambiguous' })
    })
  })

  describe('rule 9 — the org comes from the acting user', () => {
    it('lists the orgs a platform user is an active member of', async () => {
      const rows = [
        {
          role: 'Owner',
          status: 'active',
          organizationId: ORG_A,
          platformUserId: USER,
          email: 'bob@acme.test',
          displayName: null,
        },
      ]
      const access = createPassportAccess({
        reader: { ...reader(ENTITLED_BRAND), listActiveMemberships: async () => rows },
        placement: placement(),
      })

      // This is the only sanctioned source of `organizationId` on a request path.
      // A configured org read here IS the single-org bug.
      expect(await access.organizationsFor(USER)).toEqual(rows)
    })
  })
})
