import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { resetInbox } from './inbox-store'
import { InboxPage } from './inbox-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ push: vi.fn() }),
}))

// A desktop: the list and the open message side by side.
if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

beforeEach(() => {
  resetInbox()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const page = () =>
  render(
    <BrandProvider>
      <InboxPage />
    </BrandProvider>,
  )

const reply = () => screen.getByRole('textbox', { name: /Reply to/ }) as HTMLTextAreaElement

describe('the inbox', () => {
  it('opens the first complaint with a reply drafted in the brand voice', () => {
    page()
    expect(screen.getByRole('article', { name: /Rachel Tan/ })).toBeTruthy()
    expect(reply().value).toMatch(/^Rachel, we're so sorry/)
    expect(screen.getByText(/Casa Vostra’s tone of voice/)).toBeTruthy()
  })

  it('sends a complaint to the venue manager and says so on the message', () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Send to Marco' }))
    expect(screen.getByText(/Marco got an alert/)).toBeTruthy()
    const row = screen.getByRole('button', { name: /Rachel Tan/ })
    expect(within(row).getByText('Sent to Marco')).toBeTruthy()
  })

  it('clears a replied message and moves on to the next', () => {
    page()
    fireEvent.change(reply(), { target: { value: 'Sorry, Rachel. DM us?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(screen.getByRole('article', { name: /Aisha Rahman/ })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('button', { name: /Rachel Tan/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Inbox/ }).textContent).toBe('Inbox7')
  })

  it('regenerates the draft, replacing an edit', () => {
    page()
    fireEvent.change(reply(), { target: { value: 'my words' } })
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(reply().value).toMatch(/^Hi Rachel, thank you for telling us/)
  })

  it('ends at all caught up once every message has a reply', () => {
    page()
    for (let i = 0; i < 8; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeTruthy()
  })
})
