import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import type { Env } from '../env'
import { onError } from '../middleware/error'
import { createLogger } from '../logger'
import type { StructureWriteClient, StructureWriteFailure } from '../passport/structure-write'
import { createPassportStructureRouter } from './passport-structure'

/**
 * The structure write-through routes — the documented rule 3 exception.
 *
 * Proposal §7; plan phase 9b/9g.
 *
 * ## The four properties worth pinning
 *
 * 1. **A `Member` is refused, and so is a brand `Manager`.** The second is the one that gets
 *    shipped wrong: `Manager` is a role at a unit *inside this app*, and treating the two
 *    vocabularies as one ladder lets somebody who can edit a brand's guidelines rename the
 *    legal entity every other Mission Systems app reads.
 * 2. **A create is two calls**, and a failure of the second is surfaced rather than swallowed.
 *    A unit with no `unit_app_access` row confers access to nobody — not even an org Owner —
 *    so a silent half-create looks exactly like a broken create.
 * 3. **A retryable failure is queued; everything else is not.**
 * 4. **The org comes from the acting person's membership**, never from configuration.
 */

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER_ORG = '22222222-2222-4222-8222-222222222222'
const BRAND = '33333333-3333-4333-8333-333333333333'
const ENTITY = '44444444-4444-4444-8444-444444444444'
const OUTLET = '55555555-5555-4555-8555-555555555555'
const LOCAL_UNLINKED = '66666666-6666-4666-8666-666666666666'
const FOREIGN_BRAND = '77777777-7777-4777-8777-777777777777'

function env(): Env {
  return {
    PASSPORT_API_URL: 'https://passport-api.test',
    PASSPORT_API_KEY: 'pk',
    PASSPORT_APP_ID: 'app-uuid',
  } as Env
}

function membership(role: string, organizationId = ORG) {
  return {
    role,
    status: 'active',
    organizationId,
    platformUserId: 'platform-1',
    email: 'admin@acme.test',
    displayName: 'Admin',
  }
}

const okUnit = { id: BRAND, organization_id: ORG, name: 'Acme', type: 'brand' as const }

/** Every method resolves `ok` by default; each test overrides the one it is about. */
function client(over: Partial<StructureWriteClient> = {}): StructureWriteClient {
  return {
    createUnit: vi.fn(async () => ({ ok: true as const, value: okUnit })),
    updateUnit: vi.fn(async () => ({ ok: true as const, value: okUnit })),
    archiveUnit: vi.fn(async () => ({ ok: true as const, value: okUnit })),
    attachRelation: vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'rel-1',
        from_unit_id: OUTLET,
        to_unit_id: BRAND,
        relation: 'belongs_to_brand' as const,
      },
    })),
    detachRelation: vi.fn(async () => ({ ok: true as const, value: null })),
    enableApp: vi.fn(async () => ({ ok: true as const, value: null })),
    disableApp: vi.fn(async () => ({ ok: true as const, value: null })),
    ...over,
  }
}

/**
 * Local brands, as `getBrandStructure` answers them.
 *
 * `LOCAL_UNLINKED` is the one that matters: a brand created while Passport was unreachable.
 * It has a display label and no unit, which is the state promotion exists to resolve.
 */
const LOCAL_BRANDS = [
  {
    brandId: BRAND,
    workspaceId: 'ws-1',
    displayName: 'Casa Vostra',
    unitId: BRAND,
    organizationId: ORG,
    legalName: 'Casa Vostra Pte. Ltd.',
    unitStatus: 'active',
    unitType: 'brand',
  },
  {
    brandId: LOCAL_UNLINKED,
    workspaceId: 'ws-1',
    displayName: 'Made During An Outage',
    unitId: null,
    organizationId: ORG,
    legalName: null,
    unitStatus: null,
    unitType: null,
  },
  {
    brandId: FOREIGN_BRAND,
    workspaceId: 'ws-9',
    displayName: 'Someone Else',
    unitId: null,
    organizationId: OTHER_ORG,
    legalName: null,
    unitStatus: null,
    unitType: null,
  },
]

const UNITS = [
  { id: BRAND, organizationId: ORG, name: 'Acme', type: 'brand', status: 'active' },
  { id: ENTITY, organizationId: ORG, name: 'Acme Pte Ltd', type: 'entity', status: 'active' },
  { id: OUTLET, organizationId: ORG, name: 'Acme Orchard', type: 'outlet', status: 'active' },
]

