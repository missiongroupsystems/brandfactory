import { createHmac } from 'node:crypto'
import { createCore } from '@brandfactory/core/src/app'
import { type Files } from '@brandfactory/core/src/files'
import { addPrincipal, setLoadout } from '@brandfactory/core/src/registry'
import { describe, expect, it } from 'vitest'
import { metaApp } from './meta'
import { idOf, metaHandler, permalinkIn, SAY } from './meta-capture'
import { batchesOf } from './meta-inbox'
import { messagingOf, metaPoll } from './meta-poll'
import { type MetaHooks } from './meta-webhooks'
import { accountRoutes } from './routes'
import { NOW, testCore } from './test-core'

const IG = '17841400000000001'
const PAGE = '100000000000001'
const TOKEN = 'page-token'
const SECRET = 'app-secret'
const AGENT = 'owner/meta'
const SENDER = '5001'
const REEL = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=x'
const CDN = 'https://scontent-sin6-1.cdninstagram.com/v/reel.mp4'
const PERMALINK = 'https://www.instagram.com/reel/DAbc123xyz/'
const VIDEO = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4])

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

type Sent = { path: string; params: Record<string, string> }

/**
 * Meta's Graph API, its media hosts and the storage, as stand-ins: every request is kept, and
 * nothing reaches the network. The state says what each read answers.
 */
function fakes() {
  const graph: Sent[] = []
  const media: { url: string; method: string; bytes: number }[] = []
  const state = {
    conversations: [] as unknown[],
    messenger: [] as unknown[],
    posts: [] as unknown[],
    /** Senders' profiles, by IGSID. */
    people: { [SENDER]: { name: 'Ana Lee', username: 'ana.cooks' } } as Record<string, unknown>,
    /** What a read of a message answers (the Conversations API). */
    message: {} as Record<string, unknown>,
    /** What a read of a media id's permalink answers. */
    permalink: null as string | null,
    mediaType: 'video/mp4',
    mediaLength: VIDEO.length as number | null,
  }
  const graphFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const params = Object.fromEntries(
      init?.method === 'POST' ? new URLSearchParams(String(init.body)) : url.searchParams,
    )
    const path = url.pathname.replace('/v26.0', '')
    graph.push({ path, params })
    expect(params.access_token).toBe(TOKEN)
    if (path.endsWith('/conversations')) {
      return Response.json({
        data: params.platform === 'messenger' ? state.messenger : state.conversations,
      })
    }
    if (path.endsWith('/media')) return Response.json({ data: state.posts })
    if (params.fields === 'name,username') {
      const person = state.people[path.slice(1)]
      return person
        ? Response.json(person)
        : Response.json({ error: { message: 'no', code: 100 } }, { status: 400 })
    }
    if (params.fields?.startsWith('shares')) return Response.json(state.message)
    if (params.fields === 'permalink') {
      return state.permalink
        ? Response.json({ permalink: state.permalink })
        : Response.json({ error: { message: 'no', code: 10 } }, { status: 400 })
    }
    return Response.json({ recipient_id: SENDER, message_id: 'm-1' })
  }
  const app = metaApp({
    appId: 'a',
    appSecret: SECRET,
    configId: 'c',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 7),
    fetch: graphFetch as typeof fetch,
  })
  const other = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === REEL) return new Response(null, { status: 302, headers: { location: CDN } })
    if (url === CDN) {
      const headers: Record<string, string> = { 'content-type': state.mediaType }
      if (state.mediaLength !== null) headers['content-length'] = String(state.mediaLength)
      return new Response(VIDEO, { headers })
    }
    if (url === 'https://storage.test/put') {
      const bytes = new Uint8Array(await new Response(init!.body).arrayBuffer())
      media.push({ url, method: init!.method!, bytes: bytes.length })
      return new Response(null, { status: 200 })
    }
    throw new Error(`no fake for ${url}`)
  }
  return { app, graph, media, state, fetch: other as typeof fetch }
}

