import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { brandAccounts, media, postJobs, type posts } from '../db/schema'
import { runDueJobs, sendJob, type JobRow, PublishError } from '../jobs'
import { metaApp } from '../meta'
import { NOW, testApp } from '../test-helpers'
import { tiktokApp } from '../tiktok'
import { platformPublisher } from '.'

/** The stored file's bytes: each byte says where it sits, so a misplaced piece shows. */
const pattern = (from: number, n: number) =>
  Uint8Array.from({ length: n }, (_, i) => (from + i) % 251)

/** A video above one chunk: 25 MB goes as a 10 MB chunk and a 15 MB last chunk. */
const BIG = 25 * 1024 * 1024
let clock = 0

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

interface Call {
  method: string
  path: string
  params: Record<string, string>
  body?: unknown
  headers?: Record<string, string>
}

/**
 * Stand-ins for the Graph API and TikTok that record every request. Instagram's containers say
 * IN_PROGRESS once before FINISHED, so the publisher has to wait for them. Any request they do not
 * know fails the test.
 */
function fakes() {
  const calls: Call[] = []
  let nextId = 0
  const polled = new Set<string>()
  const graphAnswers: Record<string, () => Response> = {}
  const tiktokAnswers: Record<string, () => Response> = {}
  const uploads = { active: 0, most: 0, bodies: [] as Uint8Array[] }
  let creatorPrivacy = ['SELF_ONLY']
  let tiktokStatus = 'PUBLISH_COMPLETE'

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (url.host === 'graph.facebook.com') {
      const path = url.pathname.replace('/v26.0', '')
      const params = Object.fromEntries(
        method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body)),
      )
      calls.push({ method, path, params })
      if (graphAnswers[path]) return graphAnswers[path]()
      if (path.endsWith('/media')) return json({ id: `container-${++nextId}` })
      if (path.startsWith('/container-') && method === 'GET') {
        // Each container is still processing the first time it is asked about.
        const first = !polled.has(path)
        polled.add(path)
        return json({ status_code: first ? 'IN_PROGRESS' : 'FINISHED' })
      }
      if (path.endsWith('/media_publish')) return json({ id: `ig-media-${++nextId}` })
      if (path.endsWith('/comments')) return json({ id: `comment-${++nextId}` })
      if (path.endsWith('/photos')) {
        return json({ id: `photo-${++nextId}`, post_id: `page_photo-post-${nextId}` })
      }
      if (path.endsWith('/feed')) return json({ id: `page_feed-post-${++nextId}` })
      if (path.endsWith('/videos')) return json({ id: `video-${++nextId}` })
    }
    if (url.host === 'open.tiktokapis.com') {
      const path = url.pathname.replace('/v2', '')
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method, path, params: {}, body })
      if (tiktokAnswers[path]) return tiktokAnswers[path]()
      if (path === '/post/publish/creator_info/query/') {
        return json({ data: { privacy_level_options: creatorPrivacy }, error: { code: 'ok' } })
      }
      if (path.endsWith('/video/init/')) {
        return json({
          data: { publish_id: 'pub-1', upload_url: 'https://upload.tiktok.test/u1' },
          error: { code: 'ok' },
        })
      }
      if (path === '/post/publish/status/fetch/') {
        return json({ data: { status: tiktokStatus }, error: { code: 'ok' } })
      }
    }
    if (url.host === 'storage.test') {
      if (!url.pathname.includes('big')) return new Response(new Uint8Array(1000))
      // The big file streams in odd-sized pieces that cross the chunk boundaries.
      let sent = 0
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            if (sent >= BIG) return c.close()
            const n = Math.min(3_333_331, BIG - sent)
            c.enqueue(pattern(sent, n))
            sent += n
          },
        }),
      )
    }
    if (url.host === 'upload.tiktok.test') {
      uploads.active++
      uploads.most = Math.max(uploads.most, uploads.active)
      await new Promise((r) => setTimeout(r, 5))
      uploads.active--
      uploads.bodies.push(init?.body as Uint8Array)
      calls.push({
        method,
        path: 'upload',
        params: {},
        headers: Object.fromEntries(new Headers(init?.headers)),
      })
      return new Response(null, { status: 201 })
    }
    throw new Error(`unexpected request ${method} ${url}`)
  }
  const key = Buffer.alloc(32, 5)
  const meta = metaApp({
    appId: 'a',
    appSecret: 's',
    configId: 'c',
    redirectUrl: 'https://x.test/connect/meta',
    masterKey: key,
    fetch: fetch as typeof globalThis.fetch,
  })
  const tiktok = tiktokApp({
    clientKey: 'k',
    clientSecret: 's',
    redirectUrl: 'https://x.test/connect/tiktok',
    masterKey: key,
    fetch: fetch as typeof globalThis.fetch,
  })
  return {
    meta,
    tiktok,
    calls,
    graphAnswers,
    tiktokAnswers,
    uploads,
    allowPrivacy: (o: string[]) => (creatorPrivacy = o),
    tiktokEndsAt: (s: string) => (tiktokStatus = s),
  }
}

