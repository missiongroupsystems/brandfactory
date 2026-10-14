import { describe, expect, it } from 'vitest'
import { testApp } from '../test-helpers'

const link = (id: string, account = 'tiktok.com') => ({
  id,
  platform: 'tt',
  account,
  image: '',
  borrow: 'Say what to borrow.',
  seed: {
    format: 'reel',
    pillar: 'Craft',
    hook: 'New idea from a reference.',
    angle: 'What to borrow, in your words.',
    feature: 'Casa Vostra',
    shots: [],
    sharper: [],
  },
})

describe('pasted links', () => {
  it('keeps a pasted link with its brand, newest first, and one link for a paste sent twice', async () => {
    const { call } = await testApp()
    expect((await call('POST', '/brands/casa/pasted', link('p-1'))).status).toBe(201)
    expect((await call('POST', '/brands/casa/pasted', link('p-2', 'instagram.com'))).status).toBe(
      201,
    )
    // The same paste again: the stored link, not a second one.
    const again = await call('POST', '/brands/casa/pasted', link('p-1', 'changed.com'))
    expect(again.status).toBe(200)
    expect(again.data.reference.account).toBe('tiktok.com')
    const state = await call('GET', '/brands/casa/state')
    expect(state.data.pasted.map((p: { id: string }) => p.id)).toEqual(['p-2', 'p-1'])
    expect(state.data.pasted[1]).toMatchObject({ id: 'p-1', platform: 'tt', account: 'tiktok.com' })
  })

  it("never shows one brand's link to another, nor lets it take the id", async () => {
    const { call } = await testApp()
    await call('POST', '/brands/casa/pasted', link('p-1'))
    const taken = await call('POST', '/brands/temper/pasted', link('p-1'), 'admin')
    expect(taken.status).toBe(409)
    expect((await call('GET', '/brands/temper/state', undefined, 'admin')).data.pasted).toEqual([])
    // A member of Casa Vostra only cannot paste onto Temper's board.
    expect((await call('POST', '/brands/temper/pasted', link('p-9'))).status).toBe(404)
  })

  it('refuses a link that is not one the moodboard can show', async () => {
    const { call } = await testApp()
    const res = await call('POST', '/brands/casa/pasted', { ...link('p-1'), platform: 'web' })
    expect(res.status).toBe(400)
    const script = await call('POST', '/brands/casa/pasted', {
      ...link('p-2'),
      image: 'javascript:alert(1)',
    })
    expect(script.status).toBe(400)
  })
})

describe("the moodboard's sources", () => {
  it('keeps the DM and TikTok sources on and off like any connection', async () => {
    const { call } = await testApp()
    await call('PUT', '/brands/casa/connections/moodboard-dm', { status: 'connected' })
    await call('PUT', '/brands/casa/connections/moodboard-tt', { status: 'connected' })
    await call('PUT', '/brands/casa/connections/moodboard-tt', { status: 'off' })
    const state = await call('GET', '/brands/casa/state')
    const status = Object.fromEntries(
      state.data.connections.map((c: { key: string; status: string }) => [c.key, c.status]),
    )
    expect(status).toMatchObject({ 'moodboard-dm': 'connected', 'moodboard-tt': 'off' })
  })
})
