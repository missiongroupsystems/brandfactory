import { describe, expect, it } from 'vitest'
import { stageOf } from '../domain/posts'
import { postJobs } from '../db/schema'
import { testApp } from '../test-helpers'

const reel = (over: object = {}) => ({
  id: 'p1',
  format: 'reel',
  hook: 'Pasta night',
  day: '2026-10-08',
  time: '18:00',
  ...over,
})

describe('a post stage', () => {
  it('comes from the jobs, and a hand mark only counts when no job exists', () => {
    expect(stageOf({ marked: null }, [])).toBe('draft')
    expect(stageOf({ marked: 'scheduled' }, [])).toBe('scheduled')
    expect(stageOf({ marked: null }, [{ status: 'live' }, { status: 'scheduled' }])).toBe(
      'scheduled',
    )
    expect(stageOf({ marked: null }, [{ status: 'live' }, { status: 'failed' }])).toBe('failed')
    expect(stageOf({ marked: 'scheduled' }, [{ status: 'live' }, { status: 'live' }])).toBe(
      'posted',
    )
  })
})

describe('making a post', () => {
  it('makes one post for a repeated id, since a double click sends twice', async () => {
    const { call } = await testApp()
    const first = await call('POST', '/brands/casa/posts', reel())
    const again = await call('POST', '/brands/casa/posts', reel({ hook: 'Changed' }))
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(again.data.hook).toBe('Pasta night')
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.posts).toHaveLength(1)
  })

  it('refuses an id another brand holds, since posts are looked up by id alone', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel(), 'admin')
    const res = await call('POST', '/brands/temper/posts', reel(), 'admin')
    expect(res.status).toBe(409)
    expect(res.data.code).toBe('ID_TAKEN')
  })

  it("starts on the format's usual accounts among the brand's own", async () => {
    const { call } = await testApp()
    const res = await call('POST', '/brands/casa/posts', reel())
    expect(res.data.channels).toEqual(['ig', 'tt'])
    expect(res.data.stage).toBe('draft')
  })

  it('never sends to a platform the brand is not on, nor a format where it cannot go', async () => {
    const { call } = await testApp()
    const yt = await call('POST', '/brands/casa/posts', reel({ channels: ['yt'] }))
    expect(yt.data.code).toBe('BAD_CHANNEL')
    const story = await call(
      'POST',
      '/brands/casa/posts',
      reel({ format: 'story', channels: ['tt'] }),
    )
    expect(story.data.code).toBe('BAD_CHANNEL')
  })

  it("refuses a day that passed in the brand's zone and a time before 07:00", async () => {
    const { call } = await testApp()
    expect((await call('POST', '/brands/casa/posts', reel({ day: '2026-10-05' }))).data.code).toBe(
      'PAST_DAY',
    )
    expect((await call('POST', '/brands/casa/posts', reel({ time: '06:30' }))).data.code).toBe(
      'TOO_EARLY',
    )
    expect((await call('POST', '/brands/casa/posts', reel({ day: '2026-10-06' }))).status).toBe(201)
  })

  it('refuses a blob: URL, which dies on reload', async () => {
    const { call } = await testApp()
    const res = await call(
      'POST',
      '/brands/casa/posts',
      reel({ media: [{ src: 'blob:http://x/1', kind: 'photo' }] }),
    )
    expect(res.status).toBe(400)
  })
})

describe('moving a post', () => {
  it('moves the day and keeps the time', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    const res = await call('POST', '/brands/casa/posts/p1/move', { day: '2026-10-10' })
    expect(res.data).toMatchObject({ day: '2026-10-10', time: '18:00', version: 2 })
  })

  it('changes nothing, not even the version, when moved to the day and time it has', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    const res = await call('POST', '/brands/casa/posts/p1/move', {
      day: '2026-10-08',
      time: '18:00',
    })
    expect(res.data.version).toBe(1)
  })

  it('holds one planned story a day, and none once stories went out', async () => {
    const { call } = await testApp()
    const story = (id: string, day: string) => ({
      id,
      format: 'story',
      hook: 'Story',
      day,
      time: '12:00',
    })
    await call('POST', '/brands/casa/posts', story('s1', '2026-10-08'))
    const second = await call('POST', '/brands/casa/posts', story('s2', '2026-10-08'))
    expect(second.data.code).toBe('STORY_TAKEN')
    await call('POST', '/brands/casa/posts', story('s2', '2026-10-09'))
    const onto = await call('POST', '/brands/casa/posts/s2/move', { day: '2026-10-08' })
    expect(onto.data.code).toBe('STORY_TAKEN')
    await call('POST', '/brands/casa/posts/s1/mark', { stage: 'posted' })
    await call('POST', '/brands/casa/posts/s2/move', { day: '2026-10-10' })
    const afterPosted = await call('POST', '/brands/casa/posts/s2/move', { day: '2026-10-08' })
    expect(afterPosted.data.code).toBe('STORY_TAKEN')
  })

  it('moves the jobs not yet sent with the post', async () => {
    const { call, db } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    await db.insert(postJobs).values({
      id: 'j1',
      postId: 'p1',
      brandId: 'casa',
      channel: 'ig',
      status: 'scheduled',
      runAt: new Date('2026-10-08T10:00:00Z'),
    })
    await call('POST', '/brands/casa/posts/p1/move', { day: '2026-10-09', time: '19:30' })
    const [job] = await db.select().from(postJobs)
    expect(job!.runAt.toISOString()).toBe('2026-10-09T11:30:00.000Z')
  })
})

