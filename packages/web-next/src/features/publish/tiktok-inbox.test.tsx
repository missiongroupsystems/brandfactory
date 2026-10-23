import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'
import { resetTikTok } from '@/features/connections/tiktok'
import type * as Remote from '@/lib/remote'

import { TikTokInbox } from './tiktok-inbox'

// On the core with the TikTok app set up. The server answers a send with `answer`.
const requests = vi.hoisted(() => [] as string[])
const answer = vi.hoisted(() => ({ value: {} as unknown, poll: null as unknown }))
const states = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  platformOn: (p: string) => p === 'tiktok',
  request: async (method: string, path: string) => {
    requests.push(`${method} ${path}`)
    if (method === 'GET') {
      if (answer.poll instanceof Error) throw answer.poll
      return answer.poll
    }
    return answer.value
  },
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if (new Error().stack?.includes('connections/tiktok.ts')) states.push(h)
    return () => undefined
  },
}))
// The brand and its calendar: every post but `unplanned` has a day.
vi.mock('@/features/schedule/posts-store', () => ({
  useBrand: () => ({ brand: { id: 'casa', name: 'Casa' }, weeks: [] }),
}))
vi.mock('@/features/schedule/move-post', () => ({
  dayOf: (_w: unknown, id: string) => (id === 'unplanned' ? null : '2026-10-12'),
}))

const POST: Post = {
  id: 'p1',
  format: 'reel',
  hook: 'Pasta',
  images: ['https://core.test/files/sig/brandbase/a.mp4#video'],
  stage: 'scheduled',
  slot: 'Mon 12 Oct, 18:00',
  slotShort: 'Mon, 18:00',
  channels: ['ig', 'tt'],
}

const state = (s: Partial<Remote.BrandState>) =>
  act(() => states[0]!('casa', { brand: { id: 'casa' }, ...s }))
const account = { name: 'Casa Vostra', avatar: null }

afterEach(() => {
  requests.length = 0
  act(() => resetTikTok())
})

describe('Send to TikTok inbox', () => {
  it('sends a planned video to the inbox, says the team finishes it in TikTok, then that it is there', async () => {
    render(<TikTokInbox post={POST} />)
    state({ tiktok: account, tiktokSends: [] })
    expect(
      screen.getByText(
        'Sends the video to Casa Vostra’s TikTok inbox as a draft. Your team finishes the post in the TikTok app.',
      ),
    ).toBeInTheDocument()
    answer.value = { postId: 'p1', status: 'sent', reason: null, updatedAt: 'x' }
    fireEvent.click(screen.getByRole('button', { name: 'Send to TikTok inbox' }))
    expect(
      await screen.findByText('Sent to your TikTok inbox. Open TikTok to post it.'),
    ).toBeInTheDocument()
    expect(requests).toEqual(['POST /brands/casa/posts/p1/tiktok'])
    expect(screen.queryByRole('button', { name: 'Send to TikTok inbox' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
  })

  it("shows TikTok's refusal in words, with Try again", async () => {
    render(<TikTokInbox post={POST} />)
    state({
      tiktok: account,
      tiktokSends: [{ postId: 'p1', status: 'failed', reason: 'TikTok holds at most 5 drafts.' }],
    })
    expect(screen.getByText('TikTok holds at most 5 drafts.')).toBeInTheDocument()
    answer.value = { postId: 'p1', status: 'processing', reason: null, updatedAt: 'x' }
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Sending to TikTok…')).toBeInTheDocument())
  })

  it('ends the wait with words when a status check fails, so the card never hangs on Sending', async () => {
    vi.useFakeTimers()
    try {
      render(<TikTokInbox post={{ ...POST, id: 'p2' }} />)
      state({ tiktok: account, tiktokSends: [] })
      answer.value = { postId: 'p2', status: 'processing', reason: null, updatedAt: 'x' }
      answer.poll = new Error('TikTok did not answer')
      fireEvent.click(screen.getByRole('button', { name: 'Send to TikTok inbox' }))
      await act(() => vi.advanceTimersByTimeAsync(5000))
      expect(screen.getByText('TikTok did not answer')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    } finally {
      answer.poll = null
      vi.useRealTimers()
    }
  })

  it('says TikTok has not confirmed after three minutes of processing, and offers to send again', async () => {
    vi.useFakeTimers()
    try {
      render(<TikTokInbox post={{ ...POST, id: 'p3' }} />)
      state({ tiktok: account, tiktokSends: [] })
      answer.value = { postId: 'p3', status: 'processing', reason: null, updatedAt: 'x' }
      answer.poll = answer.value
      fireEvent.click(screen.getByRole('button', { name: 'Send to TikTok inbox' }))
      await act(() => vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 5000))
      expect(screen.getByText(/TikTok has not confirmed the draft yet/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    } finally {
      answer.poll = null
      vi.useRealTimers()
    }
  })

  it('reads an upload the server never finished as failed after 30 minutes', () => {
    render(<TikTokInbox post={POST} />)
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    state({
      tiktok: account,
      tiktokSends: [{ postId: 'p1', status: 'uploading', reason: null, updatedAt: old }],
    })
    expect(screen.getByText('The last send did not finish. Send it again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('asks to connect TikTok first, and to add a video', () => {
    const { rerender } = render(<TikTokInbox post={POST} />)
    state({ tiktok: null })
    expect(screen.getByRole('link', { name: 'Connect TikTok' })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
    state({ tiktok: account })
    rerender(<TikTokInbox post={{ ...POST, format: 'carousel', images: ['a.jpg#photo'] }} />)
    expect(screen.getByRole('button', { name: 'Needs a video' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send to TikTok inbox' })).toBeNull()
  })

  it('shows nothing for a post not on TikTok, not on the calendar, or posted', () => {
    for (const post of [
      { ...POST, channels: ['ig' as const] },
      { ...POST, id: 'unplanned' },
      { ...POST, stage: 'posted' as const },
    ]) {
      const { container, unmount } = render(<TikTokInbox post={post} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })
})
