import { createCore } from '@brandfactory/core/src/app'
import { type Files } from '@brandfactory/core/src/files'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { metaApp } from './meta'
import { type PictureRun, rosterPictureRoutes, THUMB_PX } from './roster-pictures'
import { NOW, testCore } from './test-core'

const IG = '17841400000000001'
const TOKEN = 'page-token'
const PICTURE = 'https://scontent-sin6-1.cdninstagram.com/v/ana.jpg?oe=1'
// A picture as Meta sends it: 1080px square, far larger than any screen shows it.
const JPEG = new Uint8Array(
  await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#c86' } })
    .jpeg()
    .toBuffer(),
)
const JUNK = 'https://scontent-sin6-1.cdninstagram.com/v/junk.jpg'
// Small as a file, huge once decoded: 6000px a side of one colour.
const WIDE = 'https://scontent-sin6-1.cdninstagram.com/v/wide.png'
const WIDE_PNG = new Uint8Array(
  await sharp({ create: { width: 6000, height: 6000, channels: 3, background: '#888' } })
    .png()
    .toBuffer(),
)
const BOUNCE = 'https://scontent-sin6-1.cdninstagram.com/v/bounce.jpg'
const HUGE = 'https://scontent-sin6-1.cdninstagram.com/v/huge.jpg'
const STATED = 'https://scontent-sin6-1.cdninstagram.com/v/stated.jpg'
const PAGE_NOT_IMAGE = 'https://scontent-sin6-1.cdninstagram.com/v/page.jpg'

const files: Files = {
  secret: 'x'.repeat(32),
  publicUrl: 'https://core.test',
  store: {
    signedWriteUrl: async (_key, type) => ({
      url: 'https://storage.test/put',
      headers: { 'content-type': type },
    }),
    signedReadUrl: async (key, ttl) => `https://storage.test/${key}?ttl=${ttl}`,
  },
}

/**
 * Meta's Graph API, its picture host and the storage, as stand-ins: every request is kept, and
 * anything else fails the test, so nothing reaches the network.
 */
function fakes() {
  const asked: string[] = []
  const stored: Uint8Array[] = []
  const state = {
    limited: false,
    broken: false,
    storeDown: false,
    picture: PICTURE as string | null,
  }
  const json = (data: unknown, status = 200) => Response.json(data, { status })
  const graph = async (input: string | URL | Request) => {
    const url = new URL(String(input))
    expect(url.pathname).toBe(`/v26.0/${IG}`)
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
    const name = /username\(([^)]+)\)/.exec(url.searchParams.get('fields') ?? '')?.[1] ?? ''
    asked.push(name)
    if (state.broken) return json({ error: { message: 'An unknown error occurred', code: 1 } }, 500)
    if (state.limited) {
      return json({ error: { message: 'Application request limit reached', code: 4 } }, 400)
    }
    if (name === 'ana.cooks') {
      return json({
        business_discovery: {
          id: '1',
          name: 'Ana Cooks At Home',
          followers_count: 12500,
          ...(state.picture && { profile_picture_url: state.picture }),
        },
      })
    }
    if (name === 'casanostrasg') {
      return json({ business_discovery: { id: '2', name: ' Casa Nostra ', followers_count: 900 } })
    }
    return json({ error: { message: 'Cannot find User', code: 110 } }, 400)
  }
  const media = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === PICTURE) return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } })
    // Meta's host sending the read elsewhere, a picture larger than it says, and one too large.
    if (url === BOUNCE) {
      return new Response(null, { status: 302, headers: { location: 'https://evil.test/x.jpg' } })
    }
    if (url === HUGE) {
      return new Response(new Uint8Array(6 * 1024 * 1024), {
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    if (url === STATED) {
      return new Response(JPEG, {
        headers: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) },
      })
    }
    // An image type, and bytes that are no image.
    if (url === JUNK) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    if (url === WIDE) return new Response(WIDE_PNG, { headers: { 'content-type': 'image/png' } })
    if (url === PAGE_NOT_IMAGE)
      return new Response('<html>', { headers: { 'content-type': 'text/html' } })
    if (url === 'https://storage.test/put' && init?.method === 'PUT') {
      if (state.storeDown) return new Response(null, { status: 503 })
      stored.push(init.body as Uint8Array)
      return new Response(null, { status: 200 })
    }
    throw new Error(`unexpected request ${url}`)
  }
  const app = metaApp({
    appId: 'a',
    appSecret: 's',
    configId: 'c',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 7),
    fetch: graph as typeof fetch,
  })
  return { app, media: media as typeof fetch, asked, stored, state }
}