async function setUp() {
  const f = fakes()
  const t = await testApp()
  await t.db.insert(brandAccounts).values([
    {
      brandId: 'casa',
      platform: 'meta',
      accountId: 'page-1',
      username: 'Casa Vostra',
      tokens: f.meta.sealTokens({ pageToken: 'PAGE' }, 'meta:casa:page-1'),
      details: { igUserId: 'ig-1', igUsername: 'casavostra' },
    },
    {
      brandId: 'casa',
      platform: 'tiktok',
      accountId: 'tt-1',
      username: 'Casa Vostra',
      tokens: f.tiktok.sealTokens(
        { access: 'TT', refresh: 'R', expiresAt: NOW.getTime() + 86_400_000 },
        'tiktok:casa:tt-1',
      ),
    },
  ])
  await t.db.insert(media).values([
    { id: 'm-jpg', brandId: 'casa', storageKey: 'casa/a.jpg', kind: 'photo', mime: 'image/jpeg' },
    { id: 'm-jpg2', brandId: 'casa', storageKey: 'casa/b.jpg', kind: 'photo', mime: 'image/jpeg' },
    { id: 'm-png', brandId: 'casa', storageKey: 'casa/c.png', kind: 'photo', mime: 'image/png' },
    {
      id: 'm-mp4',
      brandId: 'casa',
      storageKey: 'casa/d.mp4',
      kind: 'video',
      mime: 'video/mp4',
      bytes: 1000,
    },
    {
      id: 'm-big',
      brandId: 'casa',
      storageKey: 'casa/big.mp4',
      kind: 'video',
      mime: 'video/mp4',
      bytes: BIG,
    },
    {
      id: 'm-avi',
      brandId: 'casa',
      storageKey: 'casa/e.avi',
      kind: 'video',
      mime: 'video/x-msvideo',
    },
  ])
  const publisher = platformPublisher({
    db: t.db,
    storage: {
      async signedWriteUrl() {
        return { url: '', headers: {} }
      },
      async signedReadUrl(key) {
        return `https://storage.test/read/${key}`
      },
    },
    now: () => NOW,
    meta: f.meta,
    tiktok: f.tiktok,
    // Each job's budget starts at its own start: 50 ticks of a clock that moves one per look.
    wait: () => {
      const start = clock
      return { sleep: async () => {}, everyMs: 1, until: start + 50, clock: () => (clock += 1) }
    },
  })
  return { ...t, ...f, publisher }
}

type Post = typeof posts.$inferSelect

function postOf(over: Partial<Post> & { mediaIds?: string[] }): Post {
  const { mediaIds = ['m-jpg'], ...rest } = over
  return {
    id: 'p1',
    brandId: 'casa',
    format: 'carousel',
    hook: 'Pasta night',
    day: '2026-10-08',
    time: '18:00',
    caption: 'Fresh pasta tonight.',
    channels: [],
    media: mediaIds.map((id) => ({ src: `/media/${id}`, kind: 'photo', mediaId: id })),
    draft: {},
    fromIdea: null,
    marked: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...rest,
  }
}

