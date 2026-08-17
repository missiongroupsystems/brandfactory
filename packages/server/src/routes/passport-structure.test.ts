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
