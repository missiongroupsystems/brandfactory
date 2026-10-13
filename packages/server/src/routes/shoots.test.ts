import { describe, expect, it } from 'vitest'
import { testApp } from '../test-helpers'

async function setup() {
  const t = await testApp()
  for (const id of ['i1', 'i2', 'i3']) {
    await t.call('POST', '/brands/casa/ideas', { id, format: 'reel', hook: id })
  }
  return t
}

const plan = (id: string, ideaIds: string[], over: object = {}) => ({
  id,
  title: 'New shoot',
  origin: 'planned',
  ideaIds,
  ...over,
})

describe('planning a shoot', () => {
  it('takes the picked ideas out of the shoot they were in: an idea is shot once', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1', 'i2']))
    const res = await call('POST', '/brands/casa/shoots', plan('s2', ['i2']))
    expect(res.status).toBe(201)
    const state = await call('GET', '/brands/casa/state')
    const s1 = state.data.shoots.find((s: { id: string }) => s.id === 's1')
    expect(s1.ideaIds).toEqual(['i1'])
  })

  it('drops a planned shoot its last idea leaves, but keeps one added by hand', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    await call('POST', '/brands/casa/shoots', plan('m1', ['i2'], { origin: 'manual' }))
    await call('POST', '/brands/casa/shoots', plan('s2', ['i1', 'i2']))
    const ids = (await call('GET', '/brands/casa/state')).data.shoots.map(
      (s: { id: string }) => s.id,
    )
    expect(ids.sort()).toEqual(['m1', 's2'])
  })

  it('takes the first day ahead with no shoot, from 12:00 to 17:00', async () => {
    const { call } = await setup()
    const a = await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    const b = await call('POST', '/brands/casa/shoots', plan('s2', ['i2']))
    expect(a.data).toMatchObject({ day: '2026-10-07', start: '12:00', end: '17:00' })
    expect(b.data.day).toBe('2026-10-08')
  })

  it('keeps its length when the start moves, and never ends before it starts', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    const moved = await call('PATCH', '/brands/casa/shoots/s1', { start: '14:00' })
    expect(moved.data).toMatchObject({ start: '14:00', end: '19:00' })
    const early = await call('PATCH', '/brands/casa/shoots/s1', { end: '11:00' })
    expect(early.data).toMatchObject({ start: '14:00', end: '15:00' })
  })

  it('refuses an idea of another brand', async () => {
    const { call } = await setup()
    await call('POST', '/brands/temper/ideas', { id: 't1', format: 'reel', hook: 't' }, 'admin')
    const res = await call('POST', '/brands/casa/shoots', plan('s1', ['t1']))
    expect(res.data.code).toBe('BAD_IDEA')
  })
})

describe('ideas on a shoot', () => {
  it('keeps a planned shoot whose last idea is taken off on its own page', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    const res = await call('DELETE', '/brands/casa/shoots/s1/ideas/i1')
    expect(res.data.ideaIds).toEqual([])
  })

  it('drops it when the idea leaves from its own page', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    const res = await call('DELETE', '/brands/casa/shoots/s1/ideas/i1?leave=1')
    expect(res.data).toEqual({ deleted: 's1' })
  })

  it('adds an idea to an empty planned shoot without losing that shoot', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    await call('POST', '/brands/casa/shoots', plan('s2', ['i2']))
    await call('DELETE', '/brands/casa/shoots/s1/ideas/i1')
    const res = await call('POST', '/brands/casa/shoots/s1/ideas', { ideaId: 'i2' })
    expect(res.data.ideaIds).toEqual(['i2'])
    const ids = (await call('GET', '/brands/casa/state')).data.shoots.map(
      (s: { id: string }) => s.id,
    )
    expect(ids).toEqual(['s1'])
  })

  it('shoots in the order dragged; unknown ids are ignored and left-out ones go last', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1', 'i2', 'i3']))
    const res = await call('PUT', '/brands/casa/shoots/s1/order', { ideaIds: ['i3', 'zz', 'i1'] })
    expect(res.data.ideaIds).toEqual(['i3', 'i1', 'i2'])
  })

  it('joins the shoot already on the day picked on an idea page, else starts one there', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1'], { day: '2026-10-09' }))
    const join = await call('POST', '/brands/casa/shoots/on-day', {
      ideaId: 'i2',
      day: '2026-10-09',
      start: '15:00',
      newShootId: 'unused',
    })
    expect(join.data).toMatchObject({ id: 's1', ideaIds: ['i1', 'i2'] })
    const fresh = await call('POST', '/brands/casa/shoots/on-day', {
      ideaId: 'i3',
      day: '2026-10-10',
      start: '14:00',
      newShootId: 's2',
    })
    expect(fresh.data).toMatchObject({ id: 's2', start: '14:00', end: '19:00', origin: 'planned' })
  })
})

describe('the crew and the Lark invite', () => {
  it('keeps two people with one name apart, and removes the one asked for', async () => {
    const { call } = await setup()
    await call('POST', '/brands/casa/shoots', plan('s1', ['i1']))
    await call('POST', '/brands/casa/shoots/s1/crew', { id: 'c1', name: 'Marco', role: 'Chef' })
    await call('POST', '/brands/casa/shoots/s1/crew', { id: 'c2', name: 'Marco', role: 'Talent' })
    const res = await call('DELETE', '/brands/casa/shoots/s1/crew/c1')
    expect(res.data.crew.map((p: { role: string }) => p.role)).toEqual(['Talent'])
  })

  it('invites only the people not invited yet', async () => {
    const { call, sent } = await setup()
    await call('POST', '/brands/casa/shoots', {
      ...plan('s1', ['i1']),
      crew: [
        { id: 'c1', name: 'Giulia', role: 'Videographer' },
        { id: 'c2', name: 'Marco', role: 'Chef' },
      ],
    })
    await call('POST', '/brands/casa/shoots/s1/invites')
    await call('POST', '/brands/casa/shoots/s1/crew', { id: 'c3', name: 'Ana', role: 'Talent' })
    await call('POST', '/brands/casa/shoots/s1/invites')
    expect(sent).toEqual([['Giulia', 'Marco'], ['Ana']])
  })

  it('gives the invite back when Lark fails, so the next press tries those people again', async () => {
    const { call, sent, failNextInvite } = await setup()
    await call('POST', '/brands/casa/shoots', {
      ...plan('s1', ['i1']),
      crew: [{ id: 'c1', name: 'Giulia', role: 'Videographer' }],
    })
    failNextInvite()
    expect((await call('POST', '/brands/casa/shoots/s1/invites')).status).toBe(500)
    await call('POST', '/brands/casa/shoots/s1/invites')
    expect(sent).toEqual([['Giulia']])
  })

  it('asks for Lark before any invite goes out', async () => {
    const { call } = await setup()
    await call('POST', '/brands/temper/ideas', { id: 't1', format: 'reel', hook: 't' }, 'admin')
    await call('POST', '/brands/temper/shoots', plan('t-s1', ['t1']), 'admin')
    const res = await call('POST', '/brands/temper/shoots/t-s1/invites', undefined, 'admin')
    expect(res.data.code).toBe('NOT_CONNECTED')
  })
})
