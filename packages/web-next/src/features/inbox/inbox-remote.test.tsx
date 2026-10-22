import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { InboxPage } from './inbox-page'

// On the core. The inbox store asks for each brand's state when it loads; the test hands that
// state to it, and only to it (the other stores read other parts).
const hydrators = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if (new Error().stack?.includes('inbox-store')) hydrators.push(h)
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
})