const job = (channel: string) => ({ id: 'j1', brandId: 'casa', channel }) as JobRow

type S = Awaited<ReturnType<typeof setUp>>
const send = (s: S, channel: string, post: Post) =>
  s.publisher.publish({ job: job(channel), post, brand: {} as never })
const graph = (s: S) => s.calls.filter((c) => c.path !== 'upload')

describe('posting to Instagram', () => {
  it('posts a photo with its caption and collaborators, then the first comment', async () => {
    const s = await setUp()
    const out = await send(
      s,
      'ig',
      // The composer keeps handles with their "@"; Instagram wants the usernames alone.
      postOf({ draft: { details: { comment: 'Book now', collab: ['@chef.ana', '@temper.sg'] } } }),
    )
    expect(out.externalId).toMatch(/^ig-media-/)
    const made = graph(s).find((c) => c.path === '/ig-1/media')
    const published = graph(s).find((c) => c.path === '/ig-1/media_publish')
    const comment = graph(s).find((c) => c.path.endsWith('/comments'))
    // The container is published only once Instagram says it is ready.
    expect(
      graph(s)
        .map((c) => c.path)
        .indexOf('/ig-1/media_publish'),
    ).toBeGreaterThan(
      graph(s)
        .map((c) => c.path)
        .lastIndexOf('/container-1'),
    )
    expect(made).toMatchObject({
      method: 'POST',
      path: '/ig-1/media',
      params: {
        image_url: 'https://storage.test/read/casa/a.jpg',
        caption: 'Fresh pasta tonight.',
        collaborators: '["chef.ana","temper.sg"]',
        access_token: 'PAGE',
      },
    })
    expect(published).toMatchObject({
      path: '/ig-1/media_publish',
      params: { creation_id: 'container-1' },
    })
    expect(comment).toMatchObject({
      path: `/${out.externalId}/comments`,
      params: { message: 'Book now' },
    })
  })

  it('posts a reel once Instagram has processed it, and a carousel of mixed items', async () => {
    const s = await setUp()
    await send(s, 'ig', postOf({ format: 'reel', mediaIds: ['m-mp4'] }))
    expect(graph(s)[0]!.params).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://storage.test/read/casa/d.mp4',
      share_to_feed: 'true',
    })
    // Asked about until FINISHED: published only after the second look.
    expect(graph(s).filter((c) => c.path === '/container-1' && c.method === 'GET')).toHaveLength(2)

    s.calls.length = 0
    await send(s, 'ig', postOf({ mediaIds: ['m-jpg', 'm-mp4'] }))
    const items = graph(s).filter((c) => c.params.is_carousel_item === 'true')
    expect(items.map((c) => c.params.media_type ?? 'IMAGE')).toEqual(['IMAGE', 'VIDEO'])
    const carousel = graph(s).find((c) => c.params.media_type === 'CAROUSEL')!
    expect(carousel.params.children!.split(',')).toHaveLength(2)
    expect(carousel.params.caption).toBe('Fresh pasta tonight.')
  })

  it('posts each story frame on its own, with no caption', async () => {
    const s = await setUp()
    const out = await send(s, 'ig', postOf({ format: 'story', mediaIds: ['m-jpg', 'm-jpg2'] }))
    expect(out.externalId.split(',')).toHaveLength(2)
    const made = graph(s).filter((c) => c.path === '/ig-1/media')
    expect(made.map((c) => c.params.media_type)).toEqual(['STORIES', 'STORIES'])
    expect(made.every((c) => c.params.caption === undefined)).toBe(true)
  })

  it('refuses a PNG, a sample picture, a failed video, and a dead token, in words', async () => {
    const s = await setUp()
    await expect(send(s, 'ig', postOf({ mediaIds: ['m-png'] }))).rejects.toThrow(/JPEG/)
    const sample = postOf({})
    sample.media = [{ src: '/demo/pins/a.jpg', kind: 'photo' }]
    await expect(send(s, 'ig', sample)).rejects.toThrow(/samples/)
    s.graphAnswers['/container-1'] = () => json({ status_code: 'ERROR' })
    await expect(send(s, 'ig', postOf({ format: 'reel', mediaIds: ['m-mp4'] }))).rejects.toThrow(
      /could not process/,
    )
    s.graphAnswers['/ig-1/media'] = () => json({ error: { message: 'expired', code: 190 } })
    await expect(send(s, 'ig', postOf({}))).rejects.toThrow('Reconnect Instagram first.')
  })

  it("keeps Meta's own words when it refuses", async () => {
    const s = await setUp()
    s.graphAnswers['/ig-1/media'] = () =>
      json({
        error: { message: 'x', code: 9004, error_user_msg: 'The image could not be fetched.' },
      })
    const err = await send(s, 'ig', postOf({})).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PublishError)
    expect((err as Error).message).toBe('Instagram: The image could not be fetched.')
  })
})

