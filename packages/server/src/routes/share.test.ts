import { describe, expect, it } from 'vitest'
import { testApp } from '../test-helpers'

async function shared() {
  const t = await testApp()
  await t.call('POST', '/brands/casa/ideas', {
    id: 'i1',
    format: 'carousel',
    hook: 'Nonna rolls the pasta',
    angle: 'Hands, flour, morning light',
    shots: [
      { id: 'sh1', title: 'Flour on the board' },
      { id: 'sh2', title: 'The fold' },
    ],
  })
  const team = await t.call('GET', '/brands/casa/share/idea/i1')
  const guest = (method: string, path: string, json?: unknown) =>
    t.call(method, `/share/${team.data.link.token}${path}`, json, '')
  return { ...t, token: team.data.link.token as string, guest }
}

describe('a share link', () => {
  it('is an unguessable token, not the idea id, and one per idea', async () => {
    const { call, token } = await shared()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const again = await call('GET', '/brands/casa/share/idea/i1')
    expect(again.data.link.token).toBe(token)
  })

  it('shows the brief to a guest with no sign-in, and nothing for a made-up token', async () => {
    const { guest, call } = await shared()
    const page = await guest('GET', '')
    expect(page.data.idea).toMatchObject({ hook: 'Nonna rolls the pasta' })
    expect(page.data.access.can).toBe('comment')
    expect((await call('GET', '/share/i1', undefined, '')).status).toBe(404)
  })

  it('shows a guest only what the brief says, not how the team planned it', async () => {
    const { guest } = await shared()
    const page = await guest('GET', '')
    expect(Object.keys(page.data.idea).sort()).toEqual(
      ['angle', 'feature', 'format', 'hook', 'id', 'inspiration', 'shots'].sort(),
    )
  })

  it('shows a call sheet to a guest: day, hours, place, crew and shot list', async () => {
    const { call } = await shared()
    await call('POST', '/brands/casa/shoots', {
      id: 's1',
      title: 'Raffles City',
      origin: 'manual',
      day: '2026-10-09',
      place: 'Raffles City, level 3',
      ideaIds: ['i1'],
      crew: [{ id: 'c1', name: 'Jules', role: 'Videographer' }],
    })
    const link = await call('GET', '/brands/casa/share/shoot/s1')
    const page = await call('GET', `/share/${link.data.link.token}`, undefined, '')
    expect(page.data.shoot).toMatchObject({
      day: '2026-10-09',
      start: '12:00',
      place: 'Raffles City, level 3',
      crew: [{ name: 'Jules', role: 'Videographer' }],
      ideas: [{ id: 'i1', hook: 'Nonna rolls the pasta' }],
    })
  })

  it('hides the page from guests once the team keeps it to itself', async () => {
    const { guest, call } = await shared()
    await call('PUT', '/brands/casa/share/idea/i1', { who: 'team' })
    expect((await guest('GET', '')).status).toBe(403)
  })

  it('takes a guest comment with a name and words, and the team replies as the brand', async () => {
    const { guest, call } = await shared()
    expect((await guest('POST', '/comments', { name: ' ', text: 'Hi' })).status).toBe(400)
    const made = await guest('POST', '/comments', { name: ' Ana ', text: ' Love it ' })
    expect(made.data).toMatchObject({ name: 'Ana', text: 'Love it' })
    await call('POST', `/brands/casa/comments/${made.data.id}/replies`, { text: 'Thank you!' })
    await call('PUT', `/brands/casa/comments/${made.data.id}/done`, { done: true })
    const page = await guest('GET', '')
    expect(page.data.comments[0]).toMatchObject({ done: true })
    expect(page.data.comments[0].replies[0]).toMatchObject({ name: 'Casa Vostra', fromTeam: true })
  })

  it('refuses a comment on a view-only link, checked on the server', async () => {
    const { guest, call } = await shared()
    await call('PUT', '/brands/casa/share/idea/i1', { can: 'view' })
    expect((await guest('POST', '/comments', { name: 'Ana', text: 'Hi' })).status).toBe(403)
  })

  it("lets a guest who can edit change the brief's words and shot titles, and nothing more", async () => {
    const { guest, call } = await shared()
    expect((await guest('PATCH', '/brief', { hook: 'New' })).status).toBe(403)
    await call('PUT', '/brands/casa/share/idea/i1', { can: 'edit' })
    const res = await guest('PATCH', '/brief', {
      hook: 'Nonna, 6am',
      shots: [{ id: 'sh2', title: 'The fold, close' }],
    })
    expect(res.data.hook).toBe('Nonna, 6am')
    expect(res.data.shots).toEqual([
      { id: 'sh1', title: 'Flour on the board' },
      { id: 'sh2', title: 'The fold, close' },
    ])
    const added = await guest('PATCH', '/brief', { shots: [{ id: 'new', title: 'x' }] })
    expect(added.status).toBe(409)
  })

  it('slows a guest who posts too many comments', async () => {
    const { guest } = await shared()
    const codes = []
    for (let i = 0; i < 11; i++) {
      codes.push((await guest('POST', '/comments', { name: 'Bot', text: `spam ${i}` })).status)
    }
    expect(codes.at(-1)).toBe(429)
  })

  it("does not share another brand's idea", async () => {
    const { call } = await shared()
    const res = await call('GET', '/brands/temper/share/idea/i1', undefined, 'admin')
    expect(res.status).toBe(404)
  })
})
