import { afterEach, beforeAll } from 'vitest'
import { createApp } from './app'
import { devAuth } from './auth'
import { migrateTestDb, openTestDb, type Db } from './db/client'
import { brandAccounts, brands, connections, members, users } from './db/schema'
import { type MetaApp } from './meta'
import { type PinterestApp } from './pinterest'
import { type TikTokApp } from './tiktok'
import { instantOf } from './time'

/** Tue 6 Oct 2026, 12:00 in Singapore: the demo's "today". */
export const NOW = new Date('2026-10-06T04:00:00Z')

beforeAll(() => migrateTestDb().then(() => undefined), 120_000)

const open: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((close) => close()))
})

/**
 * An app on a fresh in-memory database with two brands: `casa` (ig, tt, fb; Lark linked) and
 * `temper`. `member` reaches `casa` only, `admin` reaches both, `stranger` has a token and no
 * account.
 */
export async function testApp(
  now: Date = NOW,
  extra: { pinterest?: PinterestApp; meta?: MetaApp; tiktok?: TikTokApp } = {},
) {
  const handle = await openTestDb()
  open.push(handle.close)
  const db: Db = handle.db
  await db.insert(brands).values([
    {
      id: 'casa',
      name: 'Casa Vostra',
      handle: '@casavostra',
      linked: ['ig', 'tt', 'fb'],
      position: 0,
    },
    { id: 'temper', name: 'Temper', handle: '@temper', linked: ['ig', 'tt', 'fb'], position: 1 },
  ])
  await db.insert(users).values([
    { id: 'member', email: 'member@example.com' },
    { id: 'admin', email: 'admin@example.com', role: 'admin' },
    { id: 'gone', email: 'gone@example.com', deactivatedAt: new Date() },
  ])
  await db.insert(members).values([
    { userId: 'member', brandId: 'casa' },
    { userId: 'gone', brandId: 'casa' },
  ])
  await db.insert(connections).values({ brandId: 'casa', key: 'lark', status: 'connected' })
  const sent: string[][] = []
  let failInvite = false
  const app = createApp({
    db,
    auth: devAuth(),
    now: () => now,
    instantOf,
    invites: {
      async send(_brand, _shoot, people) {
        if (failInvite) {
          failInvite = false
          throw new Error('Lark is down')
        }
        sent.push(people.map((p) => p.name))
      },
    },
    corsOrigins: [],
    storage: {
      async signedWriteUrl(key, contentType) {
        return {
          url: `https://storage.test/upload/${key}`,
          headers: { 'content-type': contentType },
        }
      },
      async signedReadUrl(key) {
        return `https://storage.test/read/${key}`
      },
    },
    publicUrl: 'https://api.test',
    mediaSecret: 'test-secret',
    ...extra,
  })

  async function call(method: string, path: string, json?: unknown, token = 'member') {
    const res = await app.request(path, {
      method,
      headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(json !== undefined && { 'content-type': 'application/json' }),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    })
    const text = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = text ? JSON.parse(text) : null
    return { status: res.status, data }
  }

  return { app, db, call, sent, failNextInvite: () => (failInvite = true) }
}

/**
 * Links a brand's publishing accounts as the sign-ins would: a Facebook Page (with an Instagram
 * account unless `ig` is false) and a TikTok account. The tokens are placeholders; no route here
 * opens them.
 */
export async function linkAccounts(
  db: Db,
  brandId: string,
  link: { meta?: boolean; ig?: boolean; tiktok?: boolean } = { meta: true, tiktok: true },
) {
  const rows: (typeof brandAccounts.$inferInsert)[] = []
  if (link.meta) {
    rows.push({
      brandId,
      platform: 'meta',
      accountId: `page-${brandId}`,
      username: `${brandId} Page`,
      tokens: 'sealed',
      details: link.ig === false ? {} : { igUserId: `ig-${brandId}`, igUsername: brandId },
    })
  }
  if (link.tiktok) {
    rows.push({
      brandId,
      platform: 'tiktok',
      accountId: `tt-${brandId}`,
      username: brandId,
      tokens: 'sealed',
    })
  }
  if (rows.length > 0) await db.insert(brandAccounts).values(rows)
}
