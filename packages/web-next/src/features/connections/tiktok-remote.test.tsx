import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { ConnectionsPage } from './connections-page'
import { resetTikTok } from './tiktok'

// On the core, with the server's TikTok app set up (`GET /platforms` says tiktok) and no other.
const requests = vi.hoisted(() => [] as string[])
const server = vi.hoisted(() => ({ refuseDelete: false, reloaded: [] as string[] }))
const states = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  platformOn: (p: string) => p === 'tiktok',
  request: async (method: string, path: string) => {
    requests.push(`${method} ${path}`)
    if (method === 'DELETE' && server.refuseDelete) throw new Error('TikTok did not answer')
    if (path.endsWith('/tiktok/connect'))
      return { url: 'https://www.tiktok.com/v2/auth/authorize/?x' }
    return {}
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  loadBrand: async (brandId: string) => {
    server.reloaded.push(brandId)
  },
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if (new Error().stack?.includes('connections/tiktok.ts')) states.push(h)
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
const linked = (account: { name: string; avatar: string | null } | null) =>
  act(() => states[0]!('casa-vostra', { brand: { id: 'casa-vostra' }, tiktok: account }))

afterEach(() => {
  requests.length = 0
  act(() => resetTikTok())
})

describe('TikTok on Connections, upload only', () => {
  it('offers a real Connect for TikTok alone, and keeps Instagram and Facebook unavailable', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    page()
    const tt = row('TikTok')
    expect(within(tt).getByText('Videos to the TikTok inbox')).toBeInTheDocument()
    expect(within(tt).queryByRole('button', { name: 'Unavailable' })).toBeNull()
    fireEvent.click(within(tt).getByRole('button', { name: 'Connect TikTok' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('tiktok.com')))
    expect(requests).toEqual(['POST /brands/casa-vostra/tiktok/connect'])
    for (const name of ['Instagram', 'Facebook']) {
      expect(within(row(name)).getByRole('button', { name: 'Unavailable' })).toBeInTheDocument()
    }
    vi.unstubAllGlobals()
  })

  it('shows the linked account by its name and picture, and disconnects it on the server', async () => {
    page()
    linked({ name: 'Casa Vostra', avatar: 'https://p16.tiktokcdn.test/casa.jpeg' })
    const tt = row('TikTok')
    expect(within(tt).getByText('Casa Vostra')).toBeInTheDocument()
    expect(tt.querySelector('img')).toHaveAttribute('src', 'https://p16.tiktokcdn.test/casa.jpeg')
    fireEvent.click(within(tt).getByRole('button', { name: 'More for TikTok' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    await waitFor(() => expect(requests).toEqual(['DELETE /brands/casa-vostra/tiktok']))
    expect(
      within(row('TikTok')).getByRole('button', { name: 'Connect TikTok' }),
    ).toBeInTheDocument()
  })

  it('reloads the brand from the server when a disconnect fails, so the row is not shown off by mistake', async () => {
    server.refuseDelete = true
    page()
    linked({ name: 'Casa Vostra', avatar: null })
    fireEvent.click(within(row('TikTok')).getByRole('button', { name: 'More for TikTok' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    await waitFor(() => expect(server.reloaded).toEqual(['casa-vostra']))
    server.refuseDelete = false
  })
})
