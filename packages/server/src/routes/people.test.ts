import { WorkspacePeopleResponseSchema } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createTestApp, type TestHarness } from '../test-helpers'

type TestUser = NonNullable<NonNullable<Parameters<typeof createTestApp>[0]>['users']>[number]

const ADMIN: TestUser = { id: 'u-admin', token: 't-admin', role: 'admin' }
const MEMBER: TestUser = { id: 'u-member', token: 't-member', role: null }
const OTHER: TestUser = { id: 'u-other', token: 't-other', role: null }

function auth(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function seed(users = [ADMIN, MEMBER, OTHER]) {
  const harness = createTestApp({ users })
  const res = await harness.app.request('/workspaces', {
    method: 'POST',
    headers: auth(users[0]!.token),
    body: JSON.stringify({ name: 'W' }),
  })
  const ws = (await res.json()) as { id: string }
  return { ...harness, workspaceId: ws.id, path: `/workspaces/${ws.id}/people` }
}

function get(app: TestHarness['app'], path: string, token: string) {
  return app.request(path, { headers: auth(token) })
}

describe('GET /workspaces/:workspaceId/people', () => {
  it('is readable by a member who is not an administrator', async () => {
    // ⚠️ THE REASON THIS ROUTE EXISTS. An assignee picker fed from
    // `GET /members` passes every other test in this file and fails this one,
    // because that prefix is admin-only by its mount in `app.ts`. It would
    // work today only because all nine current users are administrators, and
    // would break for the first person added as a member — which is the case
    // the members work was commissioned for.
    const { app, path } = await seed()
    const res = await get(app, path, MEMBER.token)
    expect(res.status).toBe(200)
    expect(res.status).not.toBe(403)
  })

  it('answers the three-field shape and nothing more', async () => {
    const { app, path } = await seed()
    const body = await (await get(app, path, MEMBER.token)).json()
    const parsed = WorkspacePeopleResponseSchema.safeParse(body)
    expect(parsed.success).toBe(true)
    // `safeParse` would pass on extra keys, and the whole point of this route
    // is what it does not carry — so the keys are asserted directly.
    const first = (body as { people: Record<string, unknown>[] }).people[0]
    expect(first && Object.keys(first).sort()).toEqual(['displayName', 'email', 'id'])
    for (const leaked of ['role', 'mustSetPassword', 'deactivatedAt', 'createdAt', 'brands']) {
      expect(first).not.toHaveProperty(leaked)
    }
  })

  it('lists everybody, so a request can be handed to a colleague', async () => {
    const { app, path } = await seed()
    const body = (await (await get(app, path, MEMBER.token)).json()) as {
      people: { id: string }[]
    }
    expect(body.people.map((p) => p.id).sort()).toEqual(['u-admin', 'u-member', 'u-other'])
  })

  it('omits a deactivated account', async () => {
    const { app, path } = await seed([ADMIN, MEMBER, { ...OTHER, deactivatedAt: '2026-10-01' }])
    const body = (await (await get(app, path, MEMBER.token)).json()) as {
      people: { id: string }[]
    }
    expect(body.people.map((p) => p.id)).not.toContain('u-other')
  })

  it('401s a token it cannot verify', async () => {
    // 401, not 403: an unknown bearer token is not a valid token with no
    // account behind it — it is a token we cannot verify, which is the one case
    // the three-refusal table in `CLAUDE.md` keeps at 401. `NO_ACCOUNT` needs a
    // provider that verifies and resolves nobody; `routes/me.test.ts` builds
    // that stub, and the refusal is in the shared auth middleware rather than
    // in this route, so it is asserted once there.
    const { app, path } = await seed()
    const res = await get(app, path, 't-nobody')
    expect(res.status).toBe(401)
  })

  it('refuses a deactivated caller', async () => {
    const { app, path } = await seed([ADMIN, { ...MEMBER, deactivatedAt: '2026-10-01' }])
    const res = await get(app, path, MEMBER.token)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'ACCOUNT_DEACTIVATED' })
  })

  it('refuses a caller who has not set their own password', async () => {
    // The password gate is mounted on `/workspaces`, so this route inherits it.
    const { app, path } = await seed([ADMIN, { ...MEMBER, mustSetPassword: true }])
    const res = await get(app, path, MEMBER.token)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'PASSWORD_NOT_SET' })
  })

  it('404s an unknown workspace rather than answering its people', async () => {
    const { app } = await seed()
    const res = await get(
      app,
      '/workspaces/11111111-1111-4111-8111-111111111111/people',
      MEMBER.token,
    )
    expect(res.status).toBe(404)
  })
})
