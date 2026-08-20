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

  // Phase G adds `POST /workspaces/:workspaceId/influencers/lookup` — **a
  // literal sitting exactly where a sibling has a param** (`:influencerRef`),
  // which is the shape that broke this in 1.11.1 and the reason the plan held a
  // fallback mount at `/workspaces/:workspaceId/influencer-lookup` in reserve.
  //
  // It compiles, and the reason is the verb. The 1.11.1 case put
  // `POST .../assets/reorder` beside `GET .../assets/:assetId/restore`: one
  // method tree holding a literal and a param at one position, with the param
  // branch continuing past it. There is no `POST` on `:influencerRef` — its
  // handlers are `GET`, `PATCH` and `DELETE` — so within the POST tree this
  // literal has no parameterised sibling and the refused shape never forms.
  //
  // That is a claim about a router internal, which is precisely why it is
  // asserted here rather than trusted to the route's docstring. If a future
  // `POST /:workspaceId/influencers/:influencerRef` is ever added, this fails
  // first and by name — and the fallback mount is what it should be traded for.
  it('matches the creator lookup without downgrading', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })

    const res = await app.request(
      '/workspaces/00000000-0000-4000-8000-000000000000/influencers/lookup',
      {
        method: 'POST',
        headers: { authorization: 'Bearer t-1', 'content-type': 'application/json' },
        body: JSON.stringify({ platform: 'instagram', handle: 'lennardy' }),
      },
    )

    // 404 on the *workspace*, not on the route: the handler ran and
    // `requireWorkspaceAccess` refused.
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