/** The DMs the account sent, in order: their text and their quick replies. */
const dms = (graph: Sent[]) =>
  graph
    .filter((g) => g.path === `/${PAGE}/messages`)
    .map((g) => {
      const m = JSON.parse(g.params.message!) as {
        text: string
        quick_replies?: { title: string; payload: string }[]
      }
      return { to: JSON.parse(g.params.recipient!).id as string, ...m }
    })

/** casa's Instagram account is the capture account; the agent reaches company A (casa, osteria). */
async function setUp(hooks: Partial<MetaHooks> = {}) {
  const f = fakes()
  const t = await testCore(NOW, files)
  const metaHooks: MetaHooks = {
    verifyToken: 'v',
    appSecret: SECRET,
    as: AGENT,
    captureBrand: 'casa',
    ...hooks,
  }
  const handler = metaHandler(t.core, f.app, metaHooks, f.fetch)
  const app = createCore(t.core)
  app.route('/', accountRoutes(t.core, { meta: f.app, metaHooks }, handler))
  await addPrincipal(t.db, AGENT, 'owner')
  await setLoadout(t.db, AGENT, 'brandbase', [
    'inbox.meta_receive',
    'account.read',
    'account.meta_list',
    'brand.list',
    'capture.take',
    'capture.file',
    'capture.save',
    'capture.drop',
  ])
  await t.db.query(
    `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by, updated_at) values
      ('casa', 'facebook', $1, 'Casa Vostra', $3, '{"via": "meta"}', 'owner', $6),
      ('casa', 'instagram', $2, 'casavostra', $4, $5, 'owner', $6)`,
    [
      PAGE,
      IG,
      f.app.sealToken(TOKEN, `facebook:casa:${PAGE}`),
      f.app.sealToken(TOKEN, `instagram:casa:${IG}`),
      JSON.stringify({ via: 'meta', pageId: PAGE }),
      new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    ],
  )
  const request = async (method: string, path: string, token = 'owner') => {
    const res = await app.request(path, {
      method,
      headers: { authorization: `Bearer ${token}` },
    })
    return { status: res.status, data: (await res.json()) as Record<string, string> }
  }
  /** A delivery, signed as Meta signs it; the jobs after the 200 are waited for. */
  const deliver = async (...messaging: unknown[]) => {
    const body = JSON.stringify({
      object: 'instagram',
      entry: [{ id: IG, time: NOW.getTime(), messaging }],
    })
    const signature = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
    const res = await app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      body,
    })
    await handler.capture.idle()
    return res.status
  }
  const inbox = () =>
    t.db.query<{ id: string; text: string }>(
      'select id, text from brandbase.inbox_messages order by received_at, id',
    )
  const pasted = () =>
    t.db.query<{ id: string; brand_id: string; reference: Record<string, unknown> }>(
      'select id, brand_id, reference from brandbase.pasted_links order by id',
    )
  return { ...t, ...f, meta: f.app, handler, app, request, deliver, inbox, pasted }
}

const dm = (mid: string, text: string, sender = SENDER, more: Record<string, unknown> = {}) => ({
  sender: { id: sender },
  recipient: { id: IG },
  timestamp: NOW.getTime() - 1000,
  message: { mid, text, ...more },
})
const share = (mid: string, sender = SENDER, type = 'ig_reel', url = REEL, more = {}) => ({
  sender: { id: sender },
  recipient: { id: IG },
  timestamp: NOW.getTime() - 1000,
  message: { mid, attachments: [{ type, payload: { url, ...more } }] },
})
const tap = (mid: string, id: string, brand: string, title = brand) =>
  dm(mid, title, SENDER, { quick_reply: { payload: `cap:${id}:${brand}` } })