describe('posting to a Facebook Page', () => {
  it('posts one photo, several photos as one post, and a video', async () => {
    const s = await setUp()
    const one = await send(s, 'fb', postOf({ draft: { details: { comment: 'Hi' } } }))
    expect(graph(s)[0]).toMatchObject({
      path: '/page-1/photos',
      params: { url: 'https://storage.test/read/casa/a.jpg', caption: 'Fresh pasta tonight.' },
    })
    expect(graph(s)[1]).toMatchObject({ path: `/${one.externalId}/comments` })

    s.calls.length = 0
    await send(s, 'fb', postOf({ mediaIds: ['m-jpg', 'm-jpg2'] }))
    const uploads = graph(s).filter((c) => c.path === '/page-1/photos')
    expect(uploads.map((c) => c.params.published)).toEqual(['false', 'false'])
    const feed = graph(s).find((c) => c.path === '/page-1/feed')!
    expect(JSON.parse(feed.params['attached_media[1]']!)).toHaveProperty('media_fbid')
    expect(feed.params.message).toBe('Fresh pasta tonight.')

    s.calls.length = 0
    await send(s, 'fb', postOf({ format: 'reel', mediaIds: ['m-mp4'] }))
    expect(graph(s)[0]).toMatchObject({
      path: '/page-1/videos',
      params: {
        file_url: 'https://storage.test/read/casa/d.mp4',
        description: 'Fresh pasta tonight.',
      },
    })
  })

  it('refuses a story and a carousel with a video, before calling Facebook', async () => {
    const s = await setUp()
    await expect(send(s, 'fb', postOf({ format: 'story' }))).rejects.toThrow(/stories/)
    await expect(send(s, 'fb', postOf({ mediaIds: ['m-jpg', 'm-mp4'] }))).rejects.toThrow(
      /photos only/,
    )
    expect(graph(s)).toEqual([])
  })
})

