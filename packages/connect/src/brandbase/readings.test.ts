import { createCore } from '@brandfactory/core/src/app'
import { type Files } from '@brandfactory/core/src/files'
import { addPrincipal, setLoadout } from '@brandfactory/core/src/registry'
import { describe, expect, it } from 'vitest'
import { platformsFromEnv } from './env'
import { type MakeReadings } from './readings'
import { accountRoutes } from './routes'
import { testCore } from './test-core'

const KEY = 'k'.repeat(40)
const AGENT = 'owner/make'
const IG_ID = '17841400000000001'
const CDN = 'https://scontent-sin6-1.cdninstagram.com/v/t51/'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

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
 * Meta's image hosts and the storage's write URL, as stand-ins: a cover answers `cover` (a JPEG
 * unless told otherwise), and every request is kept. Nothing reaches the network.
 */
function fakeWeb() {
  const seen: { url: string; method: string; redirect?: string; bytes?: number }[] = []
  const state = {
    cover: 200,
    type: 'image/jpeg',
    put: 200,
    body: JPEG as Uint8Array,
    /** Bodies the route let go of unread. */
    cancelled: 0,
  }
  const get = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    seen.push({
      url: String(url),
      method,
      redirect: init?.redirect,
      bytes: init?.body ? (init.body as Uint8Array).length : undefined,
    })
    if (method === 'PUT') return new Response(null, { status: state.put })
    const bytes = state.cover === 200 ? state.body : new TextEncoder().encode('no')
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes)
        c.close()
      },
      cancel() {
        state.cancelled++
      },
    })
    return new Response(stream, {
      status: state.cover,
      headers: { 'content-type': state.type },
    })
  }) as typeof fetch
  return { fetch: get, seen, state }
}

/**
 * The core with the account routes, casa's Instagram linked through Make, and the read-back's
 * agent acting for casa's owner with the three moves it uses.
 */
