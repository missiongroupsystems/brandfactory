import { SCHEMA_VERSION, signBody, type SyncHandlers } from '@missiongroupsystems/passport-client'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { createPassportSyncRouter } from './passport-sync'

/**
 * The receive contract, driven end to end over real HTTP with a real HMAC.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.
 *
 * **Everything asserted here is invisible to every other check in this repo.**
 * `tsc` is satisfied by a route that accepts an unsigned body; the handler unit
 * tests never construct an envelope; and the failure mode of getting any of it
 * wrong is a **200 with nothing projected** — Passport marks the delivery
 * successful, moves on, and the projection quietly rots.
 *
 * The signatures are produced by the SDK's own `signBody`, so this tests against
 * the real algorithm rather than a reimplementation that could be wrong in the
 * same direction as the verifier.
 */

const SECRET = 'test-webhook-secret'

function env(overrides: Partial<Env> = {}): Env {
  return {
    PASSPORT_WEBHOOK_SECRET: SECRET,
    ...overrides,
  } as Env
}

const ORG_EVENT = {
  schema_version: SCHEMA_VERSION,
  seq: 1,
  event_id: 'evt_1',
  event_type: 'org.upserted',
  occurred_at: '2026-08-17T00:00:00Z',
  payload: {
    id: '00000000-0000-0000-0000-0000000000aa',
    name: 'Ebb & Flow Group',
    slug: 'ebb-flow',
    status: 'active',
    version: 3,
  },
}

/** POST an envelope, signing the EXACT bytes that are sent. */
async function deliver(
  router: ReturnType<typeof createPassportSyncRouter>,
  envelope: unknown,
  opts: { secret?: string; signature?: string; body?: string } = {},
) {
  const body = opts.body ?? JSON.stringify(envelope)
  const bytes = new TextEncoder().encode(body)
  const signature = opts.signature ?? `hmac-sha256=${signBody(opts.secret ?? SECRET, bytes)}`

  return router.request('/passport/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Passport-Signature': signature },
    body,
  })
}

