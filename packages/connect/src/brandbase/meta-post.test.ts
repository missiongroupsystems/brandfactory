import { type Files } from '@brandfactory/core/src/files'
import { tick } from '@brandfactory/core/src/scheduler'
import { describe, expect, it } from 'vitest'
import { type MakeApp, type Payload, socialConnector } from './make'
import { metaApp } from './meta'
import { metaSender, sendThroughMeta } from './meta-post'
import { addPrincipal, setLoadout } from '@brandfactory/core/src/registry'
import { serve } from './test-core'

const SIG = 'A'.repeat(43)
const JPG = 'brandbase/00000000-0000-4000-8000-0000000000a1.jpg'
const JPG2 = 'brandbase/00000000-0000-4000-8000-0000000000a2.jpg'
const MP4 = 'brandbase/00000000-0000-4000-8000-0000000000b1.mp4'
const IG = '17841400000000001'
const PAGE = '100000000000001'
const TOKEN = 'page-token'

const files: Files = {
  secret: 'x'.repeat(32),
  publicUrl: 'https://core.test',
  store: {
    signedWriteUrl: async () => ({ url: 'https://storage.test/put', headers: {} }),
    signedReadUrl: async (key, ttl) => `https://storage.test/${key}?ttl=${ttl}`,
  },
}

/**
 * A stand-in for the Graph API's publishing calls. Each call is kept with its parameters; `status`
 * is what a container's status_code answers (in turn, then the last one for ever), and `fail` makes
 * one path answer an error (`{ code }`) or throw as a lost answer (`'lost'`). Any other request
 * fails the test, so nothing reaches the network.
 */
function fakeGraph() {
  const calls: { method: string; path: string; params: Record<string, string> }[] = []
  const state = {
    status: ['FINISHED'] as string[],
    /** What a Page video's status answers, in turn, then the last one for ever. */
    video: [{ video_status: 'ready', publishing_phase: { status: 'complete' } }] as unknown[],
    fail: {} as Record<string, { code: number; message?: string; transient?: boolean } | 'lost'>,
    n: 0,
  }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (url.hostname === 'rupload.facebook.com') {
      const h = new Headers(init?.headers)
      calls.push({
        method,
        path: `rupload${url.pathname}`,
        params: { auth: h.get('authorization')!, file_url: h.get('file_url')! },
      })
      return json({ success: true })
    }
    const params = Object.fromEntries(
      method === 'POST' ? new URLSearchParams(String(init?.body)) : url.searchParams,
    )
    const path = url.pathname.replace('/v26.0', '')
    calls.push({ method, path, params })
    expect(params.access_token).toBe(TOKEN)
    expect(params.appsecret_proof).toMatch(/^[0-9a-f]{64}$/)
    const failing = state.fail[`${method} ${path}`]
    if (failing === 'lost') throw new TypeError('fetch failed')
    if (failing) {
      return json(
        {
          error: {
            message: failing.message ?? 'refused',
            code: failing.code,
            is_transient: failing.transient ?? false,
          },
        },
        400,
      )
    }
    const id = () => `${++state.n}`
    if (path === `/${IG}/media`) return json({ id: `c${id()}` })
    if (/^\/c\d+$/.test(path)) {
      return json({ status_code: state.status.length > 1 ? state.status.shift() : state.status[0] })
    }
    if (path === `/${IG}/media_publish`) return json({ id: `1790${id()}` })
    if (/^\/1790\d+$/.test(path)) {
      return json({ permalink: `https://www.instagram.com/p/${path.slice(1)}/` })
    }
    if (path === `/${PAGE}/photos`) return json({ id: `ph${id()}`, post_id: `${PAGE}_${state.n}` })
    if (path === `/${PAGE}/feed`) return json({ id: `${PAGE}_feed${id()}` })
    if (path === `/${PAGE}/photo_stories`) return json({ success: true, post_id: `story${id()}` })
    if (path === `/${PAGE}/video_reels` || path === `/${PAGE}/video_stories`) {
      if (params.upload_phase === 'start') {
        return json({
          video_id: 'v9',
          upload_url: 'https://rupload.facebook.com/video-upload/v26.0/v9',
        })
      }
      return path.endsWith('reels')
        ? json({ success: true })
        : json({ success: true, post_id: 's9' })
    }
    if (path === '/v9') {
      return json({ status: state.video.length > 1 ? state.video.shift() : state.video[0] })
    }
    if (path.startsWith(`/${PAGE}_`)) {
      return json({ permalink_url: `https://www.facebook.com/${path.slice(1)}` })
    }
    throw new Error(`unexpected request ${method} ${url}`)
  }
  const app = metaApp({
    appId: 'app-id',
    appSecret: 'app-secret',
    configId: 'c',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 7),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, state }
}