describe('posted is final', () => {
  it('refuses every change to a posted post, whatever client asks', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    const marked = await call('POST', '/brands/casa/posts/p1/mark', { stage: 'posted' })
    expect(marked.data.stage).toBe('posted')
    const attempts = [
      await call('POST', '/brands/casa/posts/p1/move', { day: '2026-10-10' }),
      await call('PATCH', '/brands/casa/posts/p1', { caption: 'new' }),
      await call('POST', '/brands/casa/posts/p1/mark', { stage: 'draft' }),
      await call('DELETE', '/brands/casa/posts/p1'),
    ]
    expect(attempts.map((a) => a.data.code)).toEqual([
      'POST_POSTED',
      'POST_POSTED',
      'POST_POSTED',
      'POST_POSTED',
    ])
  })

  it('treats a post every account published as posted too', async () => {
    const { call, db } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    await db.insert(postJobs).values({
      id: 'j1',
      postId: 'p1',
      brandId: 'casa',
      channel: 'ig',
      status: 'live',
      runAt: new Date(),
    })
    const res = await call('POST', '/brands/casa/posts/p1/move', { day: '2026-10-10' })
    expect(res.data.code).toBe('POST_POSTED')
  })
})

describe('a stage set by hand', () => {
  it('refuses Scheduled for a post with no account', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel({ channels: [] }))
    const res = await call('POST', '/brands/casa/posts/p1/mark', { stage: 'scheduled' })
    expect(res.data.code).toBe('NO_CHANNELS')
  })

  it('keeps an account on a post marked Scheduled', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    expect(
      (await call('POST', '/brands/casa/posts/p1/mark', { stage: 'scheduled' })).data.stage,
    ).toBe('scheduled')
    const res = await call('PATCH', '/brands/casa/posts/p1', { channels: [] })
    expect(res.data.code).toBe('NO_CHANNELS')
  })

  it('keeps a hand mark apart from publishing, and a draft again cancels the jobs not sent', async () => {
    const { call, db } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    await db.insert(postJobs).values({
      id: 'j1',
      postId: 'p1',
      brandId: 'casa',
      channel: 'ig',
      status: 'scheduled',
      runAt: new Date(),
    })
    const res = await call('POST', '/brands/casa/posts/p1/mark', { stage: 'draft' })
    expect(res.data).toMatchObject({ stage: 'draft', marked: null, jobs: [] })
  })

  it('cannot call back an account that went live', async () => {
    const { call, db } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    await db.insert(postJobs).values([
      { id: 'j1', postId: 'p1', brandId: 'casa', channel: 'ig', status: 'live', runAt: new Date() },
      {
        id: 'j2',
        postId: 'p1',
        brandId: 'casa',
        channel: 'tt',
        status: 'failed',
        runAt: new Date(),
      },
    ])
    expect((await call('POST', '/brands/casa/posts/p1/mark', { stage: 'draft' })).data.code).toBe(
      'PUBLISHING',
    )
    expect((await call('DELETE', '/brands/casa/posts/p1')).data.code).toBe('PUBLISHING')
    // Marked Posted by hand: the failed account is dropped, the live one stays.
    const posted = await call('POST', '/brands/casa/posts/p1/mark', { stage: 'posted' })
    expect(posted.data.stage).toBe('posted')
    expect(posted.data.jobs.map((j: { channel: string }) => j.channel)).toEqual(['ig'])
  })
})

describe('editing a post', () => {
  it('refuses a write made from an older copy and hands back the current one', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    await call('PATCH', '/brands/casa/posts/p1', { caption: 'first', ifVersion: 1 })
    const stale = await call('PATCH', '/brands/casa/posts/p1', { caption: 'late', ifVersion: 1 })
    expect(stale.status).toBe(409)
    expect(stale.data.details.caption).toBe('first')
  })

  it('keeps the whole composer draft', async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/posts', reel())
    const draft = { overrides: { tt: 'TikTok words' }, firstComment: '#pasta', tags: [] }
    await call('PATCH', '/brands/casa/posts/p1', { draft })
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.posts[0].draft).toEqual(draft)
  })
})
