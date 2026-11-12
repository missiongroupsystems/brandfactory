import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// Leaving a post page: a change not saved is asked about first, and nothing else is.
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

/** The composer with a link out of the page beside it, as the app's header has. */
const show = (post?: (typeof POSTS)[number]) =>
  render(
    <BrandProvider>
      <a href="/ideate">Ideas</a>
      <Composer post={post} />
    </BrandProvider>,
  )
/** A click on the link: true when the browser would follow it. */
const leave = () => fireEvent.click(screen.getByRole('link', { name: 'Ideas' }))
/** A reload or a closed tab: true when the browser would go without asking. */
const unload = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
const caption = () => screen.getAllByRole('textbox', { name: /caption/i })[0]!
/** Types a caption as a person does: a press in the field first, then the words. */
const type = (value: string) => {
  fireEvent.pointerDown(caption())
  fireEvent.change(caption(), { target: { value } })
}
const asked = () => screen.queryByText('Leave this post?') !== null

describe('leaving a post page', () => {
  it('asks before a link leaves a changed post, and goes only when told to', () => {
    show()
    type('Fresh pasta tonight')
    expect(leave()).toBe(false)
    expect(asked()).toBe(true)
    expect(told.push).not.toHaveBeenCalled()
    expect(unload()).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(asked()).toBe(false)
    expect(caption()).toHaveValue('Fresh pasta tonight')

    leave()
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(told.push).toHaveBeenCalledWith('/ideate')
  })

  it('lets a new post with nothing in it go without a question', () => {
    show()
    expect(leave()).toBe(true)
    expect(unload()).toBe(true)
    expect(asked()).toBe(false)
  })

  it('lets a new post go without a question when it opened on the last post’s accounts', async () => {
    // The composer ticks the last new post's accounts after it opens: that is not a change.
    window.localStorage.setItem('bb.last-accounts.casa-vostra', JSON.stringify(['ig']))
    show()
    await act(async () => undefined)
    expect(leave()).toBe(true)
    expect(asked()).toBe(false)
    type('Fresh pasta tonight')
    expect(leave()).toBe(false)
  })

  it('lets every post on the calendar go without a question when nothing was changed', async () => {
    // Anything the composer sets by itself as it opens would ask here, with nothing to lose.
    const opened = POSTS.filter((p) => p.stage !== 'posted')
    expect(opened.length).toBeGreaterThan(3)
    for (const post of opened) {
      show(post)
      await act(async () => undefined)
      // A press on the page that changes nothing: what the post holds is still what it opened on.
      fireEvent.pointerDown(document.querySelector('header')!)
      expect({ post: post.id, followed: leave(), asked: asked() }).toEqual({
        post: post.id,
        followed: true,
        asked: false,
      })
      expect(unload()).toBe(true)
      cleanup()
    }
    // Every post rendered in one test: more than the default 5 s under a loaded machine.
  }, 30_000)

  it('asks after a change to an existing post, and not once it is saved', async () => {
    const ravioli = POSTS.find((p) => p.id === 'ravioli')!
    show(ravioli)
    type('Ravioli, made this morning')
    expect(leave()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))

    fireEvent.click(screen.getAllByRole('button', { name: /^Save( draft)?$/ })[0]!)
    await act(async () => undefined)
    expect(told.push).toHaveBeenCalledWith('/')
    expect(leave()).toBe(true)
    expect(asked()).toBe(false)
    expect(unload()).toBe(true)
  })
})
