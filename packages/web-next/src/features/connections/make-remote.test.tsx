import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { ConnectionsPage } from './connections-page'
import { resetMake } from './make'
import { notAvailable } from './not-available'

// On the core, with the server posting to Instagram and Facebook through Make, and nothing else.
const requests = vi.hoisted(() => [] as Array<{ call: string; body?: unknown }>)
const server = vi.hoisted(() => ({ refuse: null as string | null, reloaded: [] as string[] }))
const states = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  platformOn: (p: string) => p === 'instagram' || p === 'facebook',
  request: async (method: string, path: string, body?: unknown) => {
    requests.push({ call: `${method} ${path}`, ...(body !== undefined && { body }) })
    if (server.refuse) throw new Error(server.refuse)
    return {}
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

describe('Instagram and Facebook on Connections, through Make', () => {
  it('turns on posting only: for the inbox and the moodboard they stay not set up', () => {
    expect(notAvailable('ig')).toBe(true)
    expect(notAvailable('fb')).toBe(true)
  })

  it('links Instagram by its id and name, then reloads the brand', async () => {
    page()
    const ig = row('Instagram')
    expect(within(ig).getByText('Posts and reels')).toBeInTheDocument()
    fireEvent.click(within(ig).getByRole('button', { name: 'Connect Instagram' }))
    const sheet = screen.getByRole('dialog', { name: 'Connect Instagram' })
    const connect = within(sheet).getByRole('button', { name: 'Connect' })
    // Nothing goes until the id is a number and the name is there.
    fireEvent.click(connect)
    expect(requests).toEqual([])
    fireEvent.change(within(sheet).getByLabelText('Instagram account ID'), {
      target: { value: '17841 400000 000001' },
    })
    fireEvent.change(within(sheet).getByLabelText('Handle'), { target: { value: '@casavostra' } })
    fireEvent.click(connect)
    await waitFor(() =>
      expect(requests).toEqual([
        {
          call: 'PUT /brands/casa-vostra/make/instagram',
          body: { accountId: '17841400000000001', name: '@casavostra' },
        },
      ]),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(server.reloaded).toEqual(['casa-vostra'])
  })

  it('keeps the sheet open with the server’s words when it refuses', async () => {
    server.refuse = 'only the company’s owners and admins link Instagram and Facebook'
    page()
    fireEvent.click(within(row('Facebook')).getByRole('button', { name: 'Connect Facebook' }))
    const sheet = screen.getByRole('dialog', { name: 'Connect Facebook' })
    fireEvent.change(within(sheet).getByLabelText('Page ID'), {
      target: { value: '100000000000001' },
    })
    fireEvent.change(within(sheet).getByLabelText('Page name'), { target: { value: 'Casa' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Connect' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Only the company’s owners and admins link Instagram and Facebook.',
    )
  })

  it('shows the linked accounts by name, and forgets one on the server', async () => {
    page()
    linked({
      instagram: { name: '@casavostra', accountId: '17841400000000001' },
      facebook: { name: 'Casa Vostra', accountId: '100000000000001' },
    })
    expect(within(row('Instagram')).getByText('@casavostra')).toBeInTheDocument()
    expect(within(row('Facebook')).getByText('Casa Vostra')).toBeInTheDocument()
    fireEvent.click(within(row('Instagram')).getByRole('button', { name: 'More for Instagram' }))
    expect(screen.getByRole('menuitem', { name: 'Change' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    await waitFor(() =>
      expect(requests).toEqual([{ call: 'DELETE /brands/casa-vostra/make/instagram' }]),
    )
    expect(
      within(row('Instagram')).getByRole('button', { name: 'Connect Instagram' }),
    ).toBeInTheDocument()
    expect(server.reloaded).toEqual(['casa-vostra'])
  })
})