const src = (key: string, video = false) =>
  `https://core.test/files/${SIG}/${key}${video ? '#video' : ''}`

/** casa with its Page and Instagram account linked through Meta, and its files. */
async function setUp(make?: MakeApp) {
  const graph = fakeGraph()
  const t = await serve({ meta: graph.app, make }, undefined, files)
  const sealed = (platform: string, id: string) =>
    graph.app.sealToken(TOKEN, `${platform}:casa:${id}`)
  await t.db.query(
    `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
      ('casa', 'facebook', $1, 'Casa Vostra', $3, '{"via": "meta"}', 'owner'),
      ('casa', 'instagram', $2, 'casavostra', $4, '{"via": "meta"}', 'owner')`,
    [PAGE, IG, sealed('facebook', PAGE), sealed('instagram', IG)],
  )
  await t.db.exec(
    `insert into brandbase.connections (brand_id, key, status) values ('casa', 'ig', 'connected'), ('casa', 'fb', 'connected')
       on conflict (brand_id, key) do update set status = 'connected'`,
  )
  await t.db.exec(`
    insert into brandbase.media (id, brand_id, storage_key, kind, mime, bytes) values
      ('m1', 'casa', '${JPG}', 'photo', 'image/jpeg', 2000),
      ('m2', 'casa', '${JPG2}', 'photo', 'image/jpeg', 2000),
      ('m4', 'casa', '${MP4}', 'video', 'video/mp4', 9000);
  `)
  t.core.connectors = {
    social: socialConnector({
      make,
      meta: metaSender(t.core, graph.app, files.store.signedReadUrl),
      signedReadUrl: files.store.signedReadUrl,
    }),
  }
  return { ...t, graph }
}

type T = Awaited<ReturnType<typeof setUp>>

/** A post on casa's calendar for 8 Oct at 18:00, sent to `channels` with a person's yes. */
async function planned(
  t: T,
  id: string,
  format: 'carousel' | 'reel' | 'story',
  media: string[],
  channels: string[],
) {
  const made = await t.call(
    'POST',
    '/ops/brandbase/post.create_draft',
    {
      brand: 'casa',
      id,
      format,
      hook: id,
      day: '2026-10-08',
      time: '18:00',
      caption: 'Fresh pasta tonight.',
      channels,
    },
    'owner',
  )
  expect(made.status).toBe(200)
  const items = media.map((m) => ({
    src: src(m, m.endsWith('.mp4')),
    kind: m.endsWith('.mp4') ? 'video' : 'photo',
  }))
  await t.db.query(`update brandbase.posts set media = $2 where id = $1`, [
    id,
    JSON.stringify(items),
  ])
  const sent = await t.call(
    'POST',
    '/ops/brandbase/post.schedule',
    { brand: 'casa', id, when: 'slot', channels },
    'owner',
  )
  expect(sent.status).toBe(200)
}

/** Runs the jobs due at 8 Oct 18:00 in Singapore. */
async function due(t: T) {
  t.setNow(new Date('2026-10-08T10:00:00Z'))
  await tick(t.core)
  return t.db.query<{
    id: string
    status: string
    error: string | null
    external_id: string | null
    permalink: string | null
  }>('select id, status, error, external_id, permalink from brandbase.post_jobs order by id')
}