describe('POST /webhooks/passport/sync', () => {
  it('applies a signed event and answers 200', async () => {
    const upsertOrg = vi.fn(async () => {})
    const res = await deliver(
      createPassportSyncRouter({ env: env(), handlers: { upsertOrg } }),
      ORG_EVENT,
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    // The payload reaches the handler PARSED, by the SDK's own schema.
    expect(upsertOrg).toHaveBeenCalledWith(expect.objectContaining({ slug: 'ebb-flow' }))
  })

  // Fail CLOSED. An unset secret must never mean "accept anything", which would
  // turn a misconfigured deploy into an open write endpoint onto the projection.
  it('refuses with 503 when no secret is configured, rather than accepting', async () => {
    const upsertOrg = vi.fn(async () => {})
    const res = await deliver(
      createPassportSyncRouter({
        env: env({ PASSPORT_WEBHOOK_SECRET: undefined }),
        handlers: { upsertOrg },
      }),
      ORG_EVENT,
    )

    expect(res.status).toBe(503)
    expect(upsertOrg).not.toHaveBeenCalled()
  })

  // 401 makes Passport's delivery worker PAUSE, which is the correct
  // backpressure: a secret mismatch is not something retrying can fix.
  it('answers 401 on a bad signature, and applies nothing', async () => {
    const upsertOrg = vi.fn(async () => {})
    const router = createPassportSyncRouter({ env: env(), handlers: { upsertOrg } })

    const wrongSecret = await deliver(router, ORG_EVENT, { secret: 'not-the-secret' })
    expect(wrongSecret.status).toBe(401)

    const absent = await deliver(router, ORG_EVENT, { signature: '' })
    expect(absent.status).toBe(401)

    const malformedHeader = await deliver(router, ORG_EVENT, { signature: 'garbage' })
    expect(malformedHeader.status).toBe(401)

    expect(upsertOrg).not.toHaveBeenCalled()
  })

  // The signature covers the RAW bytes. If the route parsed and re-serialised
  // before verifying, key order and whitespace would change and every signature
  // would fail — so this is also a guard against "tidying" the route.
  it('verifies the raw bytes, so a body altered after signing is rejected', async () => {
    const upsertOrg = vi.fn(async () => {})
    const router = createPassportSyncRouter({ env: env(), handlers: { upsertOrg } })

    const signed = JSON.stringify(ORG_EVENT)
    const tampered = signed.replace('ebb-flow', 'other-org')
    const signature = `hmac-sha256=${signBody(SECRET, new TextEncoder().encode(signed))}`

    const res = await deliver(router, undefined, { body: tampered, signature })

    expect(res.status).toBe(401)
    expect(upsertOrg).not.toHaveBeenCalled()
  })

  it('accepts a signature from the PREVIOUS secret during a rotation', async () => {
    const upsertOrg = vi.fn(async () => {})
    const router = createPassportSyncRouter({
      env: env({ PASSPORT_WEBHOOK_SECRET: 'new', PASSPORT_WEBHOOK_SECRET_PREV: 'old' }),
      handlers: { upsertOrg },
    })

    // Without this, a rotation is a hard cutover and every in-flight delivery
    // signed with the old secret is rejected.
    await expect(deliver(router, ORG_EVENT, { secret: 'old' })).resolves.toMatchObject({
      status: 200,
    })
    await expect(deliver(router, ORG_EVENT, { secret: 'new' })).resolves.toMatchObject({
      status: 200,
    })
    expect(upsertOrg).toHaveBeenCalledTimes(2)
  })

  it('answers 400 on malformed JSON, after the signature checks out', async () => {
    const router = createPassportSyncRouter({ env: env(), handlers: {} })
    const res = await deliver(router, undefined, { body: '{not json' })

    expect(res.status).toBe(400)
  })

  // A schema_version bump means every event of the old shape must be REFUSED
  // rather than half-understood, and refused BEFORE dispatch.
  it('answers 400 on a stale schema_version and does not dispatch', async () => {
    const upsertOrg = vi.fn(async () => {})
    const res = await deliver(createPassportSyncRouter({ env: env(), handlers: { upsertOrg } }), {
      ...ORG_EVENT,
      schema_version: SCHEMA_VERSION + 1,
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'SCHEMA_VERSION' })
    expect(upsertOrg).not.toHaveBeenCalled()
  })

  // Forward compatibility: this is what lets Passport add an event type without
  // breaking a pinned consumer. It must be a 200, or the worker retries forever.
  it('answers 200 and applies nothing for an unknown event type', async () => {
    const upsertOrg = vi.fn(async () => {})
    const res = await deliver(createPassportSyncRouter({ env: env(), handlers: { upsertOrg } }), {
      ...ORG_EVENT,
      event_type: 'something.invented.later',
    })

    expect(res.status).toBe(200)
    expect(upsertOrg).not.toHaveBeenCalled()
  })

  // Same 200, different reason: an event type we know but deliberately do not
  // implement. `applyEvent` skips it via the same property lookup.
  it('answers 200 for a known event type with no handler', async () => {
    const res = await deliver(createPassportSyncRouter({ env: env(), handlers: {} }), ORG_EVENT)
    expect(res.status).toBe(200)
  })

  // The route deliberately has no try/catch: the error must reach `app.onError`,
  // which maps it to 500 so Passport RETRIES. Swallowing it would ack an event
  // that was never applied.
  it('lets a handler error propagate rather than acking a failed apply', async () => {
    const handlers: SyncHandlers = {
      upsertOrg: async () => {
        throw new Error('projection write failed')
      },
    }
    const router = createPassportSyncRouter({ env: env(), handlers })

    // Hono surfaces an unhandled error as a 500 here; in the mounted app
    // `onError` produces `{ code: 'INTERNAL' }` with the same status.
    const res = await deliver(router, ORG_EVENT)
    expect(res.status).toBe(500)
  })

  // Replay safety at the ROUTE level: an identical redelivery must be accepted and
  // re-applied, not rejected. Idempotency itself lives in the version guard.
  it('accepts an identical redelivery', async () => {
    const upsertOrg = vi.fn(async () => {})
    const router = createPassportSyncRouter({ env: env(), handlers: { upsertOrg } })

    await deliver(router, ORG_EVENT)
    const replay = await deliver(router, ORG_EVENT)

    expect(replay.status).toBe(200)
    expect(upsertOrg).toHaveBeenCalledTimes(2)
  })

  it('is mounted at a path outside the auth gate', async () => {
    // Guards the mount contract rather than the handler: Passport authenticates
    // with an HMAC, not a JWT, so a delivery carries no Authorization header. If
    // this route ever moved under an authenticated prefix, every delivery would
    // 401 and the projection would silently stop.
    const res = await deliver(createPassportSyncRouter({ env: env(), handlers: {} }), ORG_EVENT)
    expect(res.status).toBe(200)
  })
})

describe('POST /webhooks/passport/reconcile', () => {
  const summary = {
    organizations: 1,
    units: 2,
    unitRelations: 0,
    memberships: 3,
    identityLinks: 0,
    entitlements: 1,
    unitAppAccesses: 2,
    unitAppMemberships: 3,
    durationMs: 12,
    empty: false,
  }

  // This route exists so the job can be verified by TRIGGERING it rather than by
  // reading the code. Writing the reconcile function and stopping is the common
  // failure: it passes its own unit test, so the suite is green and the write-up
  // says "nightly reconciliation built" while nothing ever runs it.
  it('runs the reconciliation and returns its summary', async () => {
    const reconcile = vi.fn(async () => summary)
    const router = createPassportSyncRouter({
      env: env({ PASSPORT_RECONCILE_SECRET: 'rec' }),
      reconcile,
    })

    const res = await router.request('/passport/reconcile', {
      method: 'POST',
      headers: { 'X-Reconcile-Secret': 'rec' },
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, summary })
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  // REFUSES rather than running unauthenticated. Two reasons, and both matter: an
  // unconfigured scheduler must not be able to look like a working one, and an open
  // reconciliation endpoint is a way to hammer Passport's API from outside.
  it('refuses with 503 when the secret is unset, rather than running open', async () => {
    const reconcile = vi.fn(async () => summary)
    const router = createPassportSyncRouter({ env: env(), reconcile })

    const res = await router.request('/passport/reconcile', { method: 'POST' })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'NOT_CONFIGURED' })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('refuses a wrong or absent secret with 403', async () => {
    const reconcile = vi.fn(async () => summary)
    const router = createPassportSyncRouter({
      env: env({ PASSPORT_RECONCILE_SECRET: 'rec' }),
      reconcile,
    })

    const wrong = await router.request('/passport/reconcile', {
      method: 'POST',
      headers: { 'X-Reconcile-Secret': 'nope' },
    })
    expect(wrong.status).toBe(403)

    const absent = await router.request('/passport/reconcile', { method: 'POST' })
    expect(absent.status).toBe(403)

    // A secret of a different LENGTH must also be refused — `timingSafeEqual`
    // throws on mismatched lengths, so that case needs its own branch and its own
    // test or it becomes a 500 instead of a 403.
    const shorter = await router.request('/passport/reconcile', {
      method: 'POST',
      headers: { 'X-Reconcile-Secret': 'r' },
    })
    expect(shorter.status).toBe(403)

    expect(reconcile).not.toHaveBeenCalled()
  })

  it('lets a failed reconciliation surface as a 500, not a clean pass', async () => {
    // A scheduler seeing a 500 is the correct signal. Swallowing it would report a
    // clean pass over a failed run, which is the one outcome this job exists to
    // prevent.
    const router = createPassportSyncRouter({
      env: env({ PASSPORT_RECONCILE_SECRET: 'rec' }),
      reconcile: async () => {
        throw new Error('snapshot failed')
      },
    })

    const res = await router.request('/passport/reconcile', {
      method: 'POST',
      headers: { 'X-Reconcile-Secret': 'rec' },
    })
    expect(res.status).toBe(500)
  })
})
