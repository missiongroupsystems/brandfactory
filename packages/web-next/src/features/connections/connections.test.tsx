import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrandId } from '@/data/brands'
import { CONNECTIONS } from '@/data/connections'
import { LINKED } from '@/data/publish'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { Composer } from '@/features/publish/composer'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import { ShootPage } from '@/features/shoot/shoot-page'
import { resetShoots } from '@/features/shoot/shoots-store'

import { CONNECT_DELAY, CONNECTED_HOLD, LEAVE } from './connect-sheet'
import { ConnectionsPage } from './connections-page'
import { resetConnections } from './connections-store'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand/connections',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

// jsdom has no matchMedia: every test here sees the desktop layout.
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))

beforeEach(() => {
  resetConnections()
  resetIdeas()
  resetShoots()
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

/** Renders as the given brand, once the switch has happened. */
function As({ id, children }: { id: BrandId; children: React.ReactNode }) {
  const { brand, setBrandId } = useBrand()
  React.useEffect(() => setBrandId(id), [id, setBrandId])
  return brand.id === id ? children : null
}

const show = (ui: React.ReactNode, id: BrandId = 'casa-vostra') =>
  render(
    <BrandProvider>
      <As id={id}>{ui}</As>
    </BrandProvider>,
  )

const allow = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
  act(() => {
    vi.advanceTimersByTime(CONNECT_DELAY)
  })
  // The sheet shows it worked before it closes.
  expect(screen.getByRole('heading', { name: /connected$/ })).toBeInTheDocument()
  act(() => {
    vi.advanceTimersByTime(CONNECTED_HOLD)
  })
  // Then the card goes, and only after that does the next step open.
  expect(screen.getByRole('dialog', { name: /connected$/ })).toBeInTheDocument()
  act(() => {
    vi.advanceTimersByTime(LEAVE)
  })
}

const instagram = () => screen.queryByRole('checkbox', { name: /Instagram/ })

describe('the seed', () => {
  it('starts every brand on the accounts the composer always had', () => {
    // Nothing may change by default: the publishing accounts are `LINKED`, unchanged.
    for (const [id, keys] of Object.entries(LINKED) as Array<[BrandId, string[]]>) {
      for (const k of ['ig', 'tt', 'fb'] as const) {
        expect(CONNECTIONS[id][k] === 'connected').toBe(keys.includes(k))
      }
    }
  })

  it('keeps Lark and Drive linked for the brand the demo opens on', () => {
    expect(CONNECTIONS['casa-vostra'].lark).toBe('connected')
    expect(CONNECTIONS['casa-vostra'].drive).toBe('connected')
  })
})

describe('the Connections page', () => {
  it('takes a disconnected account out of the composer, and a connected one puts it back', () => {
    const before = show(<Composer />)
    expect(instagram()).toBeInTheDocument()
    before.unmount()

    const page = show(<ConnectionsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'More for Instagram' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    expect(screen.getByRole('button', { name: 'Connect Instagram' })).toBeInTheDocument()
    page.unmount()

    const composer = show(<Composer />)
    expect(instagram()).toBeNull()
    expect(screen.getByRole('checkbox', { name: /TikTok/ })).toBeInTheDocument()
    composer.unmount()

    show(<ConnectionsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect Instagram' }))
    expect(screen.getByRole('dialog', { name: 'Connect Instagram' })).toBeInTheDocument()
    allow()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'More for Instagram' })).toBeInTheDocument()
  })

  it('links nothing when the sign-in is cancelled', () => {
    show(<ConnectionsPage />, 'carlitos')
    fireEvent.click(screen.getByRole('button', { name: 'Connect Google Drive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => {
      vi.advanceTimersByTime(CONNECT_DELAY)
    })
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
  })
})

describe('first-time Google Drive', () => {
  it('asks a brand without Drive to connect it, then opens the picker', () => {
    show(<Composer />, 'carlitos')
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }))
    expect(screen.getByRole('dialog', { name: 'Connect Google Drive' })).toBeInTheDocument()
    allow()
    expect(screen.getByRole('dialog', { name: 'Google Drive' })).toBeInTheDocument()
  })

  it('still opens the picker when the sheet is closed while it shows it worked', () => {
    show(<Composer />, 'carlitos')
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    act(() => {
      vi.advanceTimersByTime(CONNECT_DELAY)
    })
    // Drive is linked by now: an early Escape must not strand the user with no picker.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Google Drive' })).toBeInTheDocument()
  })

  it('opens the picker at once where Drive is linked', () => {
    show(<Composer />)
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }))
    expect(screen.getByRole('dialog', { name: 'Google Drive' })).toBeInTheDocument()
  })
})

describe('first-time Lark calendar', () => {
  it('asks to connect Lark before the invites go out, then sends them', () => {
    show(<ShootPage id="ca-shoot-joo-chiat" />, 'carlitos')
    expect(screen.queryByText('Synced with Lark')).toBeNull()
    expect(screen.getByRole('button', { name: 'Connect Lark calendar' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send Lark invites' }))
    expect(screen.getByRole('dialog', { name: 'Connect Lark calendar' })).toBeInTheDocument()
    allow()
    expect(screen.queryByRole('button', { name: 'Connect Lark calendar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Invites sent' })).toBeDisabled()
  })

  it('keeps the shoot flow as it was where Lark is linked', () => {
    show(<ShootPage id="cv-shoot-raffles" />)
    // Linked is the normal state: no "Synced with Lark" line, and no way to connect it again.
    expect(screen.queryByText('Synced with Lark')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect Lark calendar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send Lark invites' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Invites sent' })).toBeDisabled()
  })
})