const posted = (t: T) => t.graph.calls.map((c) => `${c.method} ${c.path}`)

describe('posting through our own Meta app', () => {
  it('posts an Instagram carousel and a Facebook Page post with the Page token, each live with its id and link', async () => {
    const t = await setUp()
    await planned(t, 'p1', 'carousel', [JPG, JPG2], ['ig', 'fb'])
    expect(await due(t)).toEqual([
      {
        id: 'p1:fb',
        status: 'live',
        error: null,
        external_id: expect.stringMatching(/^100000000000001_feed/),
        permalink: expect.stringMatching(/^https:\/\/www\.facebook\.com\//),
      },
      {
        id: 'p1:ig',
        status: 'live',
        error: null,
        external_id: expect.stringMatching(/^1790/),
        permalink: expect.stringMatching(/^https:\/\/www\.instagram\.com\/p\//),
      },
    ])
    const ig = t.graph.calls.filter((c) => c.path.startsWith(`/${IG}`))
    expect(ig.map((c) => c.params.media_type ?? c.params.is_carousel_item ?? 'publish')).toEqual([
      'true',
      'true',
      'CAROUSEL',
      'publish',
    ])
    expect(ig[0]!.params.image_url).toBe(`https://storage.test/${JPG}?ttl=7200`)
    expect(ig[2]!.params.caption).toBe('Fresh pasta tonight.')
    // Facebook: each photo unpublished, then one post with both.
    const fb = t.graph.calls.filter((c) => c.path.startsWith(`/${PAGE}/`))
    expect(fb.map((c) => [c.path, c.params.published])).toEqual([
      [`/${PAGE}/photos`, 'false'],
      [`/${PAGE}/photos`, 'false'],
      [`/${PAGE}/feed`, undefined],
    ])
    const attached = [0, 1].map((i) => JSON.parse(fb[2]!.params[`attached_media[${i}]`]!))
    expect(attached[0]).toEqual({ media_fbid: expect.stringMatching(/^ph\d+$/) })
    expect(attached[1]).not.toEqual(attached[0])
  })

  it('posts a story to Instagram and to the Page, which Make cannot', async () => {
    const t = await setUp()
    await planned(t, 's1', 'story', [JPG], ['ig', 'fb'])
    const jobs = await due(t)
    expect(jobs.map((j) => [j.id, j.status, j.error])).toEqual([
      ['s1:fb', 'live', null],
      ['s1:ig', 'live', null],
    ])
    expect(jobs[0]!.external_id).toMatch(/^story/)
    const story = t.graph.calls.find((c) => c.path === `/${IG}/media`)!
    expect(story.params).toMatchObject({ media_type: 'STORIES' })
    expect(story.params.caption).toBeUndefined()
    expect(posted(t)).toContain(`POST /${PAGE}/photo_stories`)
  })

  it('posts a Reel to Instagram once Instagram has processed it, and to the Page through an upload session', async () => {
    const t = await setUp()
    t.graph.state.status = ['FINISHED']
    await planned(t, 'r1', 'reel', [MP4], ['ig', 'fb'])
    const jobs = await due(t)
    expect(jobs.map((j) => [j.id, j.status, j.external_id])).toEqual([
      ['r1:fb', 'live', 'v9'],
      ['r1:ig', 'live', expect.stringMatching(/^1790/)],
    ])
    const reel = t.graph.calls.find((c) => c.path === `/${IG}/media`)!
    expect(reel.params).toMatchObject({
      media_type: 'REELS',
      video_url: `https://storage.test/${MP4}?ttl=7200`,
      share_to_feed: 'true',
    })
    const upload = t.graph.calls.find((c) => c.path.startsWith('rupload'))!
    expect(upload.params).toEqual({
      auth: `OAuth ${TOKEN}`,
      file_url: `https://storage.test/${MP4}?ttl=7200`,
    })
    const finish = t.graph.calls.filter((c) => c.path === `/${PAGE}/video_reels`)[1]!
    expect(finish.params).toMatchObject({
      upload_phase: 'finish',
      video_state: 'PUBLISHED',
      description: 'Fresh pasta tonight.',
    })
  })

  it('sends an account linked through Make to Make, with Meta on the server too', async () => {
    const seen: string[] = []
    const make: MakeApp = {
      url: 'https://hook.make.test/x',
      secret: 'k',
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        seen.push(String(init?.body))
        return new Response(JSON.stringify({ ok: true, id: '555' }))
      }) as typeof fetch,
    }
    const t = await setUp(make)
    await t.db.exec(
      `update brandbase.accounts set tokens = 'make', details = '{}' where platform = 'instagram'`,
    )
    await planned(t, 'p1', 'carousel', [JPG], ['ig'])
    expect((await due(t)).map((j) => [j.id, j.status, j.external_id])).toEqual([
      ['p1:ig', 'live', '555'],
    ])
    expect(seen).toHaveLength(1)
    expect(t.graph.calls).toEqual([])
  })
})

