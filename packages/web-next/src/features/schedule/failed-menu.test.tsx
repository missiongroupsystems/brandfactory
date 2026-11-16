import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { FailedPill, failedOn } from './failed-menu'

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

beforeEach(() => push.mockClear())

describe('the failed mark beside the calendar title', () => {
  it('shows nothing when no post failed, on any brand', () => {
    const { container } = render(<FailedPill posts={[]} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/failed/)).toBeNull()
  })

  it('opens the one failed post at once, wherever its week is', () => {
    render(<FailedPill posts={[post('p1', 'Pasta night', 'Thu 12 Nov, 15:59')]} />)
    fireEvent.click(screen.getByRole('button', { name: '1 failed' }))
    expect(push).toHaveBeenCalledWith('/post/p1')
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
    expect(push).not.toHaveBeenCalled()
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

  it('names every account a post failed on, from its jobs', () => {
    const both = {
      ...post('p1', 'Pasta night', 'Thu 12 Nov, 15:59'),
      sends: { ig: { status: 'failed' }, fb: { status: 'failed' }, tt: { status: 'live' } },
    } as unknown as Post
    expect(failedOn(both)).toEqual(['ig', 'fb'])
    expect(failedOn(post('p2', 'Wine', 'Fri'))).toEqual(['ig'])
  })
})
