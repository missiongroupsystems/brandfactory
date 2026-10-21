import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { brandAccounts, connections } from '../db/schema'
import { runDueJobs, PublishError, simulatedPublisher, type Publisher } from '../jobs'
import { linkAccounts, NOW, testApp } from '../test-helpers'

async function ready() {
  const t = await testApp()
  await linkAccounts(t.db, 'casa')
  await t.call('POST', '/brands/casa/posts', {
    id: 'p1',
    format: 'reel',
    hook: 'Pasta night',
    day: '2026-10-08',
    time: '18:00',
    caption: 'Fresh pasta tonight.',
    media: [{ src: '/videos/pasta.mp4', kind: 'video' }],
    draft: { privacy: 'Everyone', promo: { on: false } },
  })
  return t
}

const at = (iso: string) => () => new Date(iso)

describe('sending a post', () => {
  it('makes one job per account and is scheduled, not posted, until each account says so', async () => {
    const { call } = await ready()
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'slot' })
    expect(res.data.stage).toBe('scheduled')
    expect(res.data.jobs.map((j: { channel: string }) => j.channel).sort()).toEqual(['ig', 'tt'])
    expect(res.data.jobs[0].runAt).toBe('2026-10-08T10:00:00.000Z')
  })

  it('publishes now from today, at the time it is now in the brand zone', async () => {
    const { call } = await ready()
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'now' })
    expect(res.data).toMatchObject({ day: '2026-10-06', time: '12:00' })
  })

  it('answers a repeated send with its first answer, so a double click makes no second job', async () => {
    const { app, db } = await ready()
    const send = () =>
      app.request('/brands/casa/posts/p1/send', {
        method: 'POST',
        headers: {
          authorization: 'Bearer member',
          'content-type': 'application/json',
          'idempotency-key': 'send-abcdefgh',
        },
        body: JSON.stringify({ when: 'slot' }),
      })
    const first = await (await send()).json()
    const second = await (await send()).json()
    expect(second).toEqual(first)
    expect(await db.query.postJobs.findMany()).toHaveLength(2)
  })

  it("never replays another brand's post through a key it learned", async () => {
    const { app } = await ready()
    const send = (brand: string, token: string) =>
      app.request(`/brands/${brand}/posts/p1/send`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': 'send-abcdefgh',
        },
        body: JSON.stringify({ when: 'slot' }),
      })
    expect((await send('casa', 'member')).status).toBe(200)
    expect((await send('temper', 'admin')).status).toBe(404)
  })

  it('refuses to send a post that is out', async () => {
    const { call } = await ready()
    await call('POST', '/brands/casa/posts/p1/mark', { stage: 'posted' })
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'now' })
    expect(res.data.code).toBe('POST_POSTED')
  })

  it('keeps the accounts still due when one account is sent again', async () => {
    const { call } = await ready()
    await call('POST', '/brands/casa/posts/p1/send', { when: 'slot' })
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'slot', channels: ['tt'] })
    expect(res.data.channels.sort()).toEqual(['ig', 'tt'])
  })

  it("lists every blocker in the composer's order", async () => {
    const { call } = await ready()
    await call('PATCH', '/brands/casa/posts/p1', {
      caption: '',
      media: [],
      draft: { privacy: null },
    })
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'slot' })
    expect(res.data.code).toBe('BLOCKED')
    expect(res.data.details).toEqual([
      'Add a photo or video.',
      'Choose who can watch on TikTok.',
      'Write a caption.',
    ])
  })

  it('asks to reconnect an account with no tokens behind it, whatever an older row says', async () => {
    const { call, db } = await ready()
    await db
      .delete(brandAccounts)
      .where(and(eq(brandAccounts.brandId, 'casa'), eq(brandAccounts.platform, 'meta')))
    // A row from before the accounts were real: it says connected, and nothing can post.
    await db.insert(connections).values({ brandId: 'casa', key: 'ig', status: 'connected' })
    await call('PATCH', '/brands/casa/posts/p1', { channels: ['ig', 'fb'] })
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'slot' })
    expect(res.data.details).toEqual(['Reconnect Instagram first.', 'Reconnect Facebook first.'])
    // The state agrees: Instagram is off.
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.connections).toContainEqual(
      expect.objectContaining({ key: 'ig', status: 'off' }),
    )
  })

  it('counts text in characters as people see them, per account', async () => {
    const { call } = await ready()
    await call('PATCH', '/brands/casa/posts/p1', {
      draft: { privacy: 'Everyone', overrides: { tt: '🍝'.repeat(2201) } },
    })
    const res = await call('POST', '/brands/casa/posts/p1/send', { when: 'slot' })
    expect(res.data.details).toEqual(['Shorten the text for TikTok (2201/2200).'])
  })
})

describe('the jobs', () => {
  it('go out when due, and the post is posted once every account is live', async () => {
    const { call, db } = await ready()
    await call('POST', '/brands/casa/posts/p1/send', { when: 'slot' })
    const early = await runDueJobs({ db, now: () => NOW, publisher: simulatedPublisher })
    expect(early).toBe(0)
    await runDueJobs({ db, now: at('2026-10-08T10:00:00Z'), publisher: simulatedPublisher })
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.posts[0].stage).toBe('posted')
  })

  it('fail one account alone, retry only that account, and keep the one that went out', async () => {
    const { call, db } = await ready()
    const flaky: Publisher = {
      async publish({ job }) {
        if (job.channel === 'tt') throw new PublishError('TikTok refused the video.')
        return { externalId: 'x' }
      },
    }
    await call('POST', '/brands/casa/posts/p1/send', { when: 'now' })
    await runDueJobs({ db, now: () => NOW, publisher: flaky })
    let post = (await call('GET', '/brands/casa/state')).data.posts[0]
    expect(post.stage).toBe('failed')
    expect(post.jobs.find((j: { channel: string }) => j.channel === 'tt').error).toBe(
      'TikTok refused the video.',
    )
    const retry = await call('POST', '/brands/casa/posts/p1/send', {
      when: 'now',
      channels: ['tt'],
    })
    expect(retry.data.stage).toBe('scheduled')
    await runDueJobs({ db, now: () => NOW, publisher: simulatedPublisher })
    post = (await call('GET', '/brands/casa/state')).data.posts[0]
    expect(post.stage).toBe('posted')
    expect(post.channels.sort()).toEqual(['ig', 'tt'])
  })

  it('fails a job cut off mid-upload instead of sending it twice', async () => {
    const { call, db } = await ready()
    await call('POST', '/brands/casa/posts/p1/send', { when: 'now' })
    const hang: Publisher = { publish: () => new Promise(() => {}) }
    void runDueJobs({ db, now: () => NOW, publisher: hang })
    await new Promise((r) => setTimeout(r, 50))
    await runDueJobs({ db, now: at('2026-10-06T05:00:00Z'), publisher: simulatedPublisher })
    const post = (await call('GET', '/brands/casa/state')).data.posts[0]
    expect(post.stage).toBe('failed')
  })
})
