import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { ConnectionCard } from '@/features/bubbles/cards/other-cards'
import { cardsFor } from '@/features/bubbles/cards/model'

import { ConnectSheet } from './connect-sheet'
import { ConnectionsPage } from './connections-page'
import { connect, useConnections } from './connections-store'

// On the core. Meta, TikTok and Pinterest have not given the app access yet, and the connect
// sheet's sign-in is a pretend one: no platform of theirs may read as connected.
const requests = vi.hoisted(() => [] as string[])
const linkers = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  request: async (method: string, path: string) => {
    requests.push(`${method} ${path}`)
    return {}
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if (new Error().stack?.includes('connections-store')) linkers.push(h)
    return () => undefined
  },
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/brand/connections',
  useRouter: () => ({ push: vi.fn() }),
}))

const page = () =>
  render(
    <BrandProvider>
      <ConnectionsPage />
    </BrandProvider>,
  )
const row = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li')!

describe('Connections on the core', () => {
  it('shows Instagram, TikTok, Facebook and Pinterest as not available, even one stored as connected', () => {
    page()
    act(() =>
      linkers[0]!('casa-vostra', {
        brand: { id: 'casa-vostra' },
        connections: [
          { key: 'ig', status: 'connected' },
          { key: 'pinterest', status: 'connected' },
        ],
      }),
    )
    for (const name of ['Instagram', 'TikTok', 'Facebook', 'Pinterest']) {
      const r = row(name)
      expect(within(r).getByRole('button', { name: 'Unavailable' })).toBeInTheDocument()
      expect(within(r).getByRole('tooltip')).toHaveTextContent(`${name} isn’t connected yet.`)
      expect(within(r).queryByRole('button', { name: new RegExp(`Connect|More for`) })).toBeNull()
    }
    // The other services fake their sign-in the same way: they wait too, in one short line.
    const drive = row('Google Drive')
    expect(within(drive).getByRole('tooltip').textContent).toBe('Google Drive isn’t connected yet.')
    expect(within(drive).queryByRole('button', { name: /Connect/ })).toBeNull()
  })

  it('keeps its reason open while the pointer moves onto it', () => {
    page()
    const card = within(row('Instagram')).getByRole('tooltip')
    expect(card.className).not.toContain('pointer-events-none')
    // A strip over the 8 px gap above it, so the pointer crosses to it without leaving the group.
    expect(card.className).toContain('before:-top-2')
  })

  it('opens its reason on a tap', () => {
    page()
    const pill = within(row('Instagram')).getByRole('button', { name: 'Unavailable' })
    fireEvent.click(pill)
    expect(within(row('Instagram')).getByRole('tooltip').className).not.toContain('invisible')
  })

  it("opens no pretend sign-in from elsewhere (the composer's Drive, the call sheet's Lark)", () => {
    render(
      <BrandProvider>
        <ConnectSheet source="drive" onClose={vi.fn()} />
      </BrandProvider>,
    )
    const sheet = screen.getByRole('dialog', { name: 'Google Drive isn’t connected' })
    expect(within(sheet).queryByRole('button', { name: 'Allow' })).toBeNull()
    // Allow is hidden: Close takes the focus, so it stays inside the dialog.
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Close' }))
    expect(within(sheet).queryByRole('list')).toBeNull()
  })

  it('closes its reason on a tap elsewhere, and hides it on Escape', () => {
    page()
    const r = row('Instagram')
    fireEvent.click(within(r).getByRole('button', { name: 'Unavailable' }))
    expect(within(r).getByRole('tooltip').className).not.toContain('invisible')
    fireEvent.pointerDown(document.body)
    expect(within(r).getByRole('tooltip').className).toContain('invisible')
    fireEvent.click(within(r).getByRole('button', { name: 'Unavailable' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(r).getByRole('tooltip').className).toContain('invisible')
    expect(within(r).getByRole('tooltip').className).not.toContain('group-hover')
  })

  it('draws no "Connected" in Bubbles when the agent sets a source connected', () => {
    const turn = {
      tools: [
        {
          id: 'c',
          tool: 'connection.set',
          input: { brand: 'casa-vostra', key: 'ig', status: 'connected' },
          ok: true,
        },
      ],
    }
    const [card] = cardsFor(turn as unknown as Parameters<typeof cardsFor>[0])
    expect(card!.verb).toBe('Unavailable')
    render(
      <BrandProvider>
        <ConnectionCard model={card!} index={0} />
      </BrandProvider>,
    )
    expect(screen.queryByText('Connected')).toBeNull()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
  })

  it('runs no pretend sign-in for them: nothing is stored as connected', () => {
    requests.length = 0
    for (const k of ['ig', 'tt', 'fb', 'pinterest', 'drive', 'lark'] as const)
      connect('casa-vostra', k)
    expect(requests).toEqual([])
    function Read() {
      const s = useConnections('casa-vostra')
      return <span>{[s.ig, s.tt, s.fb, s.pinterest, s.drive, s.lark].join(' ')}</span>
    }
    render(<Read />)
    expect(screen.getByText('off off off off off off')).toBeInTheDocument()
  })
})
