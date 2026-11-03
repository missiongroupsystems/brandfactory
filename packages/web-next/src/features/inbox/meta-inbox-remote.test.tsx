import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { InboxPage } from './inbox-page'
import { resetInbox } from './inbox-store'

// On the core, with a comment and a DM that came through Meta's webhook. The inbox store gets the
// brand's state; requests are kept and answered at once.
const hydrators = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
const requests = vi.hoisted(() => [] as string[])
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if ((new Error().stack ?? '').includes('inbox-store')) hydrators.push(h)
    return () => undefined
  },
  onAccount: () => () => undefined,
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  request: async (method: string, path: string) => {
    requests.push(`${method} ${path}`)
    return {}
  },
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

const row = (id: string, kind: 'comment' | 'dm', fromName: string, text: string) => ({
  id,
  platform: 'ig',
  kind,
  fromName,
  fromHandle: kind === 'comment' ? `@${fromName}` : '',
  text,
  receivedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  doneAt: null,
  sentTo: [],
  external: true,
})

const load = () =>
  act(() =>
    hydrators[0]!('casa-vostra', {
      brand: { id: 'casa-vostra' },
      inbox: {
        people: [],
        messages: [
          row('meta-dm', 'dm', 'Instagram user', 'A table at 8 tonight?'),
          row('meta-comment', 'comment', 'guest', 'Do you do takeaway?'),
        ],
      },
    }),
  )

beforeEach(() => {
  act(() => resetInbox())
  requests.length = 0
})

describe('comments and DMs from Instagram and Facebook on the core', () => {
  it('shows them, sends a reply to Meta, and hides a comment there', async () => {
    render(
      <BrandProvider>
        <InboxPage />
      </BrandProvider>,
    )
    load()
    fireEvent.click(screen.getByRole('button', { name: /Do you do takeaway/ }))
    // No AI replies for a real message: the team writes its own.
    const box = await screen.findByPlaceholderText('Write a reply')
    fireEvent.change(box, { target: { value: 'Yes, from 6pm.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(requests).toContain('POST /brands/casa-vostra/inbox/meta-comment/meta-reply'),
    )
    fireEvent.click(screen.getByRole('button', { name: /A table at 8/ }))
    // A DM cannot be hidden: only comments can.
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull()
  })

  it('hides a comment on the platform', async () => {
    render(
      <BrandProvider>
        <InboxPage />
      </BrandProvider>,
    )
    load()
    fireEvent.click(screen.getByRole('button', { name: /Do you do takeaway/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hide' }))
    await waitFor(() =>
      expect(requests).toContain('POST /brands/casa-vostra/inbox/meta-comment/meta-hide'),
    )
  })
})
