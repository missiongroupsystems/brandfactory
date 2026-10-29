import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { moodboardOf, pastedReferences, referencesOf, type Reference } from '@/data/ideas'
import type { BrandState } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import {
  connectSource,
  disconnectSource,
  keepPasted,
  pastedKept,
  pasteLink,
  useIdeas,
  wordsOnPasted,
} from './ideas-store'

// The store on the API: the test hands it a brand's state and reads what it would send.
const hydrate = vi.hoisted(() => ({ fn: (_id: string, _s: BrandState) => {} }))
const sends = vi.hoisted(() => [] as Array<[string, string, unknown]>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onState: (fn: (id: string, s: BrandState) => void) => {
    hydrate.fn = fn
    return () => undefined
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  request: async (method: string, path: string, body?: unknown) => {
    sends.push([method, path, body])
  },
}))

const link = (id: string): Reference => ({
  id,
  platform: 'tt',
  account: 'tiktok.com',
  image: '',
  borrow: 'Say what to borrow.',
  seed: {
    format: 'reel',
    pillar: 'Craft',
    hook: 'New idea from a reference.',
    angle: 'What to borrow, in your words.',
    feature: 'Temper',
    shots: [],
    sharper: [],
  },
})

describe('the moodboard on the API', () => {
  it("loads the server's pasted links and sources, and sends a new paste and a source change", async () => {
    hydrate.fn('temper', {
      brand: { id: 'temper' },
      ideas: [],
      pasted: [link('p-old')],
      connections: [
        { key: 'moodboard-dm', status: 'connected' },
        { key: 'moodboard-tt', status: 'off' },
      ],
    })
    expect(pastedReferences('temper').map((r) => r.id)).toEqual(['p-old'])
    const { result } = renderHook(() => useIdeas('temper'))
    // Instagram and TikTok are not set up on our side yet: a stored "connected" is not trusted.
    expect(result.current.sources).toMatchObject({ dm: false, tt: false })

    // A paste shows at once and goes to the server at once; the server has it from then on, so
    // a second ask sends nothing. The words typed after stay here: the server keeps a link as
    // first sent and takes no edit.
    const sentBefore = sends.length
    pasteLink('temper', link('p-new'))
    expect(pastedReferences('temper').map((r) => r.id)).toEqual(['p-new', 'p-old'])
    const { id: _id, ...fields } = link('p-new')
    expect(sends.at(-1)).toEqual(['POST', '/brands/temper/pasted', { id: 'p-new', ...fields }])
    await Promise.resolve()
    expect(pastedKept('p-new')).toBe(true)
    keepPasted('temper', 'p-new')
    wordsOnPasted('temper', 'p-new', 'The slow zoom')
    expect(pastedReferences('temper')[0]?.borrow).toBe('The slow zoom')
    expect(sends.length).toBe(sentBefore + 1)

    // No pretend sign-in: nothing is sent, and the source stays off.
    const sent = sends.length
    connectSource('temper', 'tt')
    expect(sends.length).toBe(sent)
    expect(result.current.sources.tt).toBe(false)
    disconnectSource('temper', 'dm')
    expect(sends.at(-1)).toEqual([
      'PUT',
      '/brands/temper/connections/moodboard-dm',
      { status: 'off' },
    ])
    // Pinterest belongs to the connections store, which sends it itself.
    const before = sends.length
    connectSource('temper', 'pinterest')
    expect(sends.length).toBe(before)
  })
})

describe("the moodboard's boards and shelf on the API", () => {
  it("shows the server's moodboard, so a post saved on another device is there, and its idea's cover too", () => {
    const shelf = { ...link('srv-shelf'), boardId: null }
    const pin = { ...link('srv-pin'), platform: 'pinterest' as const, ratio: 1.4, boardId: 'srv-b' }
    hydrate.fn('carlitos', {
      brand: { id: 'carlitos' },
      ideas: [],
      pasted: [],
      connections: [],
      moodboard: {
        boards: [{ id: 'srv-b', name: 'From the server', pinCount: 1, covers: [] }],
        posts: [shelf, pin],
      },
    })
    expect(moodboardOf('carlitos').references.map((r) => r.id)).toEqual(['srv-shelf'])
    expect(moodboardOf('carlitos').boards).toMatchObject([
      { id: 'srv-b', name: 'From the server', pins: [{ id: 'srv-pin', ratio: 1.4 }] },
    ])
    // The demo's own posts are gone: the server's moodboard replaces them, it does not add to them.
    expect(referencesOf('carlitos').map((r) => r.id)).toEqual(['srv-shelf', 'srv-pin'])
  })
})
