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
