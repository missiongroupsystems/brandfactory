import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type { BrandState } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { IdeatePage } from './ideate-page'

// On the core, with Pinterest set up: the moodboard reads every board the brand picked. Each board
// is a chip with a × that removes the board in one click, and the "+" opens the board picker with
// the boards read now ticked and listed first, each with a link to open it on Pinterest.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'https://core.test'
})
const hydrate = vi.hoisted(() => {
  const fns: Array<(id: string, s: BrandState) => void> = []
  return { fns, fn: (id: string, s: BrandState) => fns.forEach((f) => f(id, s)) }
})
const sends = vi.hoisted(() => [] as Array<[string, string, unknown]>)
const answers = vi.hoisted(() => ({}) as Record<string, unknown>)
// Requests the core refuses, as "METHOD path".
const refused = vi.hoisted(() => new Set<string>())
afterEach(() => refused.clear())
// How often the brand's whole state was loaded again.
const loads = vi.hoisted(() => ({ n: 0 }))
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
  // The brand reloads after a change: the state the test set last comes back.
  loadBrand: async (id: string) => {
    loads.n += 1
    hydrate.fn(id, current)
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  report: () => undefined,
  request: async (method: string, path: string, body?: unknown) => {
    sends.push([method, path, body])
    if (refused.has(`${method} ${path}`)) throw new Error('the core refused')
    return answers[path] ?? {}
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

const pin = (id: string, title: string) => ({
  id,
  title,
  link: null,
  image: `https://i.pinimg.com/600x/${id}.jpg`,
  width: 600,
  height: 900,
})
const TACOS = {
  id: '111',
  name: 'Tacos',
  url: 'https://www.pinterest.com/brand.pins/tacos/',
  pins: [pin('p1', 'Tacos at dusk')],
}
const SALSA = {
  id: '222',
  name: 'Salsa',
  url: 'https://www.pinterest.com/brand.pins/salsa/',
  pins: [pin('p2', 'Green salsa')],
}

const current: BrandState = {
  brand: { id: 'casa-vostra', name: 'Casa Vostra' },
  ideas: [],
  connections: [{ key: 'pinterest', status: 'connected' }],
  pinterest: { username: 'brand.pins' },
  moodboard: { boards: [], posts: [] },
}

function openMoodboard() {
  render(
    <BrandProvider>
      <IdeatePage />
    </BrandProvider>,
  )
  act(() => hydrate.fn('casa-vostra', current))
}

const folders = () => screen.getByRole('tablist', { name: 'Folders' })

describe('the moodboard’s Pinterest boards on the core', () => {
  it('shows each board as a chip that its × removes in one click', async () => {
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [TACOS, SALSA] }
    openMoodboard()
    // Three dots while Pinterest's pins are on their way, gone once they come.
    expect(screen.getByRole('status', { name: 'Loading the moodboard' })).toBeVisible()
    await waitFor(() => expect(within(folders()).getByRole('tab', { name: /Tacos/ })).toBeVisible())
    expect(screen.queryByRole('status', { name: 'Loading the moodboard' })).toBeNull()
    expect(within(folders()).getByRole('tab', { name: /Salsa/ })).toBeVisible()
    // "All" holds the pins of both boards.
    expect(screen.getByRole('checkbox', { name: /Tacos at dusk/ })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /Green salsa/ })).toBeVisible()

    // A removal the core refuses puts the board and its pins back.
    refused.add('PUT /brands/casa-vostra/pinterest')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    await waitFor(() => expect(within(folders()).getByRole('tab', { name: /Tacos/ })).toBeVisible())
    expect(screen.getByRole('checkbox', { name: /Tacos at dusk/ })).toBeVisible()
    refused.clear()

    // The × takes the board and its pins off at once, then sends the list without it. The other
    // board keeps the pins it has: nothing is read from Pinterest again.
    const reads = () => sends.filter(([, path]) => path.endsWith('/pinterest/pins')).length
    const before = reads()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    expect(within(folders()).queryByRole('tab', { name: /Tacos/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Tacos at dusk/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Green salsa/ })).toBeVisible()
    await waitFor(() =>
      expect(sends).toContainEqual(['PUT', '/brands/casa-vostra/pinterest', { boardIds: ['222'] }]),
    )
    expect(reads()).toBe(before)
    expect(within(folders()).getByRole('tab', { name: /Salsa/ })).toBeVisible()
  })

  it('opens the board picker from the "+", with the boards read now ticked, and saves the change', async () => {
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [SALSA] }
    answers['/brands/casa-vostra/pinterest'] = {
      account: { username: 'brand.pins' },
      boards: [
        { id: '111', name: 'Tacos', pinCount: 1, cover: null, url: TACOS.url, picked: false },
        { id: '222', name: 'Salsa', pinCount: 1, cover: null, url: SALSA.url, picked: true },
      ],
    }
    openMoodboard()
    fireEvent.click(await screen.findByRole('button', { name: 'Pinterest boards' }))
    // Rows the shape of the boards stand in until the first read answers.
    expect(screen.getByLabelText('Loading boards')).toBeVisible()
    const boards = await screen.findByRole('group', { name: 'Boards' })
    const salsa = within(boards).getByRole('checkbox', { name: /Salsa/ })
    const tacos = within(boards).getByRole('checkbox', { name: /Tacos/ })
    expect(salsa).toHaveAttribute('aria-checked', 'true')
    expect(tacos).toHaveAttribute('aria-checked', 'false')
    // The board on the moodboard comes first, under its own heading, though the account lists
    // Tacos first.
    const order = within(boards)
      .getAllByRole('checkbox')
      .map((c) => c.textContent)
    expect(order[0]).toMatch(/Salsa/)
    expect(within(boards).getByText('On the moodboard')).toBeVisible()
    expect(within(boards).getByText('Other boards')).toBeVisible()
    // Two boards need no search.
    expect(screen.queryByRole('searchbox', { name: 'Search boards' })).toBeNull()
    // Each row opens its board on Pinterest, beside the checkbox: opening it ticks nothing.
    const open = within(boards).getByRole('link', { name: 'Open Tacos on Pinterest' })
    expect(open).toHaveAttribute('href', TACOS.url)
    expect(open).toHaveAttribute('target', '_blank')
    expect(tacos).not.toContainElement(open)
    // Nothing changed yet: nothing to save.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.click(tacos)
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [TACOS, SALSA] }
    const loadsBefore = loads.n
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // Saved in the account's order.
    await waitFor(() =>
      expect(sends).toContainEqual([
        'PUT',
        '/brands/casa-vostra/pinterest',
        { boardIds: ['111', '222'] },
      ]),
    )
    // The picker closes, and both boards show: the new board's pins join the ones on screen, with
    // no reload of the brand.
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Boards' })).toBeNull())
    await waitFor(() => expect(within(folders()).getByRole('tab', { name: /Tacos/ })).toBeVisible())
    expect(screen.getByRole('checkbox', { name: /Tacos at dusk/ })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /Green salsa/ })).toBeVisible()
    expect(loads.n).toBe(loadsBefore)

    // Opened again, the picker shows the boards at once, the saved one ticked.
    answers['/brands/casa-vostra/pinterest'] = {
      account: { username: 'brand.pins' },
      boards: [
        { id: '111', name: 'Tacos', pinCount: 1, cover: null, url: TACOS.url, picked: true },
        { id: '222', name: 'Salsa', pinCount: 1, cover: null, url: SALSA.url, picked: true },
      ],
    }
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest boards' }))
    const again = screen.getByRole('group', { name: 'Boards' })
    expect(within(again).getByRole('checkbox', { name: /Tacos/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // A board removed by its chip's × since then opens unticked, so a Save cannot bring it back.
    // The read on that open has kept Tacos ticked by then.
    await waitFor(() =>
      expect(sends.filter(([, p]) => p === '/brands/casa-vostra/pinterest').length).toBeGreaterThan(
        2,
      ),
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    answers['/brands/casa-vostra/pinterest'] = {
      account: { username: 'brand.pins' },
      boards: [
        { id: '111', name: 'Tacos', pinCount: 1, cover: null, url: TACOS.url, picked: false },
        { id: '222', name: 'Salsa', pinCount: 1, cover: null, url: SALSA.url, picked: true },
      ],
    }
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    await waitFor(() =>
      expect(sends).toContainEqual(['PUT', '/brands/casa-vostra/pinterest', { boardIds: ['222'] }]),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pinterest boards' }))
    const after = screen.getByRole('group', { name: 'Boards' })
    expect(within(after).getByRole('checkbox', { name: /Tacos/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('searches an account with many boards by name', async () => {
    const names = ['Tacos', 'Salsa', 'Margaritas', 'Patio', 'Staff', 'Desserts', 'Brunch']
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [SALSA] }
    answers['/brands/casa-vostra/pinterest'] = {
      account: { username: 'brand.pins' },
      boards: names.map((name, i) => ({
        id: String(i),
        name,
        pinCount: 3,
        cover: null,
        url: `https://www.pinterest.com/brand.pins/${name.toLowerCase()}/`,
        picked: name === 'Salsa',
      })),
    }
    openMoodboard()
    fireEvent.click(await screen.findByRole('button', { name: 'Pinterest boards' }))
    // The setup kept from before opens first; the search comes with this account's read.
    const search = await screen.findByRole('searchbox', { name: 'Search boards' })
    const boards = screen.getByRole('group', { name: 'Boards' })

    fireEvent.change(search, { target: { value: 'sa' } })
    expect(
      within(boards)
        .getAllByRole('checkbox')
        .map((c) => c.textContent),
    ).toEqual([expect.stringMatching(/Salsa/)])
    fireEvent.change(search, { target: { value: 'bru' } })
    expect(within(boards).getByRole('checkbox', { name: /Brunch/ })).toBeVisible()
    expect(within(boards).queryByRole('checkbox', { name: /Salsa/ })).toBeNull()
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(within(boards).getByText('No boards match “zzz”.')).toBeVisible()

    // Escape clears the search first and keeps the picker open; a second Escape closes it.
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
    const open = screen.getByRole('group', { name: 'Boards' })
    expect(within(open).getAllByRole('checkbox')).toHaveLength(names.length)
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Boards' })).toBeNull()
  })
})
