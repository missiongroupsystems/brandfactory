import { describe, expect, it } from 'vitest'
import { testApp } from '../test-helpers'

const idea = (over: object = {}) => ({
  id: 'i1',
  format: 'reel',
  hook: 'Nonna rolls the pasta',
  image: '/photos/pasta.jpg',
  ...over,
})

async function withIdea(over: object = {}) {
  const t = await testApp()
  await t.call('POST', '/brands/casa/ideas', idea(over))
  return t
}

describe('making an idea', () => {
  it('makes one idea for a repeated id, so a second click on a tile makes no twin', async () => {
    const { call } = await withIdea()
    const again = await call('POST', '/brands/casa/ideas', idea({ hook: 'Other' }))
    expect(again.status).toBe(200)
    expect(again.data.hook).toBe('Nonna rolls the pasta')
  })
})

describe('planning an idea', () => {
  it('turns the idea into a post at its stage, and the tile leaves the calendar', async () => {
    const { call } = await withIdea({ day: '2026-10-09', why: 'Built on Pasta week' })
    const res = await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'scheduled',
    })
    expect(res.data.post).toMatchObject({
      id: 'p1',
      hook: 'Nonna rolls the pasta',
      stage: 'scheduled',
      day: '2026-10-09',
      media: [{ src: '/photos/pasta.jpg', kind: 'photo' }],
    })
    expect(res.data.idea).toMatchObject({ postId: 'p1', day: null })
  })

  it('answers a repeat with the post it made', async () => {
    const { call } = await withIdea()
    const plan = { postId: 'p1', day: '2026-10-09', time: '18:00', stage: 'draft' }
    await call('POST', '/brands/casa/ideas/i1/plan', plan)
    const again = await call('POST', '/brands/casa/ideas/i1/plan', plan)
    expect(again.status).toBe(200)
    expect((await call('GET', '/brands/casa/state')).data.posts).toHaveLength(1)
  })

  it('lifts the post off its day and puts the idea back there in its own words', async () => {
    const { call } = await withIdea({ day: '2026-10-09', why: 'Built on Pasta week' })
    await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'draft',
    })
    await call('POST', '/brands/casa/posts/p1/move', { day: '2026-10-14' })
    const res = await call('DELETE', '/brands/casa/posts/p1')
    expect(res.data.idea).toMatchObject({
      postId: null,
      day: '2026-10-14',
      why: 'Built on Pasta week',
    })
    expect((await call('GET', '/brands/casa/state')).data.posts).toHaveLength(0)
  })

  it('keeps a suggestion a suggestion when its post is taken back', async () => {
    const { call } = await withIdea({ status: 'suggested', day: '2026-10-09' })
    await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'draft',
    })
    const res = await call('DELETE', '/brands/casa/posts/p1')
    expect(res.data.idea.status).toBe('suggested')
  })
})

describe('an idea on the calendar', () => {
  it('lands on the day asked for when it is ahead and holds no post', async () => {
    const { call } = await withIdea()
    const res = await call('POST', '/brands/casa/ideas/i1/calendar', {
      preferDay: '2026-10-09',
      why: 'Built on Pasta week',
    })
    expect(res.data.day).toBe('2026-10-09')
  })

  it('leaves this week alone when the day asked for holds a post, since a shoot needs lead time', async () => {
    const { call } = await withIdea()
    await call('POST', '/brands/casa/posts', {
      id: 'p1',
      format: 'reel',
      hook: 'Busy',
      day: '2026-10-09',
      time: '18:00',
    })
    await call('POST', '/brands/casa/ideas', idea({ id: 'i2', day: '2026-10-12' }))
    const res = await call('POST', '/brands/casa/ideas/i1/calendar', {
      preferDay: '2026-10-09',
      why: 'x',
    })
    // Today is Tue 6 Oct; the week ends Sun 11 Oct; Mon 12 Oct holds an idea.
    expect(res.data.day).toBe('2026-10-13')
  })

  it('never takes today as the day asked for', async () => {
    const { call } = await withIdea()
    const res = await call('POST', '/brands/casa/ideas/i1/calendar', {
      preferDay: '2026-10-06',
      why: 'x',
    })
    expect(res.data.day).toBe('2026-10-12')
  })

  it('refuses a day that is not a date', async () => {
    const { call } = await withIdea()
    const res = await call('POST', '/brands/casa/ideas/i1/calendar', { preferDay: 'zzz', why: 'x' })
    expect(res.status).toBe(400)
  })

  it('moves an idea that is a post only by its post', async () => {
    const { call } = await withIdea()
    await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'draft',
    })
    const res = await call('POST', '/brands/casa/ideas/i1/place', { day: '2026-10-10' })
    expect(res.data.code).toBe('IDEA_PLANNED')
  })
})

describe('editing an idea', () => {
  it('carries a new hook to its post, so the calendar shows what the brief says', async () => {
    const { call } = await withIdea()
    await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'draft',
    })
    await call('PATCH', '/brands/casa/ideas/i1', { hook: 'Sharper hook' })
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.posts[0].hook).toBe('Sharper hook')
  })

  it("keeps an idea's format the same as its post's", async () => {
    const { call } = await withIdea()
    await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'draft',
    })
    const res = await call('PATCH', '/brands/casa/ideas/i1', { format: 'carousel' })
    expect(res.data.code).toBe('IDEA_PLANNED')
  })

  it('leaves a posted post as it went out', async () => {
    const { call } = await withIdea()
    await call('POST', '/brands/casa/ideas/i1/plan', {
      postId: 'p1',
      day: '2026-10-09',
      time: '18:00',
      stage: 'posted',
    })
    await call('PATCH', '/brands/casa/ideas/i1', { hook: 'Sharper hook' })
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.posts[0].hook).toBe('Nonna rolls the pasta')
  })

  it('refuses a write from a stale copy, such as one made before a video length loaded', async () => {
    const { call } = await withIdea()
    await call('PATCH', '/brands/casa/ideas/i1', { angle: 'new', ifVersion: 1 })
    const stale = await call('PATCH', '/brands/casa/ideas/i1', { angle: 'old', ifVersion: 1 })
    expect(stale.data.code).toBe('STALE')
  })

  it('drops a skipped suggestion, and its shoot if that shoot was only for it', async () => {
    const { call } = await withIdea({ status: 'suggested' })
    await call('POST', '/brands/casa/shoots', {
      id: 's1',
      title: 'New shoot',
      origin: 'planned',
      ideaIds: ['i1'],
    })
    await call('DELETE', '/brands/casa/ideas/i1')
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.ideas).toHaveLength(0)
    expect(state.data.shoots).toHaveLength(0)
  })

  it("never shows another brand's idea", async () => {
    const { call } = await withIdea()
    const res = await call('PATCH', '/brands/temper/ideas/i1', { hook: 'x' }, 'admin')
    expect(res.status).toBe(404)
  })
})
