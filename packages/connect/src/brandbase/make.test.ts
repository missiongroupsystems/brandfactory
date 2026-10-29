import { type Files } from '@brandfactory/core/src/files'
import { tick } from '@brandfactory/core/src/scheduler'
import { describe, expect, it } from 'vitest'
import { platformsFromEnv } from './env'
import { type MakeApp, type MakeRequest, socialConnector } from './make'
import { serve } from './test-core'

const SIG = 'A'.repeat(43)
const JPG = 'brandbase/00000000-0000-4000-8000-0000000000a1.jpg'
const JPG2 = 'brandbase/00000000-0000-4000-8000-0000000000a2.jpg'
const PNG = 'brandbase/00000000-0000-4000-8000-0000000000a3.png'
const MP4 = 'brandbase/00000000-0000-4000-8000-0000000000b1.mp4'
const IG_ID = '17841400000000001'
const PAGE_ID = '100000000000001'

/**
 * A stand-in for the Make webhook: it keeps each request with its key, and answers with `reply`
 * (a JSON body, a status and text, or a thrown error). Nothing reaches the network.
 */
function fakeMake() {
  const seen: { key: string | null; body: MakeRequest }[] = []
  const state = {
    reply: { ok: true, id: '17890000000000001' } as unknown,
    status: 200,
    text: null as string | null,
    throws: null as Error | null,
  }
  const app: MakeApp = {
    url: 'https://hook.eu1.make.test/abc',
    secret: 'make-key',
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://hook.eu1.make.test/abc')
      // The key never follows a redirect to another address.
      expect(init?.redirect).toBe('manual')
      seen.push({
        key: new Headers(init?.headers).get('x-make-apikey'),
        body: JSON.parse(String(init?.body)) as MakeRequest,
      })
      if (state.throws) throw state.throws
      return new Response(state.text ?? JSON.stringify(state.reply), { status: state.status })
    }) as typeof fetch,
  }
  return { app, seen, state }
}

const files: Files = {
  secret: 'x'.repeat(32),
  publicUrl: 'https://core.test',
  store: {
    signedWriteUrl: async () => ({ url: 'https://storage.test/put', headers: {} }),
    signedReadUrl: async (key, ttl) => `https://storage.test/${key}?ttl=${ttl}`,
  },
}

const src = (key: string, video = false) =>
  `https://core.test/files/${SIG}/${key}${video ? '#video' : ''}`

/** casa's files, and a post of each shape, all planned for 8 Oct at 18:00. */
async function setUp(given: MakeApp | null = fakeMake().app) {
  const make = given ?? undefined
  const t = await serve({ make }, undefined, files)
  await t.db.exec(`
    insert into brandbase.media (id, brand_id, storage_key, kind, mime, bytes) values
      ('m1', 'casa', '${JPG}', 'photo', 'image/jpeg', 2000),
      ('m2', 'casa', '${JPG2}', 'photo', 'image/jpeg', 2000),
      ('m3', 'casa', '${PNG}', 'photo', 'image/png', 2000),
      ('m4', 'casa', '${MP4}', 'video', 'video/mp4', 9000);
  `)
  t.core.connectors = {
    social: socialConnector({ make, signedReadUrl: files.store.signedReadUrl }),
  }
  return t
}

type T = Awaited<ReturnType<typeof setUp>>

