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
const directions = () => within(screen.getByRole('group', { name: 'Reply' })).getAllByRole('button')
const send = () => screen.getByRole('button', { name: 'Send' })

/** Picks a direction and waits for its reply to be written. */
function pick(name: string | number) {
  const button =
    typeof name === 'number'
      ? directions()[name]!
      : within(screen.getByRole('group', { name: 'Reply' })).getByRole('button', { name })
  fireEvent.click(button)
  act(() => {
    vi.advanceTimersByTime(1000)
  })
}

describe('the inbox', () => {
  it('opens the first complaint with three ways to reply and nothing written yet', () => {
    page()
    expect(screen.getByRole('article', { name: /Rachel Tan/ })).toBeTruthy()
    expect(directions().map((b) => b.textContent)).toEqual([
      'Apologise and invite to DM',
      'Offer to make it right',
      'Explain what happened',
    ])
    // The reply is the one action: nothing is written until a direction is picked, and Send waits.
    expect(reply().value).toBe('')
    expect(send()).toBeDisabled()
    // Regenerate is gone, and so is the Send-to pill: the thread header holds only a menu.
    expect(screen.queryByRole('button', { name: /Regenerate/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Send to/ })).toBeNull()
  })

  it('writes the reply for the picked direction, then another for the next one', () => {
    page()
    fireEvent.click(directions()[0]!)
    // While it writes, the box shows it is busy and Send waits.
    expect(screen.getByRole('status', { name: 'Writing' })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(reply().value).toMatch(/^Rachel, we're so sorry.*send us a DM/)
    expect(send()).toBeEnabled()
    // Another direction replaces an edit, as the new reply is what was asked for.
    fireEvent.change(reply(), { target: { value: 'my words' } })
    pick('Explain what happened')
    expect(reply().value).toMatch(/^Rachel, thank you for telling us.*Giulia, our head chef/)
    expect(screen.getByRole('button', { name: 'Explain what happened' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('sends a complaint to the person it is about, from the menu, and says so on the message', () => {
    page()
    // A complaint about the food goes to the head chef, who is ticked first.
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('checkbox', { name: /Giulia Conti/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send to Giulia' }))
    // The open message says who has it, and so does its row in the list.
    const thread = screen.getByRole('article', { name: /Rachel Tan/ })
    expect(within(thread).getByText('Sent to Giulia')).toBeTruthy()
    expect(within(thread).queryByRole('button', { name: 'More' })).toBeNull()
    const row = screen.getByRole('button', { name: /Rachel Tan/ })
    expect(within(row).getByLabelText('Complaint, sent to Giulia')).toBeTruthy()
    // A lost booking goes to the venue manager.
    fireEvent.click(screen.getByRole('button', { name: /Aisha Rahman/ }))
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: 'Send to Marco' })).toBeTruthy()
  })

  it('sends a complaint to more than one person', () => {
    page()
    // The food and the evening both went wrong: the chef and the venue manager both need it.
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
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
    fireEvent.click(send())
    expect(screen.getByRole('article', { name: /Aisha Rahman/ })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('button', { name: /Rachel Tan/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Inbox/ }).textContent).toBe('Inbox7')
  })

  it('ends at all caught up once every message has a reply', () => {
    page()
    for (let i = 0; i < 8; i++) {
      pick(0)
      fireEvent.click(send())
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeTruthy()
  })

  it('shows only the DMs from a small tab, and clears the noise from inside its fold', () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: 'DMs' }))
    expect(screen.queryByRole('button', { name: /Rachel Tan/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Aisha Rahman/ })).toBeTruthy()
    // Clear is not a corner button: it waits inside the fold, after what it would clear.
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Muted, 5 need no reply/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('button', { name: /Muted/ })).toBeNull()
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
    // The directions answer that last question, not the first.
    pick('Answer directly')
    expect(reply().value).toMatch(/set menu at \$68 a head/)
  })
})
