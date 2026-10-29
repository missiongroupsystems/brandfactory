import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type { BrandState } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { IdeatePage } from './ideate-page'

// On the core, with Pinterest set up: the moodboard reads every board the brand picked. Each board
// is a chip with a × that asks before it removes the board, and the "+" opens the board picker with
// the boards read now ticked, each with a link to open it on Pinterest.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'https://core.test'
})
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
  // The brand reloads after a change: the state the test set last comes back.
  loadBrand: async (id: string) => hydrate.fn(id, current),
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  report: () => undefined,
  request: async (method: string, path: string, body?: unknown) => {
    sends.push([method, path, body])
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
  it('shows each board as a chip that removes it only once confirmed', async () => {
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [TACOS, SALSA] }
    openMoodboard()
    await waitFor(() => expect(within(folders()).getByRole('tab', { name: /Tacos/ })).toBeVisible())
    expect(within(folders()).getByRole('tab', { name: /Salsa/ })).toBeVisible()
    // "All" holds the pins of both boards.
    expect(screen.getByRole('checkbox', { name: /Tacos at dusk/ })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /Green salsa/ })).toBeVisible()

    // The × asks first: the chip reads "Remove Tacos?" and nothing is sent. Escape keeps the board.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    expect(within(folders()).getByRole('tab', { name: 'Remove Tacos?' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(folders()).getByRole('tab', { name: /^Tacos$/ })).toBeVisible()
    // A press elsewhere keeps it too.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('button', { name: 'Yes, remove Tacos' })).toBeNull()
    // A mouse leaving the chip keeps the board; a finger lifting off it does not cancel.
    const chip = () => within(folders()).getByRole('tab', { name: /Tacos/ }).parentElement!
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    fireEvent.pointerLeave(chip(), { pointerType: 'touch' })
    expect(screen.getByRole('button', { name: 'Yes, remove Tacos' })).toBeVisible()
    fireEvent.pointerLeave(chip(), { pointerType: 'mouse' })
    expect(screen.queryByRole('button', { name: 'Yes, remove Tacos' })).toBeNull()
    // Pressing the chip's label while it asks keeps the board and does not open it.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    fireEvent.click(within(folders()).getByRole('tab', { name: 'Remove Tacos?' }))
    expect(within(folders()).getByRole('tab', { name: /^Tacos$/ })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(sends.some(([method]) => method === 'PUT')).toBe(false)

    // The ✓ sends the list without the board; the moodboard reads the rest afresh.
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [SALSA] }
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tacos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove Tacos' }))
    await waitFor(() =>
      expect(sends).toContainEqual(['PUT', '/brands/casa-vostra/pinterest', { boardIds: ['222'] }]),
    )
    await waitFor(() => expect(within(folders()).queryByRole('tab', { name: /Tacos/ })).toBeNull())
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
    const boards = await screen.findByRole('group', { name: 'Boards' })
    const salsa = within(boards).getByRole('checkbox', { name: /Salsa/ })
    const tacos = within(boards).getByRole('checkbox', { name: /Tacos/ })
    expect(salsa).toHaveAttribute('aria-checked', 'true')
    expect(tacos).toHaveAttribute('aria-checked', 'false')
    // Each row opens its board on Pinterest, beside the checkbox: opening it ticks nothing.
    const open = within(boards).getByRole('link', { name: 'Open Tacos on Pinterest' })
    expect(open).toHaveAttribute('href', TACOS.url)
    expect(open).toHaveAttribute('target', '_blank')
    expect(tacos).not.toContainElement(open)
    // Nothing changed yet: nothing to save.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.click(tacos)
    answers['/brands/casa-vostra/pinterest/pins'] = { boards: [TACOS, SALSA] }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // Saved in the account's order.
    await waitFor(() =>
      expect(sends).toContainEqual([
        'PUT',
        '/brands/casa-vostra/pinterest',
        { boardIds: ['111', '222'] },
      ]),
    )
    // The picker closes, and both boards show.
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Boards' })).toBeNull())
    await waitFor(() => expect(within(folders()).getByRole('tab', { name: /Tacos/ })).toBeVisible())
  })
})