describe('posting to TikTok', () => {
  const reel = (draft: Record<string, unknown>) =>
    postOf({ format: 'reel', mediaIds: ['m-mp4'], draft })
  const answers = {
    privacy: 'Only me',
    interactions: { comments: true, duet: false, stitch: false },
    promo: { on: true, own: true, paid: false },
  }

  it('posts with the answers given, uploading the file from storage', async () => {
    const s = await setUp()
    const out = await send(s, 'tt', reel(answers))
    expect(out.externalId).toBe('pub-1')
    const init = s.calls.find((c) => c.path === '/post/publish/video/init/')!
    expect(init.body).toEqual({
      post_info: {
        title: 'Fresh pasta tonight.',
        privacy_level: 'SELF_ONLY',
        disable_comment: false,
        disable_duet: true,
        disable_stitch: true,
        brand_content_toggle: false,
        brand_organic_toggle: true,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 1000,
        chunk_size: 1000,
        total_chunk_count: 1,
      },
    })
    const upload = s.calls.find((c) => c.path === 'upload')!
    expect(upload.headers).toMatchObject({
      'content-range': 'bytes 0-999/1000',
      'content-type': 'video/mp4',
    })
  })

  it('refuses a privacy the account does not offer yet, naming what it does', async () => {
    const s = await setUp()
    await expect(send(s, 'tt', reel({ ...answers, privacy: 'Everyone' }))).rejects.toThrow(
      /posts can be “Only me”/,
    )
    expect(s.calls.some((c) => c.path.endsWith('/video/init/'))).toBe(false)
    s.allowPrivacy(['PUBLIC_TO_EVERYONE', 'SELF_ONLY'])
    await expect(send(s, 'tt', reel({ ...answers, privacy: 'Everyone' }))).resolves.toBeTruthy()
  })

  it('sends to the inbox when the sound is picked in TikTok, and refuses photos', async () => {
    const s = await setUp()
    s.tiktokEndsAt('SEND_TO_USER_INBOX')
    await send(s, 'tt', reel({ ...answers, privacy: null, extra: { ttSound: 'library' } }))
    const init = s.calls.find((c) => c.path === '/post/publish/inbox/video/init/')!
    expect(init.body).not.toHaveProperty('post_info')
    expect(s.calls.some((c) => c.path === '/post/publish/creator_info/query/')).toBe(false)
    await expect(send(s, 'tt', postOf({}))).rejects.toThrow(/one video/)
  })

  it('fails with TikTok’s reason when it does not post', async () => {
    const s = await setUp()
    s.tiktokEndsAt('FAILED')
    await expect(send(s, 'tt', reel(answers))).rejects.toThrow(/TikTok did not post it/)
  })
})

describe('the runner with the real publisher', () => {
  it('posts a due job, keeps the platform id, and fails another account alone with its reason', async () => {
    const s = await setUp()
    await s.call('POST', '/brands/casa/posts', {
      id: 'p1',
      format: 'reel',
      hook: 'Pasta night',
      day: '2026-10-08',
      time: '18:00',
      caption: 'Fresh pasta tonight.',
      media: [{ src: '/media/m-mp4', kind: 'video', mediaId: 'm-mp4' }],
      draft: { privacy: 'Everyone', promo: { on: false } },
    })
    const sent = await s.call('POST', '/brands/casa/posts/p1/send', {
      when: 'slot',
      channels: ['ig', 'tt'],
    })
    expect(sent.status).toBe(200)
    await runDueJobs({
      db: s.db,
      now: () => new Date('2026-10-08T10:00:00Z'),
      publisher: s.publisher,
    })
    const jobs = await s.db.select().from(postJobs).where(eq(postJobs.postId, 'p1'))
    const ig = jobs.find((j) => j.channel === 'ig')!
    const tt = jobs.find((j) => j.channel === 'tt')!
    expect(ig).toMatchObject({ status: 'live', error: null })
    expect(ig.externalId).toMatch(/^ig-media-/)
    // "Everyone" is not offered before TikTok's audit: that account fails, in words.
    expect(tt.status).toBe('failed')
    expect(tt.error).toMatch(/Only me/)
  })
})

