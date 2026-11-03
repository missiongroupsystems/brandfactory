import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { MetaReturn } from './meta-return'

// The server answers the person's Pages, then links the one picked.
const replace = vi.hoisted(() => vi.fn())
const requests = vi.hoisted(() => [] as { call: string; body: unknown }[])
const pages = vi.hoisted(() => ({
  list: [] as { id: string; name: string; igUsername: string | null }[],
}))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  request: async (method: string, path: string, body?: unknown) => {
    requests.push({ call: `${method} ${path}`, body })
    if (path === '/meta/callback') return { brandId: 'casa', choice: 'sealed', pages: pages.list }
    return {}
  },
  loadBrand: async () => ({}),
}))
vi.mock('@/features/schedule/posts-store', () => ({ useBrand: () => ({ setBrandId: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

beforeEach(() => {
  requests.length = 0
  replace.mockClear()
})

describe('the page Facebook returns to', () => {
  it('links the only Page at once, then opens Connections', async () => {
    pages.list = [{ id: '1001', name: 'Casa Vostra', igUsername: 'casavostra' }]
    render(<MetaReturn code="c" state="s" declined={null} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/brand/connections'))
    expect(requests).toEqual([
      { call: 'POST /meta/callback', body: { code: 'c', state: 's' } },
      { call: 'POST /meta/select', body: { choice: 'sealed', pageId: '1001' } },
    ])
  })

  it('asks which Page is the brand’s when there are several, and links the one picked', async () => {
    pages.list = [
      { id: '1001', name: 'Casa Vostra', igUsername: 'casavostra' },
      { id: '1002', name: 'Casa Events', igUsername: null },
    ]
    render(<MetaReturn code="c" state="s" declined={null} />)
    expect(await screen.findByText('Which Page is this brand’s?')).toBeInTheDocument()
    expect(screen.getByText('No Instagram account')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Casa Events'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/brand/connections'))
    expect(requests[1]).toEqual({
      call: 'POST /meta/select',
      body: { choice: 'sealed', pageId: '1002' },
    })
  })

  it('shows Facebook’s reason when the sign-in was declined, and sends no code', () => {
    render(<MetaReturn code={null} state="s" declined="Access was not allowed on Facebook." />)
    expect(
      screen.getByText('Facebook was not connected. Access was not allowed on Facebook.'),
    ).toBeInTheDocument()
    expect(requests).toEqual([])
  })
})
