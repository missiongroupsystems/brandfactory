import { describe, expect, it } from 'vitest'
import { metaApp } from './meta'
import { serve } from './test-core'

const IG = '17841400000000001'
const PAGE = '100000000000001'
const TOKEN = 'page-token'

/**
 * A stand-in for the Graph API's reads: the Instagram account's media and their views, and the
 * Page's posts. `dead` answers Meta's code 190. Every request is kept; anything else fails the
 * test, so nothing reaches the network.
 */
function fakeGraph() {
  const calls: string[] = []
  const state = { dead: false, busy: false }
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
  const fetch = async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const path = url.pathname.replace('/v26.0', '')
    calls.push(`${path}?${url.searchParams.get('fields') ?? url.searchParams.get('metric')}`)
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
    if (state.dead) return json({ error: { message: 'expired', code: 190 } }, 400)
    if (path === `/${IG}/media`) {
      return json({
        data: [
          {
            id: '1790',
            caption: 'Fresh pasta',
            media_type: 'IMAGE',
            media_url: 'https://scontent.cdninstagram.test/1790.jpg',
            permalink: 'https://www.instagram.com/p/abc/',
            timestamp: '2026-10-05T10:00:00+0000',
            like_count: 120,
            comments_count: 8,
          },
          // A Reel: its cover is the thumbnail. Its views do not load; its other counts stay.
          {
            id: '1791',
            caption: '',
            media_type: 'VIDEO',
            media_url: 'https://scontent.cdninstagram.test/1791.mp4',
            thumbnail_url: 'http://scontent.cdninstagram.test/1791.jpg',
            permalink: 'javascript:alert(1)',
            like_count: 3,
          },
        ],
      })
    }
    if (path === '/1790/insights' && state.busy) {
      return json({ error: { message: 'Application request limit reached', code: 4 } }, 400)
    }
    if (path === '/1790/insights') {
      return json({ data: [{ name: 'views', period: 'lifetime', values: [{ value: 2400 }] }] })
    }
    if (path === '/1791/insights')
      return json({ error: { message: 'unsupported', code: 100 } }, 400)
    if (path === `/${PAGE}/posts`) {
      return json({
        data: [
          {
            id: `${PAGE}_1`,
            message: 'Sunday roast',
            created_time: '2026-10-04T08:00:00+0000',
            permalink_url: 'https://www.facebook.com/casa/posts/1',
            full_picture: 'https://scontent.fbcdn.test/1.jpg',
            reactions: { data: [], summary: { total_count: 40 } },
            comments: { data: [], summary: { total_count: 5 } },
            shares: { count: 2 },
          },
        ],
      })
    }
    throw new Error(`unexpected request ${url}`)
  }
  const app = metaApp({
    appId: 'a',
    appSecret: 's',
    configId: 'c',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 7),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, state }
}

async function setUp() {
  const graph = fakeGraph()
  const t = await serve({ meta: graph.app })
  await t.db.query(
    `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
      ('casa', 'facebook', $1, 'Casa Vostra', $3, '{"via": "meta"}', 'owner'),
      ('casa', 'instagram', $2, 'casavostra', $4, '{"via": "meta"}', 'owner')`,
    [
      PAGE,
      IG,
      graph.app.sealToken(TOKEN, `facebook:casa:${PAGE}`),
      graph.app.sealToken(TOKEN, `instagram:casa:${IG}`),
    ],
  )
  return { ...t, graph }
}

describe('the Feed’s Instagram and Facebook posts, read from Meta', () => {
  it('reads the Instagram account’s newest posts with their likes, comments and views, and keeps only https links', async () => {
    const t = await setUp()
    const res = await t.app.request('/brands/casa/meta/instagram/posts', {
      headers: { authorization: 'Bearer member' },
    })
    // Read live: no cache on the way keeps it.
    expect(res.headers.get('cache-control')).toBe('no-store')
    const got = { status: res.status, data: (await res.json()) as { posts: unknown[] } }
    expect(got.status).toBe(200)
    expect(got.data.posts).toEqual([
      {
        id: '1790',
        title: 'Fresh pasta',
        cover: 'https://scontent.cdninstagram.test/1790.jpg',
        url: 'https://www.instagram.com/p/abc/',
        createdAt: '2026-10-05T10:00:00.000Z',
        duration: null,
        views: 2400,
        likes: 120,
        comments: 8,
        shares: null,
      },
      {
        id: '1791',
        title: '',
        cover: null,
        url: null,
        createdAt: null,
        duration: null,
        views: null,
        likes: 3,
        comments: null,
        shares: null,
      },
    ])
    // The views come from `views`, not the deprecated `impressions` or `plays`.
    expect(t.graph.calls).toContain('/1790/insights?views')
  })

  it('reads the Page’s newest posts with reactions, comments and shares, and no views', async () => {
    const t = await setUp()
    const got = await t.call('GET', '/brands/casa/meta/facebook/posts')
    expect(got.data.posts).toEqual([
      expect.objectContaining({
        title: 'Sunday roast',
        likes: 40,
        comments: 5,
        shares: 2,
        views: null,
      }),
    ])
  })

  it('says to reconnect a dead token, says to connect an unlinked one, and keeps another company’s brand out', async () => {
    const t = await setUp()
    const got = await t.call('GET', '/brands/casa/meta/instagram/posts')
    expect(got.status).toBe(200)
    // Meta's rate limit stops the read, rather than showing posts with no views.
    t.graph.state.busy = true
    expect(await t.call('GET', '/brands/casa/meta/instagram/posts')).toMatchObject({
      status: 502,
      data: { code: 'PLATFORM' },
    })
    t.graph.state.busy = false
    t.graph.state.dead = true
    expect(await t.call('GET', '/brands/casa/meta/instagram/posts')).toMatchObject({
      status: 409,
      data: { code: 'META_RECONNECT' },
    })
    expect(
      (await t.call('GET', '/brands/temper/meta/instagram/posts', undefined, 'member')).status,
    ).toBe(404)
    expect((await t.call('GET', '/brands/osteria/meta/instagram/posts')).data.code).toBe(
      'META_NOT_LINKED',
    )
  })
})