describe('a failure after the post may exist', () => {
  const lost = () => {
    throw new TypeError('fetch failed')
  }

  it('says to check Instagram when the publish call gets no answer, and keeps a stated refusal', async () => {
    const s = await setUp()
    s.graphAnswers['/ig-1/media_publish'] = lost
    await expect(send(s, 'ig', postOf({}))).rejects.toThrow(
      'Instagram may have posted it. Check the account before you retry.',
    )
    // Meta's "temporarily unavailable" proves nothing either.
    s.graphAnswers['/ig-1/media_publish'] = () =>
      json({ error: { message: 'Service temporarily unavailable', code: 2 } })
    await expect(send(s, 'ig', postOf({}))).rejects.toThrow(/may have posted/)
    // A refusal Meta stated means nothing went out: its words, no warning.
    s.graphAnswers['/ig-1/media_publish'] = () =>
      json({ error: { message: 'Media ID is not available', code: 9007 } })
    await expect(send(s, 'ig', postOf({}))).rejects.toThrow('Instagram: Media ID is not available')
  })

  it('says to check Instagram when Meta answers yes with no id', async () => {
    const s = await setUp()
    s.graphAnswers['/ig-1/media_publish'] = () => json({})
    await expect(send(s, 'ig', postOf({}))).rejects.toThrow(/may have posted/)
  })

  it('names the story frames already out when a later one fails', async () => {
    const s = await setUp()
    let published = 0
    s.graphAnswers['/ig-1/media_publish'] = () =>
      ++published === 1
        ? json({ id: 'frame-1' })
        : json({ error: { message: 'The media is not ready', code: 9007 } })
    await expect(
      send(s, 'ig', postOf({ format: 'story', mediaIds: ['m-jpg', 'm-jpg2'] })),
    ).rejects.toThrow(/posted 1 of 2 story frames.*Check the account before you retry/)
  })

  it('never says nothing was posted once a story frame is out', async () => {
    const s = await setUp()
    // The budget runs out after the first frame is published.
    s.graphAnswers['/ig-1/media_publish'] = () => {
      clock += 1000
      return json({ id: 'frame-1' })
    }
    const err = (await send(
      s,
      'ig',
      postOf({ format: 'story', mediaIds: ['m-jpg', 'm-jpg2', 'm-jpg'] }),
    ).catch((e: unknown) => e)) as Error
    expect(err.message).toMatch(/posted 1 of 3 story frames/)
    expect(err.message).not.toMatch(/Nothing was posted/)
    expect(err.message).toMatch(/Check the account before you retry\.$/)
  })

  it('says to check Facebook when the post call gets no answer', async () => {
    const s = await setUp()
    s.graphAnswers['/page-1/feed'] = lost
    await expect(send(s, 'fb', postOf({ mediaIds: ['m-jpg', 'm-jpg2'] }))).rejects.toThrow(
      'Facebook may have posted it. Check the account before you retry.',
    )
  })

  it('says to check TikTok when the status check fails or runs out after the upload', async () => {
    const s = await setUp()
    const reel = postOf({ format: 'reel', mediaIds: ['m-mp4'], draft: { privacy: 'Only me' } })
    s.tiktokAnswers['/post/publish/status/fetch/'] = () =>
      json({ error: { code: 'rate_limit_exceeded', message: 'too many' } }, 429)
    await expect(send(s, 'tt', reel)).rejects.toThrow(
      'TikTok may have posted it. Check the account before you retry.',
    )
    delete s.tiktokAnswers['/post/publish/status/fetch/']
    s.tiktokEndsAt('PROCESSING_UPLOAD')
    await expect(send(s, 'tt', reel)).rejects.toThrow(
      'TikTok took too long. Check the account before you retry.',
    )
  })

  it('never puts a signed storage link in the words a person reads', async () => {
    const s = await setUp()
    s.graphAnswers['/ig-1/media'] = () =>
      json({
        error: {
          message: 'x',
          code: 9004,
          error_user_msg: 'Could not fetch https://storage.test/read/casa/a.jpg?token=SECRET',
        },
      })
    const err = (await send(s, 'ig', postOf({})).catch((e: unknown) => e)) as Error
    expect(err.message).toBe('Instagram: Could not fetch (the file)')
  })
})

