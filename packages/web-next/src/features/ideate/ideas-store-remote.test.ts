import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { boardsOf, pastedReferences, referencesOf, type Reference } from '@/data/ideas'
import type { BrandState } from '@/lib/remote'
import { RemoteError } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { disconnect } from '@/features/connections/connections-store'

import { connectSource, disconnectSource, pasteLink, useIdeas } from './ideas-store'

// The store on the API: the test hands it a brand's state and reads what it would send.
// Every store's state listener: the connections store listens too once it is imported.
const hydrate = vi.hoisted(() => {
  const fns: Array<(id: string, s: BrandState) => void> = []
  return { fns, fn: (id: string, s: BrandState) => fns.forEach((f) => f(id, s)) }
})
const sends = vi.hoisted(() => [] as Array<[string, string, unknown]>)
const answers = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onState: (fn: (id: string, s: BrandState) => void) => {
    hydrate.fns.push(fn)
    return () => undefined
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  request: async (method: string, path: string, body?: unknown) => {
    sends.push([method, path, body])
    const answer = answers[path]
    if (answer instanceof Error) throw answer
    return answer
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

  it('reads the brand’s Pinterest board live once it has one, and shows no sample pins without one', async () => {
    answers['/brands/carlitos/pinterest/pins'] = {
      board: { id: '111', name: 'Carlitos' },
      pins: [
        {
          id: 'p1',
          title: 'Tacos at dusk',
          link: null,
          image: 'https://i.pinimg.com/600x/p1.jpg',
          width: 600,
          height: 900,
        },
      ],
    }
    hydrate.fn('carlitos', {
      brand: { id: 'carlitos' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected', externalId: '111' }],
    })
    const { result } = renderHook(() => useIdeas('carlitos'))
    expect(result.current.sources.pinterest).toBe(true)
    await waitFor(() => expect(boardsOf('carlitos').map((b) => b.name)).toEqual(['Carlitos']))
    const [pin] = boardsOf('carlitos')[0]!.pins
    expect(pin).toMatchObject({
      id: 'pin-p1',
      platform: 'pinterest',
      image: 'https://i.pinimg.com/600x/p1.jpg',
      ratio: 1.5,
    })
    // An idea planned from the pin finds it again by id.
    expect(referencesOf('carlitos').some((r) => r.id === 'pin-p1')).toBe(true)

    // The board dropped: the source is off, and the demo's sample boards do not stand in.
    hydrate.fn('carlitos', { brand: { id: 'carlitos' }, ideas: [], connections: [] })
    await waitFor(() => expect(result.current.sources.pinterest).toBe(false))
    expect(boardsOf('carlitos')).toEqual([])
  })

  it('keeps Pinterest off without a board, and off again when its sign-in has died', async () => {
    // A row marked connected with no board (an older database): nothing to show, so off.
    hydrate.fn('casa-vostra', {
      brand: { id: 'casa-vostra' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected', externalId: null }],
    })
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    expect(result.current.sources.pinterest).toBe(false)
    expect(sends.some(([, path]) => path === '/brands/casa-vostra/pinterest/pins')).toBe(false)

    // The board is there but the token is dead: the source goes off, so its setup can reconnect.
    answers['/brands/casa-vostra/pinterest/pins'] = new RemoteError(
      409,
      'PINTEREST_RECONNECT',
      'the Pinterest account needs connecting again',
    )
    hydrate.fn('casa-vostra', {
      brand: { id: 'casa-vostra' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected', externalId: '111' }],
    })
    // A fresh read once the failed load has settled: the hook above would still hold the old value.
    await new Promise((r) => setTimeout(r, 0))
    expect(renderHook(() => useIdeas('casa-vostra')).result.current.sources.pinterest).toBe(false)
    expect(boardsOf('casa-vostra')).toEqual([])
  })

  it('forgets the account on disconnect, and its pins leave at once', async () => {
    answers['/brands/carlitos/pinterest/pins'] = {
      board: { id: '111', name: 'Carlitos' },
      pins: [
        {
          id: 'p1',
          title: '',
          link: null,
          image: 'https://i.pinimg.com/1.jpg',
          width: 1,
          height: 1,
        },
      ],
    }
    hydrate.fn('carlitos', {
      brand: { id: 'carlitos' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected', externalId: '111' }],
    })
    await waitFor(() => expect(boardsOf('carlitos')).toHaveLength(1))
    disconnect('carlitos', 'pinterest')
    expect(boardsOf('carlitos')).toEqual([])
    expect(referencesOf('carlitos').some((r) => r.id === 'pin-p1')).toBe(false)
    await waitFor(() =>
      expect(sends.at(-1)).toEqual(['DELETE', '/brands/carlitos/pinterest', undefined]),
    )
  })
})