describe('Instagram capture', () => {
  it('gives the Inbox’s id for Meta’s, and reads a post’s address in one form', () => {
    const [b] = batchesOf(
      { object: 'instagram', entry: [{ id: IG, messaging: [dm('mid-9', 'Hi')] }] },
      NOW.getTime(),
    )
    expect(b!.items[0]!.id).toBe(idOf('mid-9'))
    expect(permalinkIn('see https://instagram.com/reels/DAbc123xyz?igsh=1')).toBe(PERMALINK)
    expect(permalinkIn('https://www.instagram.com/p/C9/')).toBe('https://www.instagram.com/p/C9/')
    expect(permalinkIn('https://evil.example/reel/x/')).toBeNull()
  })

  it('shows the capture account’s handle, and has no code to make any more', async () => {
    const t = await setUp()
    expect((await t.request('GET', '/capture')).data).toEqual({ handle: 'casavostra' })
    expect((await t.app.request('/capture/code', { method: 'POST' })).status).toBe(404)
  })

  it('asks which brand of its company, copies the reel, and saves it to the brand tapped as added by the sender', async () => {
    const t = await setUp()
    t.state.message = { shares: { data: [{ link: PERMALINK }] } }
    await t.deliver(share('mid-s1'))
    const [ask] = dms(t.graph)
    expect(ask!.text).toBe(SAY.pick)
    expect(ask!.quick_replies!.map((q) => q.title)).toEqual(['Casa Vostra', 'Osteria'])
    const id = idOf('mid-s1')
    expect(ask!.quick_replies![1]!.payload).toBe(`cap:${id}:osteria`)
    expect(t.media).toEqual([
      { url: 'https://storage.test/put', method: 'PUT', bytes: VIDEO.length },
    ])
    expect(await t.pasted()).toEqual([])
    // Meta sends the share again: no second question.
    await t.deliver(share('mid-s1'))
    expect(dms(t.graph)).toHaveLength(1)

    await t.deliver(tap('mid-tap', id, 'osteria', 'Osteria'))
    expect(dms(t.graph).at(-1)!.text).toBe(SAY.saved('Osteria'))
    // The DM read brings the same tap again, as text: it stays out of the Inbox.
    await t.deliver(dm('mid-tap', 'Osteria'))
    const [saved] = await t.pasted()
    expect(saved).toMatchObject({
      id,
      brand_id: 'osteria',
      reference: {
        platform: 'ig',
        account: '@ana.cooks',
        addedBy: '@ana.cooks',
        link: PERMALINK,
        image: '',
        seed: { format: 'reel' },
      },
    })
    expect(saved!.reference.video).toMatch(
      /^https:\/\/core\.test\/files\/[A-Za-z0-9_-]{43}\/brandbase\/[0-9a-f-]{36}\.mp4$/,
    )
    expect(await t.inbox()).toEqual([])

    // The next share offers Osteria first, and a typed brand name picks it as a tap does.
    t.graph.length = 0
    await t.deliver(share('mid-s2'))
    expect(dms(t.graph)[0]!.quick_replies![0]!.title).toBe('Osteria')
    await t.deliver(dm('mid-typed', 'casa vostra'))
    expect((await t.pasted()).map((p) => p.brand_id).sort()).toEqual(['casa', 'osteria'])
    expect(await t.inbox()).toEqual([])
  })

  it('finds the post’s address in the payload, in the media id, or opens our copy', async () => {
    const t = await setUp()
    const linkOf = async (mid: string) => {
      await t.deliver(tap(`${mid}-tap`, idOf(mid), 'casa'))
      return (await t.pasted()).find((p) => p.id === idOf(mid))!.reference.link
    }
    // (a) The payload's URL is the post's address: nothing to copy from it, so it does not save.
    await t.deliver(share('mid-a', SENDER, 'share', PERMALINK))
    expect(dms(t.graph).at(-1)!.text).toBe(SAY.failed)
    // (c) A media id our account may see.
    t.state.permalink = 'https://www.instagram.com/p/C9xyz/'
    await t.deliver(share('mid-c', SENDER, 'ig_post', REEL, { id: '1790001' }))
    expect(await linkOf('mid-c')).toBe('https://www.instagram.com/p/C9xyz/')
    // (d) Nothing found: the tile opens our copy.
    t.state.permalink = null
    await t.deliver(share('mid-d'))
    expect(await linkOf('mid-d')).toMatch(/^https:\/\/core\.test\/files\//)
  })

  it('saves at once when the principal reaches one brand', async () => {
    const t = await setUp()
    await t.db.query("update brandbase.brands set org_id = 'co-b' where id = 'osteria'")
    await t.deliver(share('mid-one', SENDER, 'ig_post'))
    expect(dms(t.graph).map((d) => d.text)).toEqual([SAY.saved('Casa Vostra')])
    expect((await t.pasted()).map((p) => p.brand_id)).toEqual(['casa'])
  })

  it('captures only the senders META_CAPTURE_SENDERS names, and leaves the rest to the Inbox with no reply', async () => {
    const t = await setUp({ captureSenders: ['@Ana.Cooks'] })
    t.state.people['7001'] = { name: 'Guest', username: 'guest' }
    await t.deliver(share('mid-x', '7001'))
    await t.deliver(share('mid-y', '7002'))
    expect(dms(t.graph)).toEqual([])
    expect(t.media).toEqual([])
    expect((await t.inbox()).map((m) => m.id).sort()).toEqual([idOf('mid-x'), idOf('mid-y')].sort())
    await t.deliver(share('mid-ana'))
    expect(dms(t.graph).map((d) => d.text)).toEqual([SAY.pick])
  })

  it('saves a share whose sender’s name does not read as from Instagram, and ignores another sender’s tap', async () => {
    const t = await setUp()
    await t.deliver(share('mid-n', '7003'))
    const id = idOf('mid-n')
    // Another sender taps a button of this question: nothing is saved, and it is not the Inbox's.
    await t.deliver(tap('mid-other', id, 'casa'))
    expect(await t.pasted()).toEqual([])
    await t.deliver({ ...tap('mid-own', id, 'casa'), sender: { id: '7003' } })
    expect(await t.pasted()).toMatchObject([
      { id, brand_id: 'casa', reference: { account: 'Instagram', addedBy: null } },
    ])
  })

  it('leaves a text DM to the Inbox', async () => {
    const t = await setUp()
    await t.deliver(dm('mid-t', 'Are you open on Sunday?'))
    expect((await t.inbox()).map((m) => m.id)).toEqual([idOf('mid-t')])
    expect(dms(t.graph)).toEqual([])
  })

  it('forgets a capture whose message was deleted on Instagram', async () => {
    const t = await setUp()
    await t.deliver(share('mid-s1'))
    await t.deliver(tap('mid-tap', idOf('mid-s1'), 'casa'))
    expect(await t.pasted()).toHaveLength(1)
    await t.deliver({
      sender: { id: SENDER },
      recipient: { id: IG },
      message: { mid: 'mid-s1', is_deleted: true },
    })
    expect(await t.pasted()).toEqual([])
    expect(await t.db.query('select id from brandbase.captures')).toEqual([])
  })

  it('says the post did not save when Meta’s media is not one we take, or too large', async () => {
    const t = await setUp()
    t.state.mediaType = 'text/html'
    await t.deliver(share('mid-bad'))
    expect(dms(t.graph).map((d) => d.text)).toEqual([SAY.pick, SAY.failed])
    t.state.mediaType = 'video/mp4'
    t.state.mediaLength = 200 * 1024 * 1024
    await t.deliver(share('mid-big'))
    expect(dms(t.graph).at(-1)!.text).toBe(SAY.failed)
    await t.deliver(share('mid-far', SENDER, 'share', 'https://evil.example/x.mp4'))
    expect(dms(t.graph).at(-1)!.text).toBe(SAY.failed)
    expect(t.media).toEqual([])
  })

  it('is off without META_CAPTURE_BRAND: a share is the Inbox’s', async () => {
    const t = await setUp({ captureBrand: undefined })
    expect((await t.request('GET', '/capture')).data).toEqual({ handle: null })
    await t.deliver(share('mid-x'))
    expect(await t.inbox()).toHaveLength(1)
    expect(dms(t.graph)).toEqual([])
  })
})

describe('the regular reads', () => {
  const conversation = (messages: unknown[], updated = NOW.toISOString()) => ({
    updated_time: updated,
    messages: { data: messages },
  })
  const message = (id: string, text: string, from = '9001', at = NOW.getTime() - 5000) => ({
    id,
    created_time: new Date(at).toISOString(),
    from: { id: from, username: 'guest' },
    message: text,
  })

  it('turns a conversation message into the webhook’s shape', () => {
    expect(
      messagingOf(
        {
          id: 'm1',
          created_time: '2026-10-06T03:59:00+0000',
          from: { id: '9001' },
          message: 'Hi',
          shares: { data: [{ link: CDN }] },
        },
        IG,
      ),
    ).toEqual({
      sender: { id: '9001' },
      recipient: { id: IG },
      timestamp: Date.parse('2026-10-06T03:59:00Z'),
      message: { mid: 'm1', text: 'Hi', attachments: [{ type: 'share', payload: { url: CDN } }] },
    })
  })

  it('reads new DMs into the Inbox once, with the webhook’s ids, and skips the account’s own and older ones', async () => {
    const t = await setUp({ captureBrand: undefined })
    const poll = metaPoll(t.core, t.meta, t.handler.handle, { as: AGENT, dms: true })
    t.state.conversations = [
      conversation([
        message('mid-p1', 'Table for two?'),
        message('mid-own', 'Yes!', IG),
        message('mid-old', 'Before the link', '9001', NOW.getTime() - 2 * 60 * 60 * 1000),
      ]),
    ]
    await poll.dms()
    expect((await t.inbox()).map((m) => m.text)).toEqual(['Table for two?'])
    await poll.dms()
    expect(await t.inbox()).toHaveLength(1)
    // The same message by webhook later changes nothing.
    await t.deliver(dm('mid-p1', 'Table for two?', '9001'))
    expect(await t.inbox()).toHaveLength(1)
    const reads = t.graph.filter((g) => g.path === `/${PAGE}/conversations`)
    expect(reads.map((r) => r.params.platform).sort()).toEqual([
      'instagram',
      'instagram',
      'messenger',
      'messenger',
    ])
  })

  it('reads nothing with META_POLL_DMS off', async () => {
    const t = await setUp()
    const poll = metaPoll(t.core, t.meta, t.handler.handle, { as: AGENT, dms: false })
    await poll.dms()
    expect(t.graph).toEqual([])
  })

  it('takes a share by the DM read too, through the capture, and asks which brand', async () => {
    const t = await setUp()
    const poll = metaPoll(t.core, t.meta, t.handler.handle, { as: AGENT, dms: true })
    t.state.conversations = [
      conversation([{ ...message('mid-pl', '', SENDER), shares: { data: [{ link: CDN }] } }]),
    ]
    await poll.dms()
    await t.handler.capture.idle()
    expect(dms(t.graph).map((d) => d.text)).toContain(SAY.pick)
    expect(await t.inbox()).toEqual([])
  })

  it('reads new Instagram comments into the Inbox once, without the brand’s own or older ones', async () => {
    const t = await setUp({ captureBrand: undefined })
    const poll = metaPoll(t.core, t.meta, t.handler.handle, { as: AGENT, dms: false })
    const comment = (id: string, text: string, username = 'guest', at = NOW.getTime() - 5000) => ({
      id,
      text,
      username,
      timestamp: new Date(at).toISOString(),
      from: { id: username === 'casavostra' ? IG : '9002', username },
    })
    t.state.posts = [
      {
        id: '1790',
        comments: {
          data: [
            comment('c1', 'Love it'),
            comment('c2', 'Thanks!', 'casavostra'),
            comment('c3', 'Old', 'guest', NOW.getTime() - 3 * 60 * 60 * 1000),
          ],
        },
      },
    ]
    await poll.comments()
    await poll.comments()
    const rows = await t.db.query<{ id: string; text: string; external: Record<string, string> }>(
      'select id, text, external from brandbase.inbox_messages',
    )
    expect(rows).toEqual([
      { id: idOf('c1'), text: 'Love it', external: { comment: 'c1', post: '1790' } },
    ])
    expect(t.graph.filter((g) => g.path === `/${IG}/media`)).toHaveLength(2)
  })
})
