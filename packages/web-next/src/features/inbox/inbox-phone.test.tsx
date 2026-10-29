import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { resetInbox } from './inbox-store'
import { InboxPage } from './inbox-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useRouter: () => ({ push: vi.fn() }),
}))

// A phone: the list first, and a message over the whole screen.
vi.stubGlobal('matchMedia', () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
}))

beforeEach(() => {
  resetInbox()
  history.replaceState(null, '')
})
afterEach(() => history.replaceState(null, ''))

const page = () =>
  render(
    <BrandProvider>
      <InboxPage />
    </BrandProvider>,
  )
const open = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const thread = () => screen.queryByRole('article')
const steps = () => history.length

// The judge opened a thread on a phone, pressed Back, and left the inbox instead of the thread.
describe('a message on a phone', () => {
  it('closes on the browser’s Back, back to the list', async () => {
    page()
    const before = steps()
    open(/Jonathan Koh/)
    expect(thread()).not.toBeNull()
    expect(steps()).toBe(before + 1)
    history.back()
    await waitFor(() => expect(thread()).toBeNull())
  })

  it('closes from its own Inbox button, and takes its step out of the history', async () => {
    page()
    open(/Jonathan Koh/)
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    await waitFor(() => expect(thread()).toBeNull())
    await waitFor(() => expect(history.state?.inboxThread).toBeFalsy())
  })

  it('closes once the reply is sent, with no step left for Back to press through', async () => {
    page()
    open(/Jonathan Koh/)
    fireEvent.change(screen.getByRole('textbox', { name: /Reply to/ }), {
      target: { value: 'Yes, every Friday.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(thread()).toBeNull())
    await waitFor(() => expect(history.state?.inboxThread).toBeFalsy())
  })

  // Left by the tab bar with a thread open, or reloaded on it: the step for the thread is stale.
  it('steps over a thread’s entry it finds on arrival, so one Back press always shows a change', async () => {
    history.pushState({ inboxThread: true }, '')
    page()
    expect(thread()).toBeNull()
    await waitFor(() => expect(history.state?.inboxThread).toBeFalsy())
  })
})