async function setUp(
  readings: MakeReadings | undefined,
  ops = ['post.sync', 'post.sync_cover', 'media.create'],
) {
  const t = await testCore(undefined, files)
  const app = createCore(t.core)
  app.route('/', accountRoutes(t.core, { readings }))
  await addPrincipal(t.db, AGENT, 'owner')
  await setLoadout(t.db, AGENT, 'brandbase', ops)
  await t.db
    .exec(`insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by)
    values ('casa', 'instagram', '${IG_ID}', '@casavostra', 'make', '{}', 'owner')`)
  async function send(brand: string, body: unknown, key: string | null = KEY) {
    const res = await app.request(`/brands/${brand}/make/readings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key !== null && { 'x-make-apikey': key }),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    const text = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, data: (text ? JSON.parse(text) : null) as any }
  }
  const posts = () =>
    t.db.query<{ id: string; media: unknown[]; metrics: unknown }>(
      `select id, media, metrics from brandbase.posts where brand_id = 'casa' order by id`,
    )
  const readingCount = async () =>
    (await t.db.query<{ n: number }>('select count(*)::int as n from brandbase.post_readings'))[0]!
      .n
  return { ...t, send, posts, readingCount }
}

const item = (externalId: string, extra: Record<string, unknown> = {}) => ({
  externalId,
  kind: 'post',
  postedAt: '2026-10-05T02:30:00Z',
  caption: 'Fresh pasta tonight.',
  permalink: `https://www.instagram.com/p/D${externalId.slice(-4)}/`,
  metrics: { likes: 40, comments: 3, reach: 900 },
  readAt: '2026-10-06T03:00:00Z',
  ...extra,
})
const batch = (...items: unknown[]) => ({ channel: 'ig', account: IG_ID, items })

describe("Make's read-back route", () => {
  it('takes a batch with its key, as the configured agent, and copies each new cover into the brand’s files', async () => {
    const web = fakeWeb()
    const t = await setUp({ secret: KEY, as: AGENT, fetch: web.fetch })
    const reel = item('18000000000000002', {
      kind: 'reel',
      mediaUrl: `${CDN}reel.mp4`,
      thumbnailUrl: `${CDN}reel.jpg`,
    })
    const res = await t.send(
      'casa',
      batch(item('18000000000000001', { mediaUrl: `${CDN}a.jpg` }), reel),
    )
    expect(res).toEqual({
      status: 200,
      data: { made: 2, updated: 0, readings: 2, covers: { copied: 2, failed: 0, left: 0 } },
    })
    // The reel's cover is its thumbnail, never its video; no redirect is followed.
    expect(web.seen.filter((s) => s.method === 'GET')).toEqual([
      { url: `${CDN}a.jpg`, method: 'GET', redirect: 'error', bytes: undefined },
      { url: `${CDN}reel.jpg`, method: 'GET', redirect: 'error', bytes: undefined },
    ])
    expect(web.seen.filter((s) => s.method === 'PUT').map((s) => [s.url, s.bytes])).toEqual([
      ['https://storage.test/put', JPEG.length],
      ['https://storage.test/put', JPEG.length],
    ])
    const rows = await t.posts()
    expect(rows.map((r) => r.id)).toEqual([
      'casa-ig-18000000000000001',
      'casa-ig-18000000000000002',
    ])
    for (const r of rows) {
      expect(r.media).toEqual([
        {
          src: expect.stringMatching(
            /^https:\/\/core\.test\/files\/[A-Za-z0-9_-]{43}\/brandbase\/[0-9a-f-]{36}\.jpg#photo$/,
          ),
          kind: 'photo',
          mediaId: expect.stringMatching(new RegExp(`^${r.id}-[0-9a-f]{8}$`)),
        },
      ])
    }
    // The file record is the brand's, and every move ran as the agent, for its person.
    expect(
      await t.db.query(`select brand_id, mime, bytes from brandbase.media order by id`),
    ).toEqual([
      { brand_id: 'casa', mime: 'image/jpeg', bytes: JPEG.length },
      { brand_id: 'casa', mime: 'image/jpeg', bytes: JPEG.length },
    ])
    expect(
      await t.db.query(
        `select op, principal, agent_of as "agentOf", count(*)::int as n from packs.op_calls
         where status = 200 group by op, principal, agent_of order by op`,
      ),
    ).toEqual([
      { op: 'media.create', principal: AGENT, agentOf: 'owner', n: 2 },
      { op: 'post.sync', principal: AGENT, agentOf: 'owner', n: 1 },
      { op: 'post.sync_cover', principal: AGENT, agentOf: 'owner', n: 2 },
    ])

    // The same batch again: nothing changes, and a post with its cover is not copied again.
    const again = await t.send(
      'casa',
      batch(item('18000000000000001', { mediaUrl: `${CDN}a.jpg` }), reel),
    )
    expect(again.data).toEqual({
      made: 0,
      updated: 0,
      readings: 0,
      covers: { copied: 0, failed: 0, left: 0 },
    })
    expect(web.seen.length).toBe(4)
  })

  it('refuses a missing or wrong key, and answers that it is not set up when it is not; nothing is written', async () => {
    const t = await setUp({ secret: KEY, as: AGENT, fetch: fakeWeb().fetch })
    const body = batch(item('18000000000000001'))
    expect(await t.send('casa', body, null)).toMatchObject({
      status: 401,
      data: { code: 'UNAUTHORIZED' },
    })
    expect(await t.send('casa', body, 'k'.repeat(39))).toMatchObject({ status: 401 })
    expect(await t.send('casa', body, `${KEY}x`)).toMatchObject({ status: 401 })
    // A person's sign-in is not the key.
    expect(await t.send('casa', body, 'owner')).toMatchObject({ status: 401 })
    expect(await t.posts()).toEqual([])

    const off = await setUp(undefined)
    expect(await off.send('casa', body)).toMatchObject({
      status: 503,
      data: { code: 'PLATFORM_OFF' },
    })
    expect(await off.posts()).toEqual([])
  })

  it('refuses what the move does not take, a brand with no linked account, another account and another company’s brand', async () => {
    const t = await setUp({ secret: KEY, as: AGENT, fetch: fakeWeb().fetch })
    const bad = async (brand: string, body: unknown) => {
      const res = await t.send(brand, body)
      return [res.status, res.data.code]
    }
    expect(await bad('casa', 'not json')).toEqual([400, 'VALIDATION'])
    expect(await bad('casa', [batch(item('1'))])).toEqual([400, 'VALIDATION'])
    expect(await bad('casa', { ...batch(item('18000000000000001')), extra: 1 })).toEqual([
      400,
      'VALIDATION',
    ])
    expect(
      await bad('casa', batch({ ...item('18000000000000001'), metrics: { likes: '40' } })),
    ).toEqual([400, 'VALIDATION'])
    expect(
      await bad('casa', batch(...Array.from({ length: 51 }, (_, i) => item(String(1000 + i))))),
    ).toEqual([400, 'VALIDATION'])
    // The path names the brand: one in the body changes nothing.
    expect(await bad('osteria', { ...batch(item('18000000000000001')), brand: 'casa' })).toEqual([
      409,
      'NOT_LINKED',
    ])
    expect(
      await bad('casa', { ...batch(item('18000000000000001')), account: '17841400000000999' }),
    ).toEqual([409, 'NOT_LINKED'])
    // temper is company B's: the owner's agent does not reach it.
    expect(await bad('temper', batch(item('18000000000000001')))).toEqual([404, 'NOT_FOUND'])
    expect(await t.posts()).toEqual([])
    expect(await t.readingCount()).toBe(0)

    const big = { ...batch(item('18000000000000001')), pad: 'x'.repeat(2 * 1024 * 1024) }
    expect(await bad('casa', big)).toEqual([413, 'TOO_LARGE'])
  })

  it('keeps the counts when a cover does not copy, reads no host but Meta’s, and tries again next run', async () => {
    const web = fakeWeb()
    const t = await setUp({ secret: KEY, as: AGENT, fetch: web.fetch })
    web.state.cover = 403
    const body = batch(
      item('18000000000000001', { mediaUrl: `${CDN}a.jpg` }),
      item('18000000000000002', { mediaUrl: 'https://evil.example/a.jpg' }),
      item('18000000000000003'),
    )
    expect((await t.send('casa', body)).data).toEqual({
      made: 3,
      updated: 0,
      readings: 3,
      covers: { copied: 0, failed: 2, left: 0 },
    })
    expect(web.seen.map((s) => s.url)).toEqual([`${CDN}a.jpg`])
    expect(web.state.cancelled).toBe(1)
    expect((await t.posts()).map((p) => [p.id, p.media, p.metrics])).toEqual([
      ['casa-ig-18000000000000001', [], { likes: 40, comments: 3, reach: 900 }],
      ['casa-ig-18000000000000002', [], { likes: 40, comments: 3, reach: 900 }],
      ['casa-ig-18000000000000003', [], { likes: 40, comments: 3, reach: 900 }],
    ])

    // Not an image, or a failed upload: still nothing stored on the post.
    web.state.cover = 200
    web.state.type = 'text/html'
    expect((await t.send('casa', body)).data.covers).toEqual({ copied: 0, failed: 2, left: 0 })
    expect(web.state.cancelled).toBe(2)
    web.state.type = 'image/jpeg'
    web.state.put = 500
    expect((await t.send('casa', body)).data.covers).toEqual({ copied: 0, failed: 2, left: 0 })
    expect((await t.posts()).every((p) => p.media.length === 0)).toBe(true)

    web.state.put = 200
    expect((await t.send('casa', body)).data.covers).toEqual({ copied: 1, failed: 1, left: 0 })
    expect((await t.posts()).map((p) => p.media.length)).toEqual([1, 0, 0])
  })

  it('copies at most 8 covers per request and leaves the rest for the next run', async () => {
    const web = fakeWeb()
    const t = await setUp({ secret: KEY, as: AGENT, fetch: web.fetch })
    const body = batch(
      ...Array.from({ length: 10 }, (_, i) =>
        item(`186000000000000${String(i).padStart(2, '0')}`, { mediaUrl: `${CDN}${i}.jpg` }),
      ),
    )
    expect((await t.send('casa', body)).data).toMatchObject({
      made: 10,
      covers: { copied: 8, failed: 0, left: 2 },
    })
    expect((await t.send('casa', body)).data.covers).toEqual({ copied: 2, failed: 0, left: 0 })
    expect((await t.posts()).every((p) => p.media.length === 1)).toBe(true)
  })

  it('reads a cover only when it can keep it: a live story, a Meta host on its own port, bytes that are the image they say, at most 8 MB, an id that fits', async () => {
    const web = fakeWeb()
    const t = await setUp({ secret: KEY, as: AGENT, fetch: web.fetch })
    await t.db
      .exec(`insert into brandbase.posts (id, brand_id, format, hook, day, time, channels, marked, permalink)
      values ('casa-ig-${'L'.repeat(68)}', 'casa', 'carousel', 'Long', '2026-10-01', '10:00', '{ig}', 'posted',
        'https://www.instagram.com/p/DLong/')`)
    const media = async () =>
      (await t.db.query<{ n: number }>('select count(*)::int as n from brandbase.media'))[0]!.n
    const gone = item('18000000000000001', {
      kind: 'story',
      postedAt: '2026-10-05T02:00:00Z',
      mediaUrl: `${CDN}s.jpg`,
    })
    const port = item('18000000000000002', {
      mediaUrl: 'https://scontent-sin6-1.cdninstagram.com:8443/a.jpg',
    })
    const long = item('18000000000000003', {
      permalink: 'https://www.instagram.com/p/DLong/',
      mediaUrl: `${CDN}l.jpg`,
    })
    expect((await t.send('casa', batch(gone, port, long))).data.covers).toEqual({
      copied: 0,
      failed: 2,
      left: 0,
    })
    expect(web.seen).toEqual([])

    // An HTML page that says it is a JPEG, and one past 8 MB with no length given: no record made.
    const one = batch(item('18000000000000004', { mediaUrl: `${CDN}a.jpg` }))
    web.state.body = new TextEncoder().encode('<html>not an image</html>')
    expect((await t.send('casa', one)).data.covers).toMatchObject({ copied: 0, failed: 1 })
    const big = new Uint8Array(8 * 1024 * 1024 + 1)
    big.set(JPEG)
    web.state.body = big
    expect((await t.send('casa', one)).data.covers).toMatchObject({ copied: 0, failed: 1 })
    web.state.type = 'image/png'
    web.state.body = JPEG
    expect((await t.send('casa', one)).data.covers).toMatchObject({ copied: 0, failed: 1 })
    expect(await media()).toBe(0)
    web.state.type = 'image/jpeg'
    expect((await t.send('casa', one)).data.covers).toMatchObject({ copied: 1, failed: 0 })
    expect(await media()).toBe(1)
  })

  it('gives its places to covers it can copy, newest first: a post with no image or a gone story takes none', async () => {
    const web = fakeWeb()
    const t = await setUp({ secret: KEY, as: AGENT, fetch: web.fetch })
    const bare = Array.from({ length: 9 }, (_, i) =>
      item(`187000000000000${String(i).padStart(2, '0')}`, { postedAt: '2026-10-05T03:00:00Z' }),
    )
    const gone = item('18710000000000001', {
      kind: 'story',
      postedAt: '2026-10-04T03:00:00Z',
      mediaUrl: `${CDN}gone.jpg`,
    })
    const older = item('18720000000000001', {
      postedAt: '2026-10-01T03:00:00Z',
      mediaUrl: `${CDN}old.jpg`,
    })
    const newer = item('18720000000000002', {
      postedAt: '2026-10-04T03:00:00Z',
      mediaUrl: `${CDN}new.jpg`,
    })
    expect((await t.send('casa', batch(...bare, gone, older, newer))).data).toMatchObject({
      made: 12,
      covers: { copied: 2, failed: 0, left: 0 },
    })
    expect(web.seen.filter((s) => s.method === 'GET').map((s) => s.url)).toEqual([
      `${CDN}new.jpg`,
      `${CDN}old.jpg`,
    ])
  })

  it('refuses the batch when the agent does not hold the move', async () => {
    const t = await setUp({ secret: KEY, as: AGENT, fetch: fakeWeb().fetch }, ['media.create'])
    expect(await t.send('casa', batch(item('18000000000000001')))).toMatchObject({
      status: 403,
      data: { code: 'FORBIDDEN' },
    })
  })
})

describe("the read-back's settings", () => {
  it('takes both or none, with a key of 32 characters or more', () => {
    expect(platformsFromEnv({}).readings).toBeUndefined()
    expect(
      platformsFromEnv({ MAKE_READINGS_SECRET: KEY, MAKE_READINGS_AS: AGENT }).readings,
    ).toEqual({ secret: KEY, as: AGENT })
    expect(() => platformsFromEnv({ MAKE_READINGS_SECRET: KEY })).toThrow(/MAKE_READINGS_AS/)
    expect(() => platformsFromEnv({ MAKE_READINGS_AS: AGENT })).toThrow(/MAKE_READINGS_SECRET/)
    expect(() =>
      platformsFromEnv({ MAKE_READINGS_SECRET: 'short', MAKE_READINGS_AS: AGENT }),
    ).toThrow(/32 characters/)
  })
})