describe('what a send through Meta answers when it does not post', () => {
  const job = (over: Partial<Payload> = {}): Payload => ({
    brand: 'casa',
    job: 'p:ig',
    post: 'p',
    channel: 'ig',
    format: 'carousel',
    text: 'Hi',
    media: [{ kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG }],
    account: IG,
    shareToFeed: true,
    via: 'meta',
    ...over,
  })
  const send = (g: ReturnType<typeof fakeGraph>, p: Payload, clock?: { at: number }) =>
    sendThroughMeta(
      {
        meta: g.app,
        token: TOKEN,
        sign: async (key) => `https://storage.test/${key}`,
        ...(clock && {
          now: () => clock.at,
          sleep: async (ms: number) => {
            clock.at += ms
          },
        }),
      },
      p,
    ).then(
      (ok) => ({ ok }),
      (err: Error & { sent?: unknown }) => ({ sent: err.sent, message: err.message }),
    )

  it('refuses before Meta what Meta would refuse, and keeps Meta’s words for its own refusals', async () => {
    const g = fakeGraph()
    expect(
      await send(g, job({ media: [{ kind: 'photo', mime: 'image/png', bytes: 1, key: 'x.png' }] })),
    ).toEqual({ sent: false, message: 'Instagram takes JPEG photos only.' })
    expect(
      await send(
        g,
        job({
          format: 'story',
          media: [
            { kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG },
            { kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG2 },
          ],
        }),
      ),
    ).toEqual({ sent: false, message: 'A story takes one photo or video.' })
    expect(g.calls).toEqual([])
    g.state.fail[`POST /${IG}/media`] = {
      code: 9004,
      message: 'Only photo or video can be accepted as media type. https://storage.test/x',
    }
    expect(await send(g, job())).toEqual({
      sent: false,
      message: 'Instagram: Only photo or video can be accepted as media type. (the file)',
    })
  })

  it('says to connect again when the token is dead, before anything is published', async () => {
    const g = fakeGraph()
    g.state.fail[`POST /${IG}/media`] = { code: 190 }
    expect(await send(g, job())).toEqual({
      sent: false,
      message: 'Connect Instagram again on Connections, then retry.',
    })
  })

  it('says it may have posted when the publish call’s answer is lost or unclear, and not when Meta refused it', async () => {
    for (const [fail, sent] of [
      ['lost', 'maybe'],
      [{ code: 2, message: 'Service temporarily unavailable' }, 'maybe'],
      [{ code: -1, message: 'Instagram server error. Try again' }, 'maybe'],
      [{ code: -2, message: 'Timeout' }, 'maybe'],
      [{ code: 9007, message: 'busy', transient: true }, 'maybe'],
      [{ code: 9, message: 'Application request limit reached' }, false],
    ] as const) {
      const g = fakeGraph()
      g.state.fail[`POST /${IG}/media_publish`] = fail
      expect(((await send(g, job())) as { sent?: unknown }).sent).toBe(sent)
    }
    // A lost answer before the publish call: nothing went out.
    const g = fakeGraph()
    g.state.fail[`POST /${IG}/media`] = 'lost'
    expect(await send(g, job())).toEqual({
      sent: false,
      message: 'Instagram did not answer. Nothing was posted. Try again.',
    })
  })

  it('waits while Instagram processes a video, and gives up before publishing when it takes too long', async () => {
    const reel = job({
      format: 'reel',
      media: [{ kind: 'video', mime: 'video/mp4', bytes: 1, key: MP4 }],
    })
    const g = fakeGraph()
    g.state.status = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED']
    const clock = { at: 0 }
    expect(await send(g, reel, clock)).toMatchObject({ ok: { externalId: expect.any(String) } })
    expect(clock.at).toBe(10_000)

    const slow = fakeGraph()
    slow.state.status = ['IN_PROGRESS']
    expect(await send(slow, reel, { at: 0 })).toEqual({
      sent: false,
      message: 'Instagram took too long to process the video. Nothing was posted. Try again.',
    })
    expect(slow.calls.some((c) => c.path.endsWith('media_publish'))).toBe(false)

    const broken = fakeGraph()
    broken.state.status = ['ERROR']
    expect(await send(broken, reel, { at: 0 })).toEqual({
      sent: false,
      message: 'Instagram could not process this video. Check its format and length.',
    })
  })

  it('waits for a Page Reel to go live, and says what became of one Meta could not process or is still processing', async () => {
    const reel = job({
      channel: 'fb',
      account: PAGE,
      format: 'reel',
      media: [{ kind: 'video', mime: 'video/mp4', bytes: 1, key: MP4 }],
    })
    const g = fakeGraph()
    g.state.video = [
      { video_status: 'processing', publishing_phase: { status: 'in_progress' } },
      { video_status: 'ready', publishing_phase: { status: 'complete' } },
    ]
    expect(await send(g, reel, { at: 0 })).toEqual({ ok: { externalId: 'v9' } })

    const broken = fakeGraph()
    broken.state.video = [
      {
        video_status: 'processing',
        processing_phase: { error: { message: 'Resolution too low.' } },
      },
    ]
    expect(await send(broken, reel, { at: 0 })).toEqual({
      sent: 'maybe',
      message:
        'Facebook could not process this video: Resolution too low. Check the Page before you retry.',
    })

    const slow = fakeGraph()
    slow.state.video = [{ video_status: 'processing', publishing_phase: { status: 'in_progress' } }]
    expect(await send(slow, reel, { at: 0 })).toMatchObject({ sent: 'maybe' })
  })

  it('sends nothing when the files took so long that the publish could outlast the core’s limit', async () => {
    const reel = job({
      format: 'reel',
      media: [{ kind: 'video', mime: 'video/mp4', bytes: 1, key: MP4 }],
    })
    const g = fakeGraph()
    // Each status read takes 60 s: the publish would start past its time.
    const clock = { at: 0 }
    const graph = g.app.graph
    const slowRead = {
      ...g.app,
      graph: (async (path: string, params: Record<string, string>, method?: 'GET' | 'POST') => {
        if (params.fields === 'status_code') clock.at += 60_000
        return graph(path, params, method)
      }) as typeof graph,
    }
    // FINISHED arrives at 190 s: the wait asked in time, too late for the publish.
    g.state.status = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED']
    const got = await sendThroughMeta(
      {
        meta: slowRead,
        token: TOKEN,
        sign: async (key) => `https://storage.test/${key}`,
        now: () => clock.at,
        sleep: async (ms) => {
          clock.at += ms
        },
      },
      reel,
    ).catch((err: Error & { sent?: unknown }) => ({ sent: err.sent, message: err.message }))
    expect(got).toEqual({
      sent: false,
      message: 'Instagram took too long to take the files. Nothing was posted. Try again.',
    })
    expect(g.calls.some((c) => c.path.endsWith('media_publish'))).toBe(false)
  })

  it('ends Meta’s fetch of a Page video by the time the publish must start', async () => {
    const reel = job({
      channel: 'fb',
      account: PAGE,
      format: 'reel',
      media: [{ kind: 'video', mime: 'video/mp4', bytes: 1, key: MP4 }],
    })
    const g = fakeGraph()
    const clock = { at: 0 }
    const limits: number[] = []
    const upload = g.app.upload
    const meta = {
      ...g.app,
      upload: async (url: string, token: string, file: string, timeoutMs?: number) => {
        limits.push(timeoutMs!)
        return upload(url, token, file, timeoutMs)
      },
      graph: (async (path: string, params: Record<string, string>, method?: 'GET' | 'POST') => {
        // The session's start takes 100 s.
        if (params.upload_phase === 'start') clock.at += 100_000
        return g.app.graph(path, params, method)
      }) as typeof g.app.graph,
    }
    await sendThroughMeta(
      {
        meta,
        token: TOKEN,
        sign: async (key) => `https://storage.test/${key}`,
        now: () => clock.at,
        sleep: async (ms) => {
          clock.at += ms
        },
      },
      reel,
    )
    expect(limits).toEqual([65_000])
  })

  it('starts no status read once the wait is over, so none outlasts the core’s limit', async () => {
    const g = fakeGraph()
    const clock = { at: 0 }
    const graph = g.app.graph
    const reads: number[] = []
    const meta = {
      ...g.app,
      graph: (async (path: string, params: Record<string, string>, method?: 'GET' | 'POST') => {
        // The first carousel child takes until 160 s.
        if (method === 'POST' && params.is_carousel_item) clock.at = Math.max(clock.at, 160_000)
        if (params.fields === 'status_code') reads.push(clock.at)
        return graph(path, params, method)
      }) as typeof graph,
    }
    const got = await sendThroughMeta(
      {
        meta,
        token: TOKEN,
        sign: async (key) => `https://storage.test/${key}`,
        now: () => clock.at,
        sleep: async (ms) => {
          clock.at += ms
        },
      },
      job({
        media: [
          { kind: 'video', mime: 'video/mp4', bytes: 1, key: MP4 },
          { kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG },
        ],
      }),
    ).catch((err: Error & { sent?: unknown }) => ({ sent: err.sent }))
    expect(got).toEqual({ sent: false })
    expect(reads).toEqual([])
  })

  it('reads the account as the agent a job runs for, within the agent’s moves', async () => {
    const t = await setUp()
    await addPrincipal(t.db, 'owner/bot', 'owner')
    const send = metaSender(t.core, t.graph.app, files.store.signedReadUrl)
    const p = job({ media: [{ kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG }] })
    // Without `account.read` in its loadout, nothing is sent, in words.
    await setLoadout(t.db, 'owner/bot', 'brandbase', ['post.publish_job'])
    await expect(send(p, 'owner/bot')).rejects.toMatchObject({ sent: false })
    expect(t.graph.calls).toEqual([])
    await setLoadout(t.db, 'owner/bot', 'brandbase', ['post.publish_job', 'account.read'])
    expect(await send(p, 'owner/bot')).toMatchObject({ externalId: expect.stringMatching(/^1790/) })
  })

  it('refuses a job for an account linked through Meta while the server has no Meta app', async () => {
    const send = socialConnector({ signedReadUrl: files.store.signedReadUrl }).send
    await expect(
      send({ pack: 'brandbase', op: 'post.publish_job', payload: job(), principal: 'owner' }),
    ).rejects.toMatchObject({
      sent: false,
      message: 'Instagram is not set up on this server. Connect it again.',
    })
  })
})