interface Harness {
  app: Hono<AppEnv>
  client: StructureWriteClient
  queue: {
    record: ReturnType<typeof vi.fn>
    list: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    bump: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  membershipForEmail: ReturnType<typeof vi.fn>
}

function harness(
  opts: {
    role?: string
    issuer?: 'app-native' | 'passport'
    client?: Partial<StructureWriteClient>
    organizationId?: string
    memberOfNothing?: boolean
    ambiguous?: boolean
    attempt?: unknown
    unlinked?: number
  } = {},
): Harness {
  const c = client(opts.client)
  const queue = {
    record: vi.fn(async () => ({}) as never),
    list: vi.fn(async () => []),
    get: vi.fn(async () => opts.attempt ?? undefined),
    bump: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }
  const membershipForEmail = vi.fn(async () =>
    opts.ambiguous
      ? ({ ok: false, reason: 'ambiguous' } as const)
      : opts.memberOfNothing
        ? ({ ok: false, reason: 'none' } as const)
        : ({
            ok: true,
            membership: membership(opts.role ?? 'Admin', opts.organizationId ?? ORG),
          } as const),
  )

  const router = createPassportStructureRouter({
    env: env(),
    client: c,
    access: { membershipForEmail } as never,
    reader: {
      getUserById: (async () => ({ id: 'local-1', email: 'admin@acme.test' })) as never,
      listUnits: (async (organizationId: string) => (organizationId === ORG ? UNITS : [])) as never,
      getBrandStructure: (async (brandId: string) =>
        LOCAL_BRANDS.find((b) => b.brandId === brandId)) as never,
      countUnlinkedBrands: (async () => opts.unlinked ?? 0) as never,
      // Built from the same fixtures the resolver uses, so the two lists cannot drift apart
      // in a test the way they must not in the product.
      getWorkspaceDrift: (async (workspaceId: string) => {
        const rows = LOCAL_BRANDS.filter((b) => b.workspaceId === workspaceId)
        return {
          diverged: rows
            .filter((b) => b.unitId && b.legalName && b.legalName !== b.displayName)
            .map((b) => ({
              brandId: b.brandId,
              displayName: b.displayName,
              legalName: b.legalName,
              unitId: b.unitId,
            })),
          unlinked: rows
            .filter((b) => !b.unitId)
            .map((b) => ({ brandId: b.brandId, displayName: b.displayName })),
        }
      }) as never,
    },
    queue: queue as never,
  })

  // The real middleware stack's two contributions: `userId` + `tokenIssuer` from the auth
  // gate, and the error boundary that maps a thrown `ForbiddenError` to a 403.
  const app = new Hono<AppEnv>()
  app.use('*', async (ctx, next) => {
    ctx.set('log', createLogger({ level: 'error' }))
    ctx.set('userId', 'local-1')
    ctx.set('tokenIssuer', opts.issuer ?? 'passport')
    await next()
  })
  app.onError(onError)
  app.route('/passport/structure', router)

  return { app, client: c, queue, membershipForEmail }
}

const AUTH = { authorization: 'Bearer passport-token' }

function post(app: Hono<AppEnv>, path: string, body?: unknown) {
  return app.request(`/passport/structure${path}`, {
    method: 'POST',
    headers: { ...AUTH, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function patch(app: Hono<AppEnv>, path: string, body: unknown) {
  return app.request(`/passport/structure${path}`, {
    method: 'PATCH',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function del(app: Hono<AppEnv>, path: string) {
  return app.request(`/passport/structure${path}`, { method: 'DELETE', headers: AUTH })
}

describe('the gate', () => {
  it('refuses a Member', async () => {
    const { app, client: c } = harness({ role: 'Member' })
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })

    expect(res.status).toBe(403)
    expect(await res.text()).toMatch(/Owner or Admin/)
    // Refused BEFORE the round trip, which is the only reason layer 1 exists.
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('refuses a brand Manager, because that is a DIFFERENT vocabulary', async () => {
    // ⚠️ The one that gets shipped wrong. `Manager` is a role at a unit inside this app; it
    // is not on the org ladder at all. Conflating the two is exactly what rule 8 forbids, and
    // it would let somebody who can edit a brand's guidelines rename the legal entity that
    // every other Mission Systems app reads, including for statutory output.
    for (const role of ['Manager', 'Staff']) {
      const { app, client: c } = harness({ role })
      const res = await post(app, '/units', { name: 'Acme', type: 'brand' })
      expect(res.status).toBe(403)
      expect(c.createUnit).not.toHaveBeenCalled()
    }
  })

  it('admits an Owner and an Admin, and nothing else', async () => {
    for (const role of ['Owner', 'Admin']) {
      const { app } = harness({ role })
      const res = await post(app, '/units', { name: 'Acme', type: 'brand' })
      expect(res.status).toBe(201)
    }
  })

  it('refuses an app-native session with the SESSION as the reason, not the role', async () => {
    // An app-native org Owner really is an Owner. Telling them they lack permission would be
    // false, and would send them to an administrator who cannot help.
    const { app, client: c } = harness({ role: 'Owner', issuer: 'app-native' })
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })

    expect(res.status).toBe(403)
    const body = await res.text()
    expect(body).toMatch(/Passport sign-in/i)
    expect(body).not.toMatch(/Owner or Admin/)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('checks the issuer BEFORE the role', async () => {
    // A `Member` on an app-native session gets the session message. Either refusal is correct,
    // but the session is the one they can act on — fixing their role would not help.
    const { app } = harness({ role: 'Member', issuer: 'app-native' })
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })
    expect(await res.text()).toMatch(/Passport sign-in/i)
  })

  it('refuses a person who is a member of no organisation', async () => {
    const { app } = harness({ memberOfNothing: true })
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })
    expect(res.status).toBe(403)
    expect(await res.text()).toMatch(/not a member/i)
  })

  it('refuses rather than guessing when an email matches two members', async () => {
    // Fails closed on ambiguity, the same rule the login path follows: picking one silently
    // acts as the wrong person, in the wrong org.
    const { app, client: c } = harness({ ambiguous: true })
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })
    expect(res.status).toBe(403)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('takes the org from the acting person’s membership, never from configuration', async () => {
    // Rule 9. A configured org id read on the request path IS the single-org bug.
    const { app, client: c } = harness({ organizationId: OTHER_ORG })
    await post(app, '/units', { name: 'Acme', type: 'brand' })
    expect(c.createUnit).toHaveBeenCalledWith(expect.anything(), OTHER_ORG, expect.anything())
  })

  it('forwards the caller’s own bearer token verbatim', async () => {
    const { app, client: c } = harness()
    await post(app, '/units', { name: 'Acme', type: 'brand' })
    expect(c.createUnit).toHaveBeenCalledWith(
      { token: 'passport-token', issuer: 'passport' },
      ORG,
      expect.anything(),
    )
  })
})

describe('create', () => {
  it('issues BOTH calls: the unit, then the app access', async () => {
    const { app, client: c } = harness()
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ unitId: BRAND, pending: true, appAccessEnabled: true })
    // Not optional. A unit carrying no `unit_app_access` row for this app confers access to
    // NOBODY — not even an org Owner, because the ladder still requires a unit that carries
    // the app.
    expect(c.enableApp).toHaveBeenCalledWith(expect.anything(), ORG, BRAND)
  })

  it('surfaces a failure of the SECOND call, and queues it', async () => {
    const unavailable: StructureWriteFailure = { kind: 'unavailable', message: 'timeout' }
    const { app, queue } = harness({
      client: { enableApp: vi.fn(async () => ({ ok: false as const, error: unavailable })) },
    })
    const res = await post(app, '/units', { name: 'Acme', type: 'brand' })

    // 201, because the unit really was created — a 4xx would be a lie. But the body says the
    // half that failed, because a silent partial create looks exactly like a broken create.
    expect(res.status).toBe(201)
    const body = (await res.json()) as { appAccessEnabled: boolean; warning: string }
    expect(body.appAccessEnabled).toBe(false)
    expect(body.warning).toMatch(/visible to nobody/i)
    expect(queue.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'unit_app_access.enable', unitId: BRAND }),
    )
  })

  it('does NOT roll the unit back when the second call fails', async () => {
    // It exists in Passport and sibling apps may already have received the event. Deleting it
    // to tidy up our own half-failure would be a destructive write nobody asked for.
    const { app, client: c } = harness({
      client: {
        enableApp: vi.fn(async () => ({
          ok: false as const,
          error: { kind: 'unavailable', message: 'timeout' } as StructureWriteFailure,
        })),
      },
    })
    await post(app, '/units', { name: 'Acme', type: 'brand' })
    expect(c.archiveUnit).not.toHaveBeenCalled()
  })

  it('rejects a brand carrying a profile', async () => {
    // A brand is a concept, not a place or a legal person. Passport answers 422; this refuses
    // before the round trip so the message names the field.
    const { app, client: c } = harness()
    const res = await post(app, '/units', {
      name: 'Acme',
      type: 'brand',
      profile: { address: '1 Orchard Rd' },
    })
    expect(res.status).toBe(400)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('rejects an entity field on an outlet, and the reverse', async () => {
    const { app, client: c } = harness()
    expect(
      (await post(app, '/units', { name: 'A', type: 'outlet', profile: { uen: 'X' } })).status,
    ).toBe(400)
    expect(
      (await post(app, '/units', { name: 'A', type: 'entity', profile: { postal: '1' } })).status,
    ).toBe(400)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('accepts each type’s own profile fields', async () => {
    const { app } = harness()
    expect(
      (await post(app, '/units', { name: 'A', type: 'entity', profile: { uen: '1' } })).status,
    ).toBe(201)
    expect(
      (
        await post(app, '/units', {
          name: 'A',
          type: 'outlet',
          profile: { address: 'x', postal: '1' },
        })
      ).status,
    ).toBe(201)
  })

  it('rejects an unrecognised type', async () => {
    const { app, client: c } = harness()
    expect((await post(app, '/units', { name: 'A', type: 'department' })).status).toBe(400)
    expect(c.createUnit).not.toHaveBeenCalled()
  })
})

describe('update', () => {
  it('validates the profile against the unit’s STORED type', async () => {
    // The type is not in the body — it cannot be, `UnitUpdate` is `extra="forbid"` — so it
    // comes from the projection. This is the read the replica exists for.
    const { app, client: c } = harness()
    const res = await patch(app, `/units/${BRAND}`, { profile: { address: '1 Orchard Rd' } })

    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/no address or registration/i)
    expect(c.updateUnit).not.toHaveBeenCalled()
  })

  it('accepts an entity’s own field on an entity', async () => {
    const { app, client: c } = harness()
    const res = await patch(app, `/units/${ENTITY}`, { profile: { uen: '201812345K' } })
    expect(res.status).toBe(200)
    expect(c.updateUnit).toHaveBeenCalled()
  })

  it('refuses a type in the body', async () => {
    // Sending it is a 422 even when the value is unchanged, so the schema is `.strict()`.
    const { app, client: c } = harness()
    expect((await patch(app, `/units/${BRAND}`, { name: 'B', type: 'brand' })).status).toBe(400)
    expect(c.updateUnit).not.toHaveBeenCalled()
  })

  it('refuses an external_ref in the body', async () => {
    const { app } = harness()
    expect((await patch(app, `/units/${BRAND}`, { external_ref: 'bf:1' })).status).toBe(400)
  })

  it('refuses an empty body', async () => {
    const { app } = harness()
    expect((await patch(app, `/units/${BRAND}`, {})).status).toBe(400)
  })

  it('404s a unit that is not in this org', async () => {
    const { app } = harness({ organizationId: OTHER_ORG })
    // `listUnits(OTHER_ORG)` is empty, so the brand is not visible — which is the cross-org
    // denial arriving through the same read the profile check uses.
    expect((await patch(app, `/units/${BRAND}`, { profile: { uen: '1' } })).status).toBe(404)
  })
})

describe('relations', () => {
  it('refuses an illegal pairing before the round trip', async () => {
    const { app, client: c } = harness()
    // An entity originates nothing.
    const res = await post(app, '/unit-relations', {
      from_unit_id: ENTITY,
      to_unit_id: BRAND,
      relation: 'belongs_to_brand',
    })
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/entity cannot have/i)
    expect(c.attachRelation).not.toHaveBeenCalled()
  })

  it('refuses a correct pairing sent BACKWARDS', async () => {
    // The common mistake, and Passport's 422 names a constraint rather than the direction.
    const { app, client: c } = harness()
    const res = await post(app, '/unit-relations', {
      from_unit_id: BRAND,
      to_unit_id: OUTLET,
      relation: 'belongs_to_brand',
    })
    expect(res.status).toBe(400)
    expect(c.attachRelation).not.toHaveBeenCalled()
  })

  it('accepts an outlet pointing at its brand', async () => {
    const { app, client: c } = harness()
    const res = await post(app, '/unit-relations', {
      from_unit_id: OUTLET,
      to_unit_id: BRAND,
      relation: 'belongs_to_brand',
    })
    expect(res.status).toBe(201)
    expect(c.attachRelation).toHaveBeenCalled()
  })

  it('never detaches automatically to resolve a conflict', async () => {
    // Relations are immutable, so a 409 means one already exists — and under a cascade the
    // existing edge may be the only thing granting a set of people access to an outlet.
    const { app, client: c } = harness({
      client: {
        attachRelation: vi.fn(async () => ({
          ok: false as const,
          error: { kind: 'conflict', message: 'already related' } as StructureWriteFailure,
        })),
      },
    })
    await post(app, '/unit-relations', {
      from_unit_id: OUTLET,
      to_unit_id: ENTITY,
      relation: 'operated_by_entity',
    })
    expect(c.detachRelation).not.toHaveBeenCalled()
  })
})

describe('the failure queue', () => {
  it('queues an outage and nothing else', async () => {
    const cases: Array<[StructureWriteFailure, boolean]> = [
      [{ kind: 'unavailable', message: 'timeout' }, true],
      [{ kind: 'forbidden' }, false],
      [{ kind: 'invalid', message: 'bad' }, false],
      [{ kind: 'conflict', message: 'exists' }, false],
    ]
    for (const [error, queued] of cases) {
      const { app, queue } = harness({
        client: { archiveUnit: vi.fn(async () => ({ ok: false as const, error })) },
      })
      await post(app, `/units/${BRAND}/archive`)
      // A queued 403 or 422 is a retry button that can never succeed, which reads as "the
      // system will get there eventually" when nothing will change.
      expect(queue.record.mock.calls.length).toBe(queued ? 1 : 0)
    }
  })

  it('records the operation, the payload and who tried', async () => {
    const { app, queue } = harness({
      client: {
        updateUnit: vi.fn(async () => ({
          ok: false as const,
          error: { kind: 'unavailable', message: 'timeout' } as StructureWriteFailure,
        })),
      },
    })
    await patch(app, `/units/${BRAND}`, { name: 'Renamed' })

    expect(queue.record).toHaveBeenCalledWith({
      organizationId: ORG,
      operation: 'unit.update',
      payload: { name: 'Renamed' },
      unitId: BRAND,
      attemptedBy: 'local-1',
      lastError: expect.stringMatching(/unavailable/i),
    })
  })

  it('lists only the acting person’s own org', async () => {
    const { app, queue } = harness({ organizationId: OTHER_ORG })
    const res = await app.request('/passport/structure/write-attempts', { headers: AUTH })
    expect(res.status).toBe(200)
    // Scoped, never global: unit names would otherwise cross a tenant boundary.
    expect(queue.list).toHaveBeenCalledWith(OTHER_ORG)
  })

  it('refuses to list for a Member', async () => {
    // The retry screen names units, so it is behind the same gate as the writes.
    const { app } = harness({ role: 'Member' })
    expect(
      (await app.request('/passport/structure/write-attempts', { headers: AUTH })).status,
    ).toBe(403)
  })

  it('deletes the attempt on a successful retry', async () => {
    const {
      app,
      queue,
      client: c,
    } = harness({
      attempt: {
        id: 'attempt-1',
        organizationId: ORG,
        operation: 'unit.archive',
        payload: { unitId: BRAND },
        unitId: BRAND,
        attempts: 1,
        lastError: 'timeout',
      },
    })
    const res = await post(app, '/write-attempts/attempt-1/retry')

    expect(res.status).toBe(200)
    expect(c.archiveUnit).toHaveBeenCalledWith(expect.anything(), ORG, BRAND)
    expect(queue.remove).toHaveBeenCalledWith('attempt-1', ORG)
    expect(queue.bump).not.toHaveBeenCalled()
  })

  it('bumps rather than deletes when the retry fails again', async () => {
    const { app, queue } = harness({
      attempt: {
        id: 'attempt-1',
        organizationId: ORG,
        operation: 'unit.archive',
        payload: {},
        unitId: BRAND,
        attempts: 1,
        lastError: 'timeout',
      },
      client: {
        archiveUnit: vi.fn(async () => ({
          ok: false as const,
          error: { kind: 'unavailable', message: 'still down' } as StructureWriteFailure,
        })),
      },
    })
    const res = await post(app, '/write-attempts/attempt-1/retry')

    expect(res.status).toBe(400)
    expect(queue.bump).toHaveBeenCalledWith('attempt-1', ORG, expect.any(String))
    expect(queue.remove).not.toHaveBeenCalled()
  })

  it('retries a create as BOTH calls again', async () => {
    const { app, client: c } = harness({
      attempt: {
        id: 'attempt-1',
        organizationId: ORG,
        operation: 'unit.create',
        payload: { name: 'Acme', type: 'brand' },
        unitId: null,
        attempts: 1,
        lastError: 'timeout',
      },
    })
    await post(app, '/write-attempts/attempt-1/retry')
    expect(c.createUnit).toHaveBeenCalled()
    // Same reason as on the original: a unit with no app-access row is visible to nobody.
    expect(c.enableApp).toHaveBeenCalled()
  })

  it('reports an operation it cannot replay rather than silently dropping it', async () => {
    // A silently unretryable row sits on the retry screen for ever answering nothing.
    const { app, queue } = harness({
      attempt: {
        id: 'attempt-1',
        organizationId: ORG,
        operation: 'membership.grant',
        payload: {},
        unitId: null,
        attempts: 1,
        lastError: 'timeout',
      },
    })
    const res = await post(app, '/write-attempts/attempt-1/retry')
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/unrecognised operation/i)
    expect(queue.remove).not.toHaveBeenCalled()
  })

  it('404s an attempt that is not in this org', async () => {
    // `get` takes the org and matches on it, so a cross-org retry cannot be one forgotten
    // `if` away.
    const { app } = harness({ attempt: undefined })
    expect((await post(app, '/write-attempts/attempt-1/retry')).status).toBe(404)
  })

  it('discards with the same deletion as a success', async () => {
    const { app, queue } = harness({
      attempt: {
        id: 'a1',
        organizationId: ORG,
        operation: 'unit.archive',
        payload: {},
        unitId: BRAND,
      },
    })
    const res = await del(app, '/write-attempts/a1')
    expect(res.status).toBe(200)
    expect(queue.remove).toHaveBeenCalledWith('a1', ORG)
  })
})

describe('the response', () => {
  it('says pending on every success, because the row arrives by EVENT', async () => {
    // The write goes to Passport; Passport emits; the receiver applies. Without a pending
    // state a correct save reads as a failure for about a second and the Admin presses again.
    const { app } = harness()
    const responses = await Promise.all([
      post(app, '/units', { name: 'A', type: 'brand' }),
      patch(app, `/units/${BRAND}`, { name: 'B' }),
      post(app, `/units/${BRAND}/archive`),
      post(app, '/unit-relations', {
        from_unit_id: OUTLET,
        to_unit_id: BRAND,
        relation: 'belongs_to_brand',
      }),
      del(app, `/units/${BRAND}/app-access`),
    ])
    for (const res of responses) {
      expect(((await res.json()) as { pending?: boolean }).pending).toBe(true)
    }
  })
})

/**
 * Promotion — the Admin half of `D1-b`'s split create.
 *
 * Plan 8e; proposal §6.1. A brand made while Passport was unreachable exists here with no
 * unit and is usable. Anyone who may create a brand can make one; **only an org Admin on a
 * hosted-login session may promote it.**
 */
describe('promoting a local brand', () => {
  it('creates the unit AND switches the app on at it', async () => {
    const { app, client: c } = harness()
    const res = await post(app, `/brands/${LOCAL_UNLINKED}/promote`)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      unitId: BRAND,
      pending: true,
      appAccessEnabled: true,
    })
    // Not optional: a unit carrying no `unit_app_access` row confers access to NOBODY, not
    // even an org Owner — so a promotion without it makes the brand less reachable, not more.
    expect(c.enableApp).toHaveBeenCalled()
  })

