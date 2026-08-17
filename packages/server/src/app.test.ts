import { describe, expect, it } from 'vitest'
import { createTestApp } from './test-helpers'

// ---------------------------------------------------------------------------
// The app's router choice, asserted directly
// ---------------------------------------------------------------------------
//
// **Why a test about a Hono internal earns its place.** 1.11.1 added
// `POST /brands/:id/assets/reorder` — a literal segment sitting where a sibling
// route has a parameter (`/:id/assets/:assetId/restore`). `RegExpRouter` refuses
// to compile that shape, so `SmartRouter` silently fell back to `TrieRouter`
// **for the whole app**, and `TrieRouter` cannot match a multi-segment
// `:key{.+}`. The visible symptom was `GET /blob-urls/:key/read-url` returning
// 404 — in a module the change never opened.
//
// That is a whole-app property with a per-route cause, and the only reason it was
// caught was that an unrelated test happened to exercise the one route the
// downgrade breaks. This states the property instead of relying on that luck: any
// future route whose shape `RegExpRouter` rejects fails *here*, by name, rather
// than as a mystery 404 somewhere else.
//
// The route added in the Stage 3 hardening pass —
// `DELETE /brands/:id/research/:jobId/drafts` — is exactly the shape worth
// guarding: a literal at a position where the siblings all end, which is
// permitted, next to the one that was not.

describe('the app’s router', () => {
  it('compiles to RegExpRouter, so multi-segment params still match', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })

    // The router is chosen lazily, on the first matched request.
    await app.request('/health')

    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  // Phase E adds `POST /brands/:id/ideate/themes` and `.../copy` — a literal
  // at the position where `social-posts`, `assets`, `guidelines` and
  // `research` already sit, which is the permitted shape. Asserted rather than
  // assumed, because "permitted" is a claim about a router internal and this
  // file is where that claim is checked.
  it('matches the planner’s routes without downgrading', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })

    const res = await app.request('/brands/00000000-0000-4000-8000-000000000000/ideate/themes', {
      method: 'POST',
      headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
      body: JSON.stringify({
        window: { start: '2026-08-01', end: '2026-08-31' },
        platforms: ['instagram'],
        cadencePerWeek: 3,
        count: 6,
      }),
    })

    // 404 on the *brand*, not on the route: the handler ran and
    // `requireBrandAccess` refused. A router downgrade shows up as the app
    // still reporting `RegExpRouter` above and the blob key below failing.
    expect(res.status).toBe(404)
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  // The canary from 1.11.1, kept as a behavioural statement rather than a
  // side effect of the blob suite: this is the route the downgrade breaks.
  it('still matches a multi-segment blob key', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })

    const res = await app.request('/blob-urls/uploads/2026/07/abc-logo.png/read-url', {
      headers: { authorization: 'Bearer t-1' },
    })

    // 200 or 500 both prove the route matched; 404 is the downgrade.
    expect(res.status).not.toBe(404)
  })
})

// ---------------------------------------------------------------------------
// The Passport sync endpoint is MOUNTED, and outside the auth gate
// ---------------------------------------------------------------------------
//
// `routes/passport-sync.test.ts` exercises the receive contract against the
// router in isolation. It cannot see whether that router is actually wired into
// the app, or whether it sits behind `authRequired` — and both failures are
// silent in the same way: Passport delivers, gets a 404 or a 401, and the
// projection simply stays empty while nothing in this app errors.
//
// The acceptance checklist for this integration is explicit that a 404 here is
// the tell and that no unit test will show it to you. So this asserts the mount.
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.

describe('the Passport sync endpoint', () => {
  it('is mounted, and answers 503 rather than 404 when unconfigured', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })

    const res = await app.request('/webhooks/passport/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    // 404 would mean the route was never built. 503 means it exists and is
    // refusing because `PASSPORT_WEBHOOK_SECRET` is unset — which is the correct
    // answer, and a distinguishable one for whoever is configuring it.
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('requires no Authorization header, because Passport sends none', async () => {
    const { app } = createTestApp({
      users: [{ id: 'u-1', token: 't-1' }],
      env: { PASSPORT_WEBHOOK_SECRET: 'whsec' },
    })

    // No bearer token. A delivery carries an HMAC over the body and nothing else,
    // so if this route ever moved under an authenticated prefix every delivery
    // would 401 for the rest of time.
    const res = await app.request('/webhooks/passport/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Passport-Signature': 'hmac-sha256=nope' },
      body: '{}',
    })

    // 401 from the SIGNATURE check, not from the auth middleware — proven by the
    // body, which the auth middleware would never produce.
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ code: 'BAD_SIGNATURE' })
  })
})

// The reconciliation trigger has the same mount hazard as the sync endpoint, plus a
// worse one of its own: the whole point of the endpoint is that the scheduled job can
// be verified by TRIGGERING it, and a 404 there means the route was never built while
// every test still passes.
describe('the Passport reconcile trigger', () => {
  it('is mounted, and answers 503 rather than 404 when unconfigured', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })

    const res = await app.request('/webhooks/passport/reconcile', { method: 'POST' })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('refuses an unauthenticated caller once configured', async () => {
    const { app } = createTestApp({
      users: [{ id: 'u-1', token: 't-1' }],
      env: { PASSPORT_RECONCILE_SECRET: 'rec' },
    })

    // No bearer token and no reconcile secret: 403 from the secret check, not 401
    // from auth middleware — the route sits outside the auth gate because a
    // scheduler is not a signed-in user.
    const res = await app.request('/webhooks/passport/reconcile', { method: 'POST' })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ code: 'FORBIDDEN' })
  })
})
