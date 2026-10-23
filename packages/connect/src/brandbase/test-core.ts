import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPack } from '@brandfactory/core/src/pack'
import { createCore } from '@brandfactory/core/src/app'
import { type Files } from '@brandfactory/core/src/files'
import { deps, freshDb, goLive, person } from '@brandfactory/core/src/testing'
import { accountRoutes, type Platforms } from './routes'

/** The core's pinned clock in tests (`testing.ts`). */
export const NOW = new Date('2026-10-06T04:00:00Z')

const pack = readPack(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../packs/brandbase'),
)

/**
 * A core with the brandbase pack live on a fresh database, loaded with the pack's own test
 * fixture: `member` in company A (casa, osteria), `both` in company A and B (temper too), `gone`
 * deactivated.
 */
export async function testCore(now = NOW, files?: Files) {
  const db = await freshDb()
  await goLive(db, pack)
  await db.exec(pack.fixture)
  for (const id of ['member', 'both', 'gone']) await person(db, id, pack)
  let at = now
  const core = { ...deps(db), now: () => at, files }
  /** Moves the core's clock. */
  const setNow = (when: Date) => (at = when)
  return { db, core, setNow }
}

/**
 * The core with the account routes beside it, as the host mounts them. `call` sends one request
 * with a person's token (the dev sign-in: the token is the user id).
 */
export async function serve(platforms: Platforms, now = NOW, files?: Files) {
  const t = await testCore(now, files)
  const app = createCore(t.core)
  app.route('/', accountRoutes(t.core, platforms))
  async function call(method: string, path: string, body?: unknown, token = 'member') {
    const res = await app.request(path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, data: (text ? JSON.parse(text) : null) as any }
  }
  /** The brand's state, as the screens read it. */
  const stateOf = async (brand: string, token = 'member') =>
    (await call('POST', '/ops/brandbase/brand.state', { brand }, token)).data
  /** The account rows, read past the row rules. */
  const accounts = () =>
    t.db.query<{
      brand_id: string
      platform: string
      account_id: string
      username: string
      tokens: string
      details: Record<string, unknown>
    }>('select * from brandbase.accounts order by brand_id, platform')
  return { ...t, call, stateOf, accounts }
}