  it('sends the brand id as external_ref, which is what the link resolves on', async () => {
    // `UnitCreate.id` is super-admin gated, so this is the only key we control. The prefix is
    // the documented `"<app>:<legacy pk>"` convention.
    const { app, client: c } = harness()
    await post(app, `/brands/${LOCAL_UNLINKED}/promote`)

    expect(c.createUnit).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      expect.objectContaining({ externalRef: `brandfactory:${LOCAL_UNLINKED}` }),
    )
  })

  it('sends the DISPLAY label as the unit name', async () => {
    // The honest default for a brand Passport has never seen: there is no legal name to
    // preserve. An Admin corrects it in the console afterwards.
    const { app, client: c } = harness()
    await post(app, `/brands/${LOCAL_UNLINKED}/promote`)

    expect(c.createUnit).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      expect.objectContaining({ name: 'Made During An Outage', type: 'brand' }),
    )
  })

  it('says pending, because the LINK arrives by event', async () => {
    // Passport emits `unit.upserted`; `passport/link-brand.ts` sets the link. Reporting the
    // brand as linked here would be a lie for about a second, and the UI would then "correct"
    // itself in a way that reads as a bug.
    const { app } = harness()
    expect(
      (
        (await (await post(app, `/brands/${LOCAL_UNLINKED}/promote`)).json()) as {
          pending: boolean
        }
      ).pending,
    ).toBe(true)
  })

  // ── The gate ──────────────────────────────────────────────────────────────

  it('refuses a Member', async () => {
    const { app, client: c } = harness({ role: 'Member' })
    expect((await post(app, `/brands/${LOCAL_UNLINKED}/promote`)).status).toBe(403)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('refuses an app-native session', async () => {
    // ⚠️ The security property of the split. A non-Admin, or anyone without a Passport
    // session, can CREATE a local brand — but promoting it would let a consumer app add a
    // unit to an organisation's structure with no org Admin involved, and every sibling app
    // in the suite would then read it.
    const { app, client: c } = harness({ role: 'Owner', issuer: 'app-native' })
    const res = await post(app, `/brands/${LOCAL_UNLINKED}/promote`)

    expect(res.status).toBe(403)
    expect(await res.text()).toMatch(/Passport sign-in/i)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('404s a brand belonging to another organisation', async () => {
    // Cross-org denial, through the same read the rest of the router uses.
    const { app, client: c } = harness()
    expect((await post(app, `/brands/${FOREIGN_BRAND}/promote`)).status).toBe(404)
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('404s a brand that does not exist', async () => {
    const { app } = harness()
    expect((await post(app, `/brands/${OUTLET}/promote`)).status).toBe(404)
  })

  // ── Idempotence and failure ───────────────────────────────────────────────

  it('is idempotent for an ALREADY linked brand', async () => {
    // Two Admins pressing the button, or a retry after a lost response, must not read as a
    // failure — and must not create a second unit.
    const { app, client: c } = harness()
    const res = await post(app, `/brands/${BRAND}/promote`)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ alreadyLinked: true })
    expect(c.createUnit).not.toHaveBeenCalled()
  })

  it('queues an outage and leaves the brand usable', async () => {
    const { app, queue } = harness({
      client: {
        createUnit: vi.fn(async () => ({
          ok: false as const,
          error: { kind: 'unavailable', message: 'timeout' } as StructureWriteFailure,
        })),
      },
    })
    const res = await post(app, `/brands/${LOCAL_UNLINKED}/promote`)

    // A failed promotion is NOT a failed create. The brand is untouched and still works.
    expect(res.status).toBe(400)
    expect(queue.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'unit.create', unitId: null }),
    )
  })

  it('reports a half-promotion rather than hiding it', async () => {
    // The unit exists in Passport and the app is not switched on at it — so under the linked
    // rules it is visible to nobody. Worse than staying unlinked, because the local access
    // rule stops applying the moment the link lands.
    const { app, client: c } = harness({
      client: {
        enableApp: vi.fn(async () => ({
          ok: false as const,
          error: { kind: 'unavailable', message: 'timeout' } as StructureWriteFailure,
        })),
      },
    })
    const res = await post(app, `/brands/${LOCAL_UNLINKED}/promote`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { appAccessEnabled: boolean; warning: string }
    expect(body.appAccessEnabled).toBe(false)
    expect(body.warning).toMatch(/switched on/i)
    // NOT rolled back: sibling apps may already hold the event.
    expect(c.archiveUnit).not.toHaveBeenCalled()
  })
})

describe('the unlinked count', () => {
  it('reports how many brands Passport does not know about', async () => {
    // Not optional under `D1-b`: a queue nobody drains leaves a growing set of brands that
    // exist here and nowhere else, invisible to every sibling app, with nothing failing.
    const { app } = harness({ unlinked: 3 })
    const res = await app.request('/passport/structure/workspaces/ws-1/unlinked', { headers: AUTH })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ workspaceId: 'ws-1', unlinked: 3 })
  })

  it('is behind the same gate as the writes', async () => {
    const { app } = harness({ role: 'Member' })
    expect(
      (await app.request('/passport/structure/workspaces/ws-1/unlinked', { headers: AUTH })).status,
    ).toBe(403)
  })
})