async function setUp({ linked = true } = {}) {
  const f = fakes()
  const t = await testCore(NOW, files)
  const server = createCore(t.core)
  server.route('/', rosterPictureRoutes(t.core, f.app, { fetch: f.media, gapMs: 0 }))
  if (linked) {
    await t.db.query(
      `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
        ('casa', 'instagram', $1, 'casavostra', $2, '{"via": "meta"}', 'owner')`,
      [IG, f.app.sealToken(TOKEN, `instagram:casa:${IG}`)],
    )
  }
  // A second person of company A, whose Instagram account Business Discovery does not find.
  // Casa's saved collaborators: one on the roster (Ana), one named by hand, one Meta names.
  await t.db.exec(`
    update brandbase.brands set collaborators = '{"ig": ["@ana.cooks", "@casanostrasg", "@named.by.hand"]}' where id = 'casa';
    insert into brandbase.account_profiles (org_id, handle, name) values ('co-a', 'named.by.hand', 'Kept Name');
    insert into brandbase.influencers (id, org_id, slug, name) values
      ('00000000-0000-4000-8000-00000000a002', 'co-a', 'private-one', 'Private One');
    insert into brandbase.influencer_accounts (influencer_id, org_id, position, platform, handle) values
      ('00000000-0000-4000-8000-00000000a002', 'co-a', 0, 'instagram', 'private.one');
  `)
  const send = async (method: string, path: string, token = 'owner') => {
    const res = await server.request(path, {
      method,
      headers: { authorization: `Bearer ${token}` },
    })
    return { status: res.status, data: (await res.json()) as PictureRun & { code?: string } }
  }
  /** Starts a run and answers its counts once it has ended. */
  const runs = async (query = '') => {
    const started = await send('POST', `/roster/pictures${query}`)
    expect(started.status).toBe(202)
    for (let i = 0; i < 200; i++) {
      const now = await send('GET', '/roster/pictures')
      if (!now.data.running) return now.data
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('the run did not end')
  }
  const accounts = () =>
    t.db.query<{ handle: string; picture: string | null; followers: number | null; read: boolean }>(
      `select handle, picture, followers::int, read_at is not null as read
       from brandbase.influencer_accounts where platform = 'instagram' and org_id = 'co-a' order by handle`,
    )
  return { ...f, ...t, server, send, runs, accounts }
}

describe('the roster picture fetch', () => {
  it('copies each found picture into our files with its followers, and leaves initials for the rest', async () => {
    const t = await setUp()
    const run = await t.runs()
    expect(run).toMatchObject({
      due: 4,
      read: 2,
      pictures: 1,
      noPicture: 1,
      notFound: 2,
      failed: 0,
      stopped: null,
    })
    expect([...t.asked].sort()).toEqual([
      'ana.cooks',
      'casanostrasg',
      'named.by.hand',
      'private.one',
    ])
    // A saved account's name fills only an empty one: a name the team gave stays.
    expect(
      await t.db.query(
        'select handle, name, followers::int, read_at is not null as read from brandbase.account_profiles order by handle',
      ),
    ).toEqual([
      { handle: 'casanostrasg', name: 'Casa Nostra', followers: 900, read: true },
      { handle: 'named.by.hand', name: 'Kept Name', followers: null, read: true },
    ])
    // Kept small: a square WebP of THUMB_PX, a few KB, not Meta's 1080px original.
    expect(t.stored).toHaveLength(1)
    const kept = await sharp(t.stored[0]!).metadata()
    expect(kept).toMatchObject({ format: 'webp', width: THUMB_PX, height: THUMB_PX })
    expect(t.stored[0]!.length).toBeLessThan(JPEG.length / 4)
    expect(t.stored[0]!.length).toBeLessThan(10_000)
    const [ana, other] = await t.accounts()
    expect(ana!.picture).toMatch(/^\/files\/[A-Za-z0-9_-]{43}\/brandbase\/[0-9a-f-]{36}\.webp$/)
    expect(ana).toMatchObject({ handle: 'ana.cooks', followers: 12500, read: true })
    expect(other).toMatchObject({ handle: 'private.one', picture: null, read: true })
    // Both read: the next run has nothing due and asks Meta nothing.
    expect(await t.runs()).toMatchObject({ due: 0, read: 0 })
    expect(t.asked).toHaveLength(4)
    // Company B's account was never asked about.
    const [ben] = await t.db.query<{ read: boolean }>(
      "select read_at is not null as read from brandbase.influencer_accounts where handle = 'bentan'",
    )
    expect(ben!.read).toBe(false)
  })

  it('keeps the followers when Meta shows no picture, and reads at most the limit', async () => {
    const t = await setUp()
    t.state.picture = null
    expect(await t.runs('?limit=1')).toMatchObject({ due: 1, read: 1, pictures: 0, noPicture: 1 })
    expect(t.asked).toHaveLength(1)
    expect((await t.accounts())[0]).toMatchObject({ picture: null, followers: 12500 })
  })

  it("stops at Meta's first rate limit and marks nothing read", async () => {
    const t = await setUp()
    t.state.limited = true
    expect(await t.runs()).toMatchObject({ due: 4, read: 0, stopped: 'rate limit' })
    expect(t.asked).toHaveLength(1)
    expect((await t.accounts()).every((a) => !a.read)).toBe(true)
  })

  it('brings in profiles read elsewhere: copies each picture, keeps the followers, and fills only an empty name', async () => {
    const t = await setUp()
    const res = await t.server.request('/roster/profiles?org=co-a', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          { handle: 'ana.cooks', name: 'Ignored For A Person', followers: 13000, picture: PICTURE },
          { handle: 'casanostrasg', name: 'Casa Nostra', followers: 900, picture: null },
          {
            handle: 'named.by.hand',
            name: 'Other',
            followers: 5,
            picture: 'https://evil.test/x.jpg',
          },
          { handle: 'Not A Handle!', name: 'x' },
        ],
      }),
    })
    expect(await res.json()).toEqual({ read: 3, pictures: 1, noPicture: 2, skipped: 1, failed: 0 })
    expect(t.asked).toEqual([])
    const [ana] = await t.accounts()
    expect(ana).toMatchObject({ handle: 'ana.cooks', followers: 13000, read: true })
    expect(ana!.picture).toMatch(/^\/files\//)
    expect(
      await t.db.query(
        'select handle, name, followers::int, picture from brandbase.account_profiles order by handle',
      ),
    ).toEqual([
      { handle: 'casanostrasg', name: 'Casa Nostra', followers: 900, picture: null },
      { handle: 'named.by.hand', name: 'Kept Name', followers: 5, picture: null },
    ])
    const refused = await t.server.request('/roster/profiles?org=co-b', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ profiles: [{ handle: 'bentan', followers: 1 }] }),
    })
    // A company the caller does not manage is refused outright.
    expect(refused.status).toBe(403)
  })

  it('does nothing without a brand linked through Meta, and refuses a caller with no account', async () => {
    const t = await setUp({ linked: false })
    expect(await t.runs()).toMatchObject({ stopped: 'no linked account', read: 0 })
    expect(t.asked).toEqual([])
    expect((await t.send('POST', '/roster/pictures', 'stranger')).status).not.toBe(202)
  })

  it('copies a picture only from Meta’s hosts, as an image, within 5 MB', async () => {
    const t = await setUp()
    const res = await t.server.request('/roster/profiles?org=co-a', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          { handle: 'ana.cooks', picture: BOUNCE },
          { handle: 'private.one', picture: 'https://evil.test/x.jpg' },
          { handle: 'casanostrasg', picture: HUGE },
          { handle: 'named.by.hand', picture: STATED },
          { handle: 'other.one', picture: PAGE_NOT_IMAGE },
          { handle: 'third.one', picture: JUNK },
          { handle: 'fourth.one', picture: WIDE },
        ],
      }),
    })
    expect(await res.json()).toMatchObject({ read: 7, pictures: 0, noPicture: 7 })
    expect(t.stored).toEqual([])
  })

  it('counts a copy that failed on the way as failed, never as an account with no picture', async () => {
    const t = await setUp()
    t.state.storeDown = true
    // The run: Meta answered, the storage did not. The followers stay; the picture is not "none".
    expect(await t.runs('?limit=1')).toMatchObject({
      read: 1,
      pictures: 0,
      noPicture: 0,
      failed: 1,
    })
    const [ana] = await t.accounts()
    expect(ana).toMatchObject({ handle: 'ana.cooks', picture: null, followers: 12500 })
    // A profile brought in: counted failed, and not marked read, so the next read tries again.
    const res = await t.server.request('/roster/profiles?org=co-a', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ profiles: [{ handle: 'casanostrasg', picture: PICTURE }] }),
    })
    expect(await res.json()).toEqual({ read: 0, pictures: 0, noPicture: 0, skipped: 0, failed: 1 })
  })

  it('lets only a company’s owners and admins start a run or bring in profiles', async () => {
    const t = await setUp()
    expect((await t.send('POST', '/roster/pictures', 'member')).status).toBe(403)
    const res = await t.server.request('/roster/profiles?org=co-a', {
      method: 'POST',
      headers: { authorization: 'Bearer member', 'content-type': 'application/json' },
      body: JSON.stringify({ profiles: [] }),
    })
    expect(res.status).toBe(403)
    expect(t.asked).toEqual([])
  })

  it('marks an account whose read failed as read, so the next run goes on to the others', async () => {
    const t = await setUp()
    t.state.broken = true
    expect(await t.runs()).toMatchObject({ due: 4, read: 0, failed: 4 })
    expect((await t.accounts()).every((a) => a.read)).toBe(true)
  })
})
