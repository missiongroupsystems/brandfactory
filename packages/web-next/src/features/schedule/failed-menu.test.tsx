import { act, fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'

const move = vi.hoisted(() => vi.fn<(id: string) => Promise<boolean>>())
vi.mock('./posts-store', () => ({ useMoveToDrafts: () => move }))

import { FailedPill, failedOn, isPartlyOut } from './failed-menu'

const post = (id: string, hook: string, slot: string): Post =>
  ({
    id,
    hook,
    slot,
    images: [],
    stage: 'failed',
    failedOn: 'ig',
    format: 'carousel',
  }) as unknown as Post

/** The schedule page's part: the store drops a post from the failed ones once it is a draft. */
function Page({ start }: { start: Post[] }) {
  const [posts, setPosts] = React.useState(start)
  move.mockImplementation(async (id) => {
    setPosts((all) => all.filter((p) => p.id !== id))
    return true
  })
  return <FailedPill posts={posts} />
}

beforeEach(() => move.mockReset())
afterEach(() => vi.useRealTimers())

describe('the failed mark beside the calendar title', () => {
  it('shows nothing when no post failed, on any brand', () => {
    const { container } = render(<FailedPill posts={[]} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/failed/)).toBeNull()
  })

  it('opens the list for one failed post too, so its × is in reach', () => {
    render(<FailedPill posts={[post('p1', 'Pasta night', 'Thu 12 Nov, 15:59')]} />)
    fireEvent.click(screen.getByRole('button', { name: '1 failed' }))
    const [item] = screen.getAllByRole('menuitem')
    expect(item).toHaveAttribute('href', '/post/p1')
    expect(screen.getByRole('button', { name: 'Move to drafts' })).toBeInTheDocument()
  })

  it('lists several, each a link to its own post', () => {
    render(
      <FailedPill
        posts={[
          post('p1', 'Pasta night', 'Thu 12 Nov, 15:59'),
          post('p2', 'Wine list', 'Fri 13 Nov, 18:00'),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '2 failed' }))
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.getAttribute('href'))).toEqual(['/post/p1', '/post/p2'])
    expect(screen.getByText('Wine list')).toBeInTheDocument()
    expect(screen.getByText('Fri 13 Nov, 18:00')).toBeInTheDocument()
    // The keys: the first post has the focus, Down moves it, Escape closes and goes back.
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '2 failed' }))
  })

  it('takes a post to drafts from its ×: the row folds away, then the count follows', async () => {
    vi.useFakeTimers()
    render(
      <Page
        start={[
          post('p1', 'Pasta night', 'Thu 12 Nov, 15:59'),
          post('p2', 'Wine list', 'Fri 13 Nov, 18:00'),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '2 failed' }))
    const row = screen.getByText('Pasta night').closest('.bb-fold')!
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Move to drafts' }))
    // Folding: still there, marked as leaving, and the focus has gone on to the next post.
    expect(row).toHaveAttribute('data-leaving', 'true')
    expect(document.activeElement).toHaveAttribute('href', '/post/p2')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(move).toHaveBeenCalledWith('p1')
    expect(screen.queryByText('Pasta night')).toBeNull()
    expect(screen.getByRole('button', { name: '1 failed' })).toBeInTheDocument()
    // The last one: the mark goes with it.
    fireEvent.click(screen.getByRole('button', { name: 'Move to drafts' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.queryByText(/failed/)).toBeNull()
  })

  it('keeps the row when the core refuses the move', async () => {
    vi.useFakeTimers()
    move.mockResolvedValue(false)
    render(<FailedPill posts={[post('p1', 'Pasta night', 'Thu 12 Nov, 15:59')]} />)
    fireEvent.click(screen.getByRole('button', { name: '1 failed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to drafts' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const row = screen.getByText('Pasta night').closest('.bb-fold')!
    expect(row).not.toHaveAttribute('data-leaving')
  })

  it('offers no × for a post already out on one account', () => {
    const partly = {
      ...post('p1', 'Pasta night', 'Thu 12 Nov, 15:59'),
      sends: { ig: { status: 'failed' }, fb: { status: 'live' } },
    } as unknown as Post
    expect(isPartlyOut(partly)).toBe(true)
    render(<FailedPill posts={[partly, post('p2', 'Wine list', 'Fri 13 Nov, 18:00')]} />)
    fireEvent.click(screen.getByRole('button', { name: '2 failed' }))
    const rows = [...document.querySelectorAll<HTMLElement>('.bb-fold')]
    expect(within(rows[0]!).queryByRole('button', { name: 'Move to drafts' })).toBeNull()
    expect(within(rows[1]!).getByRole('button', { name: 'Move to drafts' })).toBeInTheDocument()
  })

  it('keeps a long list inside a scrolling box', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      post(`p${i}`, `Post ${i}`, `Mon ${i + 1} Nov`),
    )
    render(<FailedPill posts={many} />)
    fireEvent.click(screen.getByRole('button', { name: '15 failed' }))
    expect(screen.getAllByRole('menuitem')).toHaveLength(15)
    const box = screen.getAllByRole('menuitem')[0]!.closest('.overflow-y-auto')!
    expect(box.className).toMatch(/max-h-/)
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(15)
  })

  it('names every account a post failed on, from its jobs', () => {
    const both = {
      ...post('p1', 'Pasta night', 'Thu 12 Nov, 15:59'),
      sends: { ig: { status: 'failed' }, fb: { status: 'failed' }, tt: { status: 'live' } },
    } as unknown as Post
    expect(failedOn(both)).toEqual(['ig', 'fb'])
    expect(failedOn(post('p2', 'Wine', 'Fri'))).toEqual(['ig'])
  })
})