/** A post on casa's calendar, sent to `channels` at its slot with a person's yes. */
async function planned(
  t: T,
  id: string,
  format: 'carousel' | 'reel' | 'story',
  media: string[],
  channels: string[],
  caption = 'Fresh pasta tonight. https://casa.test/menu',
) {
  const items = media.map((m) => ({
    src: m.endsWith('.mp4') ? src(m, true) : m.startsWith('brandbase/') ? src(m) : m,
    kind: m.endsWith('.mp4') ? 'video' : 'photo',
  }))
  const made = await t.call(
    'POST',
    '/ops/brandbase/post.create_draft',
    { brand: 'casa', id, format, hook: id, day: '2026-10-08', time: '18:00', caption, channels },
    'owner',
  )
  expect(made.status).toBe(200)
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

/** Runs the due jobs at 8 Oct 18:00 in Singapore, and answers each job's status and error. */
async function due(t: T) {
  t.setNow(new Date('2026-10-08T10:00:00Z'))
  await tick(t.core)
  return t.db.query<{ id: string; status: string; error: string | null; external_id: string }>(
    'select id, status, error, external_id from brandbase.post_jobs order by id',
  )
}

const link = (t: T, platform: string, accountId: string, name: string, token = 'owner') =>
  t.call('PUT', `/brands/casa/make/${platform}`, { accountId, name }, token)

describe('Instagram and Facebook through Make', () => {
  it('says they are set up only with both Make settings, and refuses one alone', async () => {
    expect(platformsFromEnv({}).make).toBeUndefined()
    expect(
      platformsFromEnv({
        MAKE_WEBHOOK_URL: 'https://hook.eu1.make.com/x',
        MAKE_WEBHOOK_SECRET: 'k',
      }).make,
    ).toEqual({ url: 'https://hook.eu1.make.com/x', secret: 'k' })
    expect(() => platformsFromEnv({ MAKE_WEBHOOK_URL: 'https://hook.eu1.make.com/x' })).toThrow(
      'MAKE_WEBHOOK_SECRET',
    )
    expect(() =>
      platformsFromEnv({ MAKE_WEBHOOK_URL: 'http://hook.test/x', MAKE_WEBHOOK_SECRET: 'k' }),
    ).toThrow('https')
    const on = await setUp()
    expect((await on.call('GET', '/platforms')).data).toMatchObject({
      instagram: true,
      facebook: true,
    })
    const off = await setUp(null)
    expect((await off.call('GET', '/platforms')).data).toMatchObject({
      instagram: false,
      facebook: false,
    })
    expect(await link(off, 'instagram', IG_ID, '@casavostra')).toMatchObject({ status: 503 })
  })

  it('lets an owner link the brand’s accounts by id and name, and no one else', async () => {
    const t = await setUp()
    expect(await link(t, 'instagram', IG_ID, '@casavostra', 'member')).toMatchObject({
      status: 403,
      data: { code: 'FORBIDDEN' },
    })
    expect(await link(t, 'instagram', 'not-a-number', '@casavostra')).toMatchObject({
      status: 400,
    })
    expect(await link(t, 'instagram', IG_ID, '  ')).toMatchObject({ status: 400 })
    expect(await link(t, 'threads', IG_ID, '@casavostra')).toMatchObject({ status: 404 })
    expect((await link(t, 'instagram', IG_ID, ' @casavostra ')).status).toBe(200)
    expect((await link(t, 'facebook', PAGE_ID, 'Casa Vostra')).status).toBe(200)
    expect(await t.stateOf('casa')).toMatchObject({
      instagram: { name: '@casavostra', accountId: IG_ID },
      facebook: { name: 'Casa Vostra', accountId: PAGE_ID },
    })
    // Another brand cannot take the same account, and is not told whose it is.
    const taken = await t.call(
      'PUT',
      '/brands/osteria/make/instagram',
      {
        accountId: IG_ID,
        name: 'x',
      },
      'owner',
    )
    expect(taken).toMatchObject({ status: 409, data: { code: 'ACCOUNT_TAKEN' } })
    expect(JSON.stringify(taken.data)).not.toContain('casa')
    // An admin of a company off the operator's list (make_orgs) links nothing: Make's login
    // reaches Pages that are not theirs.
    expect(
      await t.call(
        'PUT',
        '/brands/temper/make/facebook',
        { accountId: '100000000000009', name: 'x' },
        'both',
      ),
    ).toMatchObject({ status: 403, data: { code: 'FORBIDDEN' } })
    // Someone outside the company does not learn the brand exists.
    expect(
      await t.call('PUT', '/brands/temper/make/facebook', { accountId: PAGE_ID, name: 'x' }),
    ).toMatchObject({ status: 404 })
    expect(
      (await t.call('DELETE', '/brands/casa/make/instagram', undefined, 'member')).status,
    ).toBe(403)
    expect((await t.call('DELETE', '/brands/casa/make/instagram', undefined, 'owner')).status).toBe(
      204,
    )
    expect((await t.stateOf('casa')).instagram).toBeNull()
  })

  it('posts a due Instagram photo through Make with the key, the account and a signed link', async () => {
    const make = fakeMake()
    make.state.reply = { ok: true, id: '1789', permalink: 'https://www.instagram.com/p/abc/' }
    const t = await setUp(make.app)
    await link(t, 'instagram', IG_ID, '@casavostra')
    await planned(t, 'p1', 'carousel', [JPG], ['ig'])
    expect(make.seen).toHaveLength(0)
    expect(await due(t)).toEqual([
      { id: 'p1:ig', status: 'live', error: null, external_id: '1789' },
    ])
    expect(make.seen).toEqual([
      {
        key: 'make-key',
        body: {
          v: 1,
          postId: 'p1',
          job: 'p1:ig',
          platform: 'instagram',
          format: 'photo',
          accountId: IG_ID,
          pageId: null,
          caption: 'Fresh pasta tonight. https://casa.test/menu',
          shareToFeed: true,
          media: [{ type: 'IMAGE', url: `https://storage.test/${JPG}?ttl=7200` }],
        },
      },
    ])
    const [post] = await t.db.query<{ permalink: string }>(
      `select permalink from brandbase.posts where id = 'p1'`,
    )
    expect(post!.permalink).toBe('https://www.instagram.com/p/abc/')
  })

  it('sends a carousel, a reel and a Facebook Page post in the shapes the scenario routes', async () => {
    const make = fakeMake()
    const t = await setUp(make.app)
    await link(t, 'instagram', IG_ID, '@casavostra')
    await link(t, 'facebook', PAGE_ID, 'Casa Vostra')
    await planned(t, 'c1', 'carousel', [JPG, MP4], ['ig'])
    await planned(t, 'r1', 'reel', [MP4], ['ig', 'fb'])
    await planned(t, 'f1', 'carousel', [JPG, JPG2], ['fb'])
    expect((await due(t)).map((j) => j.status)).toEqual(['live', 'live', 'live', 'live'])
    const shapes = make.seen
      .map(({ body: b }) => ({
        job: b.job,
        platform: b.platform,
        format: b.format,
        accountId: b.accountId,
        pageId: b.pageId,
        types: b.media.map((m) => m.type).join(','),
      }))
      .sort((a, b) => a.job.localeCompare(b.job))
    expect(shapes).toEqual([
      {
        job: 'c1:ig',
        platform: 'instagram',
        format: 'carousel',
        accountId: IG_ID,
        pageId: null,
        types: 'IMAGE,VIDEO',
      },
      {
        job: 'f1:fb',
        platform: 'facebook',
        format: 'carousel',
        accountId: null,
        pageId: PAGE_ID,
        types: 'IMAGE,IMAGE',
      },
      {
        job: 'r1:fb',
        platform: 'facebook',
        format: 'reel',
        accountId: null,
        pageId: PAGE_ID,
        types: 'VIDEO',
      },
      {
        job: 'r1:ig',
        platform: 'instagram',
        format: 'reel',
        accountId: IG_ID,
        pageId: null,
        types: 'VIDEO',
      },
    ])
  })

  it('refuses in words, before Make, what Make’s modules cannot post', async () => {
    const make = fakeMake()
    const t = await setUp(make.app)
    await link(t, 'instagram', IG_ID, '@casavostra')
    await link(t, 'facebook', PAGE_ID, 'Casa Vostra')
    await planned(t, 'png', 'carousel', [PNG], ['ig'])
    await planned(t, 'vid', 'carousel', [MP4], ['ig'])
    await planned(t, 'fbv', 'carousel', [JPG, MP4], ['fb'])
    await planned(t, 'smp', 'carousel', [JPG, '/photos/sample.jpg'], ['ig'])
    await planned(t, 'sty', 'story', [JPG], ['ig'])
    const jobs = await due(t)
    expect(Object.fromEntries(jobs.map((j) => [j.id, [j.status, j.error]]))).toEqual({
      'fbv:fb': ['failed', 'A Facebook post takes photos only: put the video in a Reel.'],
      'png:ig': ['failed', 'Instagram takes JPEG photos only.'],
      'smp:ig': ['failed', 'Upload this post’s photos and videos again: some are only samples.'],
      'sty:ig': ['failed', 'Stories are not available yet.'],
      'vid:ig': ['failed', 'Instagram posts a single video as a Reel: make it a Reel.'],
    })
    expect(make.seen).toHaveLength(0)
  })

  it('refuses a job with no account linked, and every account but Instagram and Facebook', async () => {
    const send = socialConnector({
      make: fakeMake().app,
      signedReadUrl: files.store.signedReadUrl,
    }).send
    const job = (channel: string, account: string | null) => ({
      pack: 'brandbase',
      op: 'post.publish_job',
      payload: {
        brand: 'casa',
        job: `p:${channel}`,
        post: 'p',
        channel,
        format: 'carousel',
        text: 'Hi',
        media: [{ kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG }],
        account,
        shareToFeed: true,
      },
    })
    await expect(send(job('ig', null))).rejects.toMatchObject({
      sent: false,
      message: 'Connect Instagram first.',
    })
    await expect(send(job('tt', null))).rejects.toMatchObject({
      sent: false,
      message: 'Brand Base does not post to TikTok yet.',
    })
    await expect(send(job('li', null))).rejects.toMatchObject({ sent: false })
    // Without Make, nothing goes out and nothing is marked posted.
    const off = socialConnector({ signedReadUrl: files.store.signedReadUrl }).send
    await expect(off(job('ig', IG_ID))).rejects.toMatchObject({
      sent: false,
      message: 'Instagram is not set up.',
    })
  })

  it('reads Make’s answer: refused, not run, or unknown, each in words', async () => {
    const make = fakeMake()
    const send = socialConnector({ make: make.app, signedReadUrl: files.store.signedReadUrl }).send
    const job = {
      pack: 'brandbase',
      op: 'post.publish_job',
      payload: {
        brand: 'casa',
        job: 'p:ig',
        post: 'p',
        channel: 'ig',
        format: 'carousel',
        text: 'Hi',
        media: [{ kind: 'photo', mime: 'image/jpeg', bytes: 1, key: JPG }],
        account: IG_ID,
        shareToFeed: true,
      },
    }
    const answer = async (set: Partial<typeof make.state>) => {
      Object.assign(make.state, { status: 200, text: null, throws: null }, set)
      return send(job).then(
        (ok) => ({ ok }),
        (err: Error & { sent?: unknown }) => ({ sent: err.sent, message: err.message }),
      )
    }
    expect(await answer({ reply: { ok: true, id: 1789 } })).toEqual({
      ok: { externalId: '1789' },
    })
    expect(
      await answer({
        reply: { ok: false, error: 'The image could not be fetched: https://storage.test/x?t=1' },
      }),
    ).toEqual({ sent: false, message: 'Instagram: The image could not be fetched: (the file)' })
    expect(await answer({ status: 401, text: 'Unauthorized' })).toMatchObject({ sent: false })
    expect(await answer({ status: 410, text: 'Gone' })).toMatchObject({ sent: false })
    expect(await answer({ status: 400, text: 'Queue is full.' })).toEqual({
      sent: false,
      message: 'Make refused the request. Check the scenario in Make.',
    })
    expect(await answer({ status: 307, text: '' })).toMatchObject({ sent: false })
    // An id past 2^53 sent as a number has lost digits: the post is out, its id is not kept.
    expect(await answer({ text: '{"ok": true, "id": 17890000000000001}' })).toEqual({
      ok: { externalId: null },
    })
    const unknown = 'Instagram may have posted it. Check the account before you retry.'
    expect(await answer({ text: 'Accepted' })).toEqual({
      sent: 'maybe',
      message:
        'Make took too long to answer. Instagram may still post it in a few minutes. Check the account before you retry.',
    })
    expect(await answer({ status: 500, text: 'Scenario failed to complete.' })).toEqual({
      sent: 'maybe',
      message: `The Make scenario stopped. ${unknown}`,
    })
    expect(await answer({ reply: { ok: 'yes', id: '1' } })).toMatchObject({ sent: 'maybe' })
    // Posted, with no id to keep.
    expect(await answer({ reply: { ok: true } })).toEqual({ ok: { externalId: null } })
    expect(
      await answer({
        throws: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      }),
    ).toEqual({ sent: false, message: 'Brand Base could not reach Make.' })
    expect(
      await answer({
        throws: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      }),
    ).toEqual({ sent: 'maybe', message: `Make did not answer. ${unknown}` })
  })

  it('fails a job Make refused with its words, and one it may have posted with a check-first line', async () => {
    const make = fakeMake()
    const t = await setUp(make.app)
    await link(t, 'instagram', IG_ID, '@casavostra')
    await planned(t, 'p1', 'carousel', [JPG], ['ig'])
    await planned(t, 'p2', 'carousel', [JPG2], ['ig'])
    let n = 0
    const fetchOf = make.app.fetch!
    make.app.fetch = (async (url: string, init?: RequestInit) => {
      Object.assign(
        make.state,
        n++ === 0
          ? { text: null, reply: { ok: false, error: 'Media ID is not available' } }
          : { text: 'Accepted' },
      )
      return fetchOf(url, init)
    }) as typeof fetch
    const jobs = await due(t)
    expect(jobs.map((j) => [j.status, j.error])).toEqual([
      ['failed', 'Instagram: Media ID is not available'],
      [
        'failed',
        'Make took too long to answer. Instagram may still post it in a few minutes. Check the account before you retry.',
      ],
    ])
  })
})