describe('who may change structure — GET /me', () => {
  it('answers true for an org Admin on a hosted-login session', async () => {
    const { app } = harness({ role: 'Admin' })
    const res = await app.request('/passport/structure/me', { headers: AUTH })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      canWriteStructure: true,
      organizationId: ORG,
      orgRole: 'Admin',
    })
  })

  it('answers 200 with FALSE for a Member, never 403', async () => {
    // A refusal is the answer here, not an error. A 403 would make every non-Admin's console
    // show a failed request on every page load, and force the UI to treat an expected outcome
    // as an exception.
    const { app } = harness({ role: 'Member' })
    const res = await app.request('/passport/structure/me', { headers: AUTH })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ canWriteStructure: false, organizationId: null })
  })

  it('answers false for an app-native session', async () => {
    const { app } = harness({ role: 'Owner', issuer: 'app-native' })
    const res = await app.request('/passport/structure/me', { headers: AUTH })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { canWriteStructure: boolean; reason: string }
    expect(body.canWriteStructure).toBe(false)
    expect(body.reason).toMatch(/Passport sign-in/i)
  })

  it('discloses no other organisation and no other person', async () => {
    // It reports a fact about the caller, from the caller's own membership. It must never
    // become a way to enumerate organisations or read somebody else's role.
    const { app } = harness({ role: 'Owner', organizationId: OTHER_ORG })
    const body = (await (
      await app.request('/passport/structure/me', { headers: AUTH })
    ).json()) as {
      organizationId: string
    }
    expect(body.organizationId).toBe(OTHER_ORG)
    expect(JSON.stringify(body)).not.toContain(ORG)
  })

  it('uses the SAME gate as the writes', async () => {
    // The property that matters. A second copy of the gate that drifted would tell a client
    // "you may write" and then 403 every button it rendered.
    for (const role of ['Owner', 'Admin', 'Member', 'Manager', 'Staff']) {
      const { app } = harness({ role })
      const me = (await (
        await app.request('/passport/structure/me', { headers: AUTH })
      ).json()) as {
        canWriteStructure: boolean
      }
      const write = await post(app, `/units/${BRAND}/archive`)
      expect(me.canWriteStructure).toBe(write.status !== 403)
    }
  })
})