describe('TikTok uploads', () => {
  const reel = (mediaId: string, draft: Record<string, unknown> = { privacy: 'Only me' }) =>
    postOf({ format: 'reel', mediaIds: [mediaId], draft })

  it('stream a large video in 10 MB chunks, the last taking the rest', async () => {
    const s = await setUp()
    await send(s, 'tt', reel('m-big'))
    const init = s.calls.find((c) => c.path === '/post/publish/video/init/')!
    expect((init.body as { source_info: unknown }).source_info).toEqual({
      source: 'FILE_UPLOAD',
      video_size: BIG,
      chunk_size: 10 * 1024 * 1024,
      total_chunk_count: 2,
    })
    // Exactly the stored bytes, in order, whatever pieces storage sent them in.
    const [first, second] = s.uploads.bodies
    expect(first!.byteLength + second!.byteLength).toBe(BIG)
    expect(Buffer.from(first!).equals(Buffer.from(pattern(0, first!.byteLength)))).toBe(true)
    expect(
      Buffer.from(second!).equals(Buffer.from(pattern(first!.byteLength, second!.byteLength))),
    ).toBe(true)
    const ranges = s.calls
      .filter((c) => c.path === 'upload')
      .map((c) => c.headers!['content-range'])
    expect(ranges).toEqual([`bytes 0-10485759/${BIG}`, `bytes 10485760-${BIG - 1}/${BIG}`])
  })

  it('run at most two at once, however many jobs are due', async () => {
    const s = await setUp()
    await Promise.all([1, 2, 3, 4].map(() => send(s, 'tt', reel('m-mp4'))))
    expect(s.uploads.bodies).toHaveLength(4)
    expect(s.uploads.most).toBe(2)
  })

  it('accept an inbox post the creator already published, and refuse a type TikTok does not take', async () => {
    const s = await setUp()
    // Still PUBLISH_COMPLETE from the start: the creator posted the draft before the first look.
    await expect(
      send(s, 'tt', reel('m-mp4', { extra: { ttSound: 'library' } })),
    ).resolves.toBeTruthy()
    await expect(send(s, 'tt', reel('m-avi'))).rejects.toThrow(/MP4, MOV or WebM/)
  })
})

describe('the runner', () => {
  it('does not post a job an hour past its time, and says nothing was posted', async () => {
    const s = await setUp()
    await s.call('POST', '/brands/casa/posts', {
      id: 'p1',
      format: 'carousel',
      hook: 'Pasta night',
      day: '2026-10-08',
      time: '18:00',
      caption: 'Fresh pasta tonight.',
      media: [{ src: '/media/m-jpg', kind: 'photo', mediaId: 'm-jpg' }],
      draft: {},
    })
    await s.call('POST', '/brands/casa/posts/p1/send', { when: 'slot', channels: ['ig'] })
    // Due at 10:00 UTC; the runner first looks at 11:30, after posting was off.
    await runDueJobs({
      db: s.db,
      now: () => new Date('2026-10-08T11:30:00Z'),
      publisher: s.publisher,
    })
    const [job] = await s.db.select().from(postJobs)
    expect(job).toMatchObject({ status: 'failed' })
    expect(job!.error).toMatch(/missed its time. Nothing was posted/)
    expect(s.calls).toEqual([])
  })

  it('does not overwrite a job the stuck sweep already failed', async () => {
    const s = await setUp()
    await s.call('POST', '/brands/casa/posts', {
      id: 'p1',
      format: 'carousel',
      hook: 'Pasta night',
      day: '2026-10-08',
      time: '18:00',
      caption: 'Fresh pasta tonight.',
      media: [{ src: '/media/m-jpg', kind: 'photo', mediaId: 'm-jpg' }],
      draft: {},
    })
    await s.call('POST', '/brands/casa/posts/p1/send', { when: 'slot', channels: ['ig'] })
    const [job] = await s.db.select().from(postJobs)
    // Swept while it was on its way: the person has been told to check the account.
    await s.db.update(postJobs).set({ status: 'failed', error: 'Interrupted.' })
    await sendJob({ db: s.db, now: () => NOW, publisher: s.publisher }, job!)
    const [after] = await s.db.select().from(postJobs)
    expect(after).toMatchObject({ status: 'failed', error: 'Interrupted.' })
  })
})
