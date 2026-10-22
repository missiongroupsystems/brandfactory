import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { InboxPage } from './inbox-page'

// On the core. The inbox store asks for each brand's state when it loads; the test hands that
// state to it, and only to it (the other stores read other parts).
const hydrators = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
const linkers = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    const stack = new Error().stack ?? ''
    if (stack.includes('inbox-store')) hydrators.push(h)
    if (stack.includes('connections-store')) linkers.push(h)
    return () => undefined
  },
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ push: vi.fn() }),
}))
if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

const inboxStore = hydrators[0]!
const load = (ids: string[]) =>
  act(() =>
    inboxStore('casa-vostra', {
      brand: { id: 'casa-vostra' },
      inbox: { people: [], messages: ids.map((id) => ({ id, doneAt: null, sentTo: [] })) },
    }),
  )

const page = () =>
  render(
    <BrandProvider>
      <InboxPage />
    </BrandProvider>,
  )

describe('the inbox on the core', () => {
  it('shows none of the demo messages, and no count, for a brand the server holds none for', () => {
    page()
    load([])
    expect(screen.queryByRole('button', { name: /Rachel Tan/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Inbox/ }).textContent).toBe('Inbox')
  })

  it('shows a message the server holds', () => {
    page()
    load(['cv-soggy-pizza'])
    expect(screen.getByRole('button', { name: /Rachel Tan/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Inbox/ }).textContent).toBe('Inbox1')
  })

  it('asks for Instagram, not "All caught up", while no account is connected', () => {
    page()
    load([])
    // Production's brands have no account connected yet: nothing can arrive to be caught up on.
    act(() => linkers[0]!('casa-vostra', { brand: { id: 'casa-vostra' }, connections: [] }))
    expect(screen.queryByText('All caught up')).toBeNull()
    expect(screen.getByRole('link', { name: 'Connect Instagram' })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
  })
})