describe('the drift view', () => {
  it('separates expected divergence from rows that need an Admin', async () => {
    const { app } = harness()
    const res = await app.request('/passport/structure/workspaces/ws-1/drift', { headers: AUTH })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      diverged: { brandId: string; legalName: string }[]
      unlinked: { brandId: string }[]
    }
    // `Casa Vostra` against `Casa Vostra Pte. Ltd.` — permanent and correct under `D1-b`.
    expect(body.diverged).toEqual([
      expect.objectContaining({ brandId: BRAND, legalName: 'Casa Vostra Pte. Ltd.' }),
    ])
    // The half that needs somebody to act.
    expect(body.unlinked).toEqual([expect.objectContaining({ brandId: LOCAL_UNLINKED })])
  })

  it('keeps the two lists apart', async () => {
    // Merging them buries the rows that need an Admin under dozens of correct ones, which is
    // how a drift screen becomes a screen nobody opens.
    const { app } = harness()
    const body = (await (
      await app.request('/passport/structure/workspaces/ws-1/drift', { headers: AUTH })
    ).json()) as { diverged: { brandId: string }[]; unlinked: { brandId: string }[] }

    const divergedIds = body.diverged.map((d) => d.brandId)
    const unlinkedIds = body.unlinked.map((u) => u.brandId)
    expect(divergedIds.filter((id) => unlinkedIds.includes(id))).toEqual([])
  })

  it('is behind the same gate as the writes, because it names brands', async () => {
    const { app } = harness({ role: 'Member' })
    expect(
      (await app.request('/passport/structure/workspaces/ws-1/drift', { headers: AUTH })).status,
    ).toBe(403)
  })
})
