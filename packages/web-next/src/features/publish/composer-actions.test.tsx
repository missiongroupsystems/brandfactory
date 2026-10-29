import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// What a post page's actions do in the demo: where a save lands, what it says, and what it refuses.
const told = vi.hoisted(() => ({ report: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  report: told.report,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: told.push, replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  URL.createObjectURL = () => `blob:${Math.random()}`
  URL.revokeObjectURL = () => undefined
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})
beforeEach(() => {
  resetConnections()
  resetIdeas()
  told.report.mockClear()
  told.push.mockClear()
  window.localStorage.clear()
})

/** The brand's posts beside the composer, so a test sees what a press did to the calendar. */
const seen: { brand: ReturnType<typeof useBrand> | null } = { brand: null }
function Spy() {
  const brand = useBrand()
  React.useEffect(() => {
    seen.brand = brand
  })
  return null
}
const show = (post?: (typeof POSTS)[number]) =>
  render(
    <BrandProvider>
      <Spy />
      <Composer post={post} />
    </BrandProvider>,
  )
const ravioli = POSTS.find((p) => p.id === 'ravioli')!
const button = (name: RegExp) => screen.getAllByRole('button', { name })[0]!
const when = () =>
  screen.getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+, \d\d:\d\d$/ })

describe('saving a new post', () => {
  it('refuses an empty draft at the button, and saves nothing', () => {
    show()
    fireEvent.click(button(/^Save draft$/))
    expect(screen.getAllByText('Nothing to save yet: add a photo or a caption.').length).toBe(2)
    expect(told.push).not.toHaveBeenCalled()
    expect(told.report).not.toHaveBeenCalled()
  })

  it('keeps a Story with nothing in it as a draft: a Story can be scheduled so', () => {
    show()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Story' })[0]!)
    fireEvent.click(button(/^Save draft$/))
    expect(told.report).toHaveBeenCalledWith(expect.stringMatching(/^Draft saved for /))
  })

  it('does not take a Story’s accounts as the next post’s', () => {
    const first = show()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Story' })[0]!)
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Facebook/ })[0]!)
    fireEvent.click(button(/^Save draft$/))
    first.unmount()
    show()
    expect(screen.getAllByRole('checkbox', { name: /Facebook/ })[0]).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('goes back to the calendar with a line that names the day, not a page of its own', () => {
    show()
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Caption' })[0]!, {
      target: { value: 'Fresh pasta tonight.' },
    })
    fireEvent.click(button(/^Save draft$/))
    expect(told.report).toHaveBeenCalledWith(
      expect.stringMatching(/^Draft saved for \w{3} \d+ \w{3}, \d\d:\d\d$/),
    )
    expect(told.push).toHaveBeenCalledWith('/')
    expect(
      seen.brand!.posts.some((p) => p.hook === 'Fresh pasta tonight' && p.stage === 'draft'),
    ).toBe(true)
  })

  it('starts the next new post on the accounts the last one went to', () => {
    const first = show()
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Caption' })[0]!, {
      target: { value: 'No TikTok this time.' },
    })
    const tiktok = screen.getAllByRole('checkbox', { name: /TikTok/ })[0]!
    expect(tiktok).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(tiktok)
    fireEvent.click(button(/^Save draft$/))
    first.unmount()
    show()
    expect(screen.getAllByRole('checkbox', { name: /TikTok/ })[0]).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getAllByRole('checkbox', { name: /Instagram/ })[0]).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('marks a library photo once it is in the post, and takes it out on a second tap', () => {
    show()
    const thumb = button(/^Add .+\.jpg$/)
    const name = thumb.getAttribute('aria-label')!.replace(/^Add /, '')
    fireEvent.click(thumb)
    const picked = button(new RegExp(`^Remove ${name}$`))
    expect(picked).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(picked)
    expect(button(new RegExp(`^Add ${name}$`))).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows no caption for a Story, which has none on Instagram', () => {
    show()
    expect(screen.getAllByRole('textbox', { name: 'Caption' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('radio', { name: 'Story' })[0]!)
    expect(screen.queryAllByRole('textbox', { name: 'Caption' })).toHaveLength(0)
  })
})

describe('a scheduled post', () => {
  it('has one save action: Save while its time stands, Reschedule once the day changes', () => {
    show(ravioli)
    expect(screen.queryByRole('button', { name: /^Save draft$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Reschedule/ })).toBeNull()
    expect(button(/^Save$/)).toBeTruthy()
    fireEvent.click(when())
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 18:00' }))
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull()
    expect(button(/^Reschedule /)).toBeTruthy()
  })

  it('unschedules from its menu: back to a draft, on the same day', async () => {
    show(ravioli)
    fireEvent.click(button(/^Post actions$/))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unschedule' }))
    })
    expect(seen.brand!.byId('ravioli')?.stage).toBe('draft')
    expect(told.report).toHaveBeenCalledWith('Unscheduled: it is a draft now')
  })

  it('deletes only after a question asked in the menu, then goes back to the calendar', async () => {
    show(ravioli)
    fireEvent.click(button(/^Post actions$/))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    // Asked, not done: the post is still there, and the focus is on the safe answer.
    expect(seen.brand!.byId('ravioli')).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Cancel' })).toHaveFocus()
    // Up and Down step between the answers.
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    })
    expect(seen.brand!.byId('ravioli')).toBeUndefined()
    expect(told.push).toHaveBeenCalledWith('/')
    expect(told.report).toHaveBeenCalledWith(expect.stringMatching(/^Deleted/))
  })
})
