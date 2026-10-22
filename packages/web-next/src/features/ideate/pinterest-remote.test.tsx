import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { boardsOf, referencesOf } from '@/data/ideas'
import { BrandProvider } from '@/features/schedule/posts-store'
import { RemoteError, type BrandState } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { ConnectionsPage } from '@/features/connections/connections-page'
import {
  disconnect,
  useAccountName,
  useConnections,
} from '@/features/connections/connections-store'

import { useIdeas } from './ideas-store'

// On the core, with a server whose Pinterest app is set up (`GET /platforms` said so). Meta and
// TikTok have no app yet. The ideas and connections stores' state listeners are kept, so a test
// hands both the state.
const hydrate = vi.hoisted(() => {
  const fns: Array<(id: string, s: BrandState) => void> = []
  return { fns, fn: (id: string, s: BrandState) => fns.forEach((f) => f(id, s)) }
})
const sends = vi.hoisted(() => [] as Array<[string, string, unknown]>)
const answers = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  platformOn: (platform: string) => platform === 'pinterest',
  onState: (fn: (id: string, s: BrandState) => void) => {
    const stack = new Error().stack ?? ''
    if (stack.includes('ideas-store') || stack.includes('connections-store')) hydrate.fns.push(fn)
    return () => undefined
  },
  onAccount: () => () => undefined,
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  report: () => undefined,
  request: async (method: string, path: string, body?: unknown) => {
    sends.push([method, path, body])
    const answer = answers[path]
    if (answer instanceof Error) throw answer
    return answer ?? {}
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/brand/connections',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

afterEach(() => {
  sends.length = 0
  for (const k of Object.keys(answers)) delete answers[k]
})

const PIN = {
  id: 'p1',
  title: 'Tacos at dusk',
  link: null,
  image: 'https://i.pinimg.com/600x/p1.jpg',
  width: 600,
  height: 900,
}

describe('the moodboard’s Pinterest on the core', () => {
  it('reads the brand’s board live once it has one, and shows no pin without one', async () => {
    answers['/brands/carlitos/pinterest/pins'] = {
      board: { id: '111', name: 'Tacos' },
      pins: [PIN],
    }
    hydrate.fn('carlitos', {
      brand: { id: 'carlitos', name: 'Carlitos' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected' }],
      pinterest: { username: 'brand.pins' },
      moodboard: { boards: [], posts: [] },
    })
    const { result } = renderHook(() => useIdeas('carlitos'))
    expect(result.current.sources.pinterest).toBe(true)
    await waitFor(() => expect(boardsOf('carlitos').map((b) => b.name)).toEqual(['Tacos']))
    expect(boardsOf('carlitos')[0]!.pins[0]).toMatchObject({
      id: 'pin-p1',
      platform: 'pinterest',
      image: PIN.image,
      ratio: 1.5,
      // The idea a pin starts names the brand, from the server's state.
      seed: { feature: 'Carlitos' },
    })
    // An idea planned from the pin finds it again by id.
    expect(referencesOf('carlitos').some((r) => r.id === 'pin-p1')).toBe(true)

    // The state read again (the tab back in view): Pinterest is not asked again, since Trial
    // access allows 1,000 reads a day for every brand together.
    hydrate.fn('carlitos', {
      brand: { id: 'carlitos', name: 'Carlitos' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected' }],
      pinterest: { username: 'brand.pins' },
      moodboard: { boards: [], posts: [] },
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(sends.filter(([, path]) => path === '/brands/carlitos/pinterest/pins')).toHaveLength(1)

    // The board dropped: the source is off, and no stored board stands in.
    hydrate.fn('carlitos', {
      brand: { id: 'carlitos' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'off' }],
      pinterest: { username: 'brand.pins' },
      moodboard: { boards: [], posts: [] },
    })
    await waitFor(() => expect(result.current.sources.pinterest).toBe(false))
    expect(boardsOf('carlitos')).toEqual([])
  })

  it('keeps Pinterest off without an account, and off again when its sign-in has died', async () => {
    // A connection with no account behind it (stored before 1.7.0): off, and Pinterest is not asked.
    hydrate.fn('casa-vostra', {
      brand: { id: 'casa-vostra' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected' }],
      pinterest: null,
      moodboard: { boards: [], posts: [] },
    })
    expect(renderHook(() => useIdeas('casa-vostra')).result.current.sources.pinterest).toBe(false)
    expect(sends.some(([, path]) => path.endsWith('/pinterest/pins'))).toBe(false)

    // A board, but a dead token: the source goes off, so its setup offers Connect again.
    answers['/brands/casa-vostra/pinterest/pins'] = new RemoteError(
      409,
      'PINTEREST_RECONNECT',
      'the Pinterest account needs connecting again',
    )
    hydrate.fn('casa-vostra', {
      brand: { id: 'casa-vostra' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected' }],
      pinterest: { username: 'brand.pins' },
      moodboard: { boards: [], posts: [] },
    })
    await waitFor(() =>
      expect(renderHook(() => useIdeas('casa-vostra')).result.current.sources.pinterest).toBe(
        false,
      ),
    )
    expect(boardsOf('casa-vostra')).toEqual([])
  })

  it('shows the account on Connections once linked, before any board, and forgets it on disconnect', async () => {
    answers['/brands/temper/pinterest/pins'] = { board: { id: '1', name: 'Steak' }, pins: [PIN] }
    hydrate.fn('temper', {
      brand: { id: 'temper' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected' }],
      pinterest: { username: 'tech2450' },
      moodboard: { boards: [], posts: [] },
    })
    const read = () =>
      renderHook(() => [useConnections('temper').pinterest, useAccountName('temper', 'pinterest')])
        .result.current
    expect(read()).toEqual(['connected', '@tech2450'])
    await waitFor(() => expect(boardsOf('temper')).toHaveLength(1))

    disconnect('temper', 'pinterest')
    expect(read()).toEqual(['off', null])
    // Its pins leave at once: an idea no longer finds them.
    expect(referencesOf('temper').some((r) => r.id === 'pin-p1')).toBe(false)
    await waitFor(() =>
      expect(sends.at(-1)).toEqual(['DELETE', '/brands/temper/pinterest', undefined]),
    )
  })
})

describe('a board read on its way', () => {
  it('is dropped when the account is disconnected before it answers', async () => {
    let answer: (v: unknown) => void = () => undefined
    answers['/brands/temper/pinterest/pins'] = new Promise((r) => (answer = r))
    hydrate.fn('temper', {
      brand: { id: 'temper', name: 'Temper' },
      ideas: [],
      connections: [{ key: 'pinterest', status: 'connected' }],
      pinterest: { username: 'temper.pins' },
      moodboard: { boards: [], posts: [] },
    })
    renderHook(() => useIdeas('temper'))
    await waitFor(() =>
      expect(sends.some(([, p]) => p.endsWith('/temper/pinterest/pins'))).toBe(true),
    )
    disconnect('temper', 'pinterest')
    answer({ board: { id: '9', name: 'Late' }, pins: [PIN] })
    await new Promise((r) => setTimeout(r, 0))
    // The old pins never come back after the disconnect.
    expect(boardsOf('temper')).toEqual([])
    expect(referencesOf('temper').some((r) => r.id === 'pin-p1')).toBe(false)
  })
})

describe('Connections on the core with Pinterest set up', () => {
  it('offers a real Connect for Pinterest only; Instagram, TikTok and Facebook stay not available', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    answers['/brands/casa-vostra/pinterest/connect'] = { url: 'https://www.pinterest.com/oauth/?x' }
    render(
      <BrandProvider>
        <ConnectionsPage />
      </BrandProvider>,
    )
    act(() =>
      hydrate.fn('casa-vostra', {
        brand: { id: 'casa-vostra' },
        ideas: [],
        connections: [],
        pinterest: null,
        moodboard: { boards: [], posts: [] },
      }),
    )
    const row = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li')!
    for (const name of ['Instagram', 'TikTok', 'Facebook']) {
      expect(within(row(name)).getByRole('button', { name: 'Not connected' })).toBeVisible()
    }
    const pinterest = row('Pinterest')
    expect(within(pinterest).queryByRole('button', { name: 'Not connected' })).toBeNull()
    // No pretend sheet: the browser leaves for Pinterest's own sign-in.
    fireEvent.click(within(pinterest).getByRole('button', { name: 'Connect Pinterest' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://www.pinterest.com/oauth/?x'))
    expect(sends).toContainEqual(['POST', '/brands/casa-vostra/pinterest/connect', undefined])
    vi.unstubAllGlobals()
  })
})
