import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { pastedReferences, type Reference } from '@/data/ideas'
import type { BrandState } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { connectSource, disconnectSource, pasteLink, useIdeas } from './ideas-store'

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
  it("loads the server's pasted links and sources, and sends a new paste and a source change", () => {
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
    expect(result.current.sources).toMatchObject({ dm: true, tt: false })

    pasteLink('temper', link('p-new'))
    expect(pastedReferences('temper').map((r) => r.id)).toEqual(['p-new', 'p-old'])
    const { id: _id, ...fields } = link('p-new')
    expect(sends.at(-1)).toEqual(['POST', '/brands/temper/pasted', { id: 'p-new', ...fields }])

    connectSource('temper', 'tt')
    expect(sends.at(-1)).toEqual([
      'PUT',
      '/brands/temper/connections/moodboard-tt',
      { status: 'connected' },
    ])
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
