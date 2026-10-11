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
    // Not a link: leaving for the Brand page would lose the reply being typed.
    expect(screen.getByText(/In Casa Vostra’s voice/).closest('a')).toBeNull()
  })

  it('sends a complaint to the person it is about, and says so on the message', () => {
    page()
    // A complaint about the food goes to the head chef.
    fireEvent.click(screen.getByRole('button', { name: 'Send to Giulia' }))
    // The open message says who has it, and so does its row in the list.
    const thread = screen.getByRole('article', { name: /Rachel Tan/ })
    expect(within(thread).getByText('Sent to Giulia')).toBeTruthy()
    const row = screen.getByRole('button', { name: /Rachel Tan/ })
    expect(within(row).getByLabelText('Complaint, sent to Giulia')).toBeTruthy()
    // A lost booking goes to the venue manager.
    fireEvent.click(screen.getByRole('button', { name: /Aisha Rahman/ }))
    expect(screen.getByRole('button', { name: 'Send to Marco' })).toBeTruthy()
  })

  it('sends a complaint to more than one person', () => {
    page()
    // The food and the evening both went wrong: the chef and the venue manager both need it.
    fireEvent.click(screen.getByRole('button', { name: 'Send to more people' }))
    expect(screen.getByRole('checkbox', { name: /Giulia Conti/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Marco Bellini/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send to 2' }))
    const thread = screen.getByRole('article', { name: /Rachel Tan/ })
    expect(within(thread).getByText('Sent to Marco and Giulia')).toBeTruthy()
    const row = screen.getByRole('button', { name: /Rachel Tan/ })
    expect(within(row).getByLabelText('Complaint, sent to Marco and Giulia')).toBeTruthy()
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

  it('shows a DM thread in order, ending with the message the reply answers', () => {
    page()
    // The list shows where the thread stands now: its latest message.
    const row = screen.getByRole('button', { name: /Jonathan Koh/ })
    expect(within(row).getByText(/^Perfect\. Is there a set menu/)).toBeTruthy()
    fireEvent.click(row)
    const thread = screen.getByRole('article', { name: /Jonathan Koh/ })
    const said = within(thread)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    expect(said).toHaveLength(5)
    expect(said[0]).toMatch(/Hi there/)
    expect(said[2]).toMatch(/Ciao Jonathan! Yes, Friday/)
    // The team's own note sits in the thread, marked as never reaching the guest.
    expect(said[3]).toMatch(/Daniel · only the team sees this/)
    expect(said.at(-1)).toMatch(/Is there a set menu\? A couple of us are vegetarian\.$/)
    // The draft answers that last question, not the first.
    expect(reply().value).toMatch(/set menu at \$68 a head/)
  })
})
