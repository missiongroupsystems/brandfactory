import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { ConnectionsPage } from './connections-page'
import { resetMake } from './make'

// On the core, with the server's own Meta app: Instagram and Facebook connect by Facebook's sign-in.
const requests = vi.hoisted(() => [] as Array<{ call: string; body?: unknown }>)
const server = vi.hoisted(() => ({ refuse: null as string | null, reloaded: [] as string[] }))
const states = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  platformOn: (p: string) => ['instagram', 'facebook', 'meta'].includes(p),
  request: async (method: string, path: string, body?: unknown) => {
    requests.push({ call: `${method} ${path}`, ...(body !== undefined && { body }) })
    if (server.refuse) throw new Error(server.refuse)
    return path.endsWith('/meta/connect') ? { url: 'https://www.facebook.com/dialog' } : {}
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  loadBrand: async (brandId: string) => {
    server.reloaded.push(brandId)
  },
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if (new Error().stack?.includes('connections/make.ts')) states.push(h)
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
const linked = (state: Partial<Remote.BrandState>) =>
  act(() => states[0]!('casa-vostra', { brand: { id: 'casa-vostra' }, ...state }))

afterEach(() => {
  requests.length = 0
  server.refuse = null
  server.reloaded.length = 0
  act(() => resetMake())
})

describe('Instagram and Facebook on Connections, through our own Meta app', () => {
  it('connects by Facebook’s sign-in, Stories included, with no sheet to type ids in', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    page()
    const ig = row('Instagram')
    expect(within(ig).getByText('Posts, reels and stories')).toBeInTheDocument()
    fireEvent.click(within(ig).getByRole('button', { name: 'Connect Instagram' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://www.facebook.com/dialog'))
    expect(requests).toEqual([{ call: 'POST /brands/casa-vostra/meta/connect' }])
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('forgets the Page and its Instagram account together, and a Make link on its own', async () => {
    page()
    linked({
      instagram: { name: 'casavostra', accountId: '17841400000000001', via: 'meta' },
      facebook: { name: 'Casa Vostra', accountId: '1001', via: 'make' },
    })
    fireEvent.click(within(row('Instagram')).getByRole('button', { name: 'More for Instagram' }))
    expect(screen.getByRole('menuitem', { name: 'Reconnect' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    await waitFor(() => expect(requests).toEqual([{ call: 'DELETE /brands/casa-vostra/meta' }]))
    fireEvent.click(within(row('Facebook')).getByRole('button', { name: 'More for Facebook' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    await waitFor(() =>
      expect(requests[1]).toEqual({ call: 'DELETE /brands/casa-vostra/make/facebook' }),
    )
  })
})
