import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { dayOf } from '@/features/schedule/move-post'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import { useMoveWithUndo } from '@/features/schedule/use-move-post'
import { push } from '@/lib/remote'
import { DEMO_TODAY, setToday } from '@/lib/dates'
import type * as NotAvailable from '@/features/connections/not-available'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// The composer on the API: `sent` stands in for the server's answer, which the test hands back
// when it chooses.
let answer: (refusal: string | null) => void = () => undefined
const sent = vi.fn(
  (_brandId: string, _send: () => Promise<unknown>) =>
    new Promise<string | null>((resolve) => (answer = resolve)),
)
// The requests a change would make, as the server would see them.
const requests: string[] = []
// The same requests with what they carried, for a test that reads a body.
const bodies: Array<{ call: string; body: unknown }> = []
// The brand's state, as the core sends it, once the test begins.
const core = vi.hoisted(() => ({ loaded: false, fbText: '' as string, storyToday: false }))
// What the composer says on the app's message line, and where it goes after.
const told = vi.hoisted(() => ({ report: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    sent: (brandId: string, send: () => Promise<unknown>) => sent(brandId, send),
    request: async (method: string, path: string, body?: { id?: string }) => {
      requests.push(`${method} ${path}${body?.id ? ` ${body.id}` : ''}`)
      bodies.push({ call: `${method} ${path}`, body })
      return {}
    },
    push: vi.fn(),
    report: told.report,
    // The demo brand's posts, as the core sends them: on the core no store starts with the demo's.
    onState: (hydrate: (id: string, state: unknown) => void) => {
      // Once the modules are in: the stores that listen from their first line hear nothing.
      if (!core.loaded) return () => undefined
      const state = demoAsCore('casa-vostra')
      // The ravioli post saved with its own Facebook text, when a test asks for it.
      if (core.fbText) {
        const p = state.posts.find((x) => x.id === 'ravioli') as { draft: unknown }
        p.draft = { overrides: { fb: core.fbText } }
      }
      // A story out on the demo's today, when a test asks for one.
      if (core.storyToday) {
        state.posts.push({
          ...state.posts[0]!,
          id: 'story-today',
          format: 'story',
          day: '2026-10-06',
          time: '09:00',
          stage: 'posted',
          jobs: [],
        })
      }
      hydrate('casa-vostra', state)
      return () => undefined
    },
  }
})
// The day the platforms are set up on our side: their accounts connect, and posts can go out.
vi.mock('@/features/connections/not-available', async (original) => ({
  ...(await original<typeof NotAvailable>()),
  notAvailable: () => false,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/crust',
  useRouter: () => ({ push: told.push, replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  core.loaded = true
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})
// On the core the composer reads the brand's own clock: the tests set it to the demo's today.
const DEMO_CLOCK = new Date('2026-10-06T02:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DEMO_CLOCK)
  resetConnections()
  resetIdeas()
  sent.mockClear()
  requests.length = 0
  bodies.length = 0
  core.fbText = ''
  core.storyToday = false
  told.report.mockClear()
  told.push.mockClear()
})

afterEach(() => vi.useRealTimers())

/** Runs the change the composer last handed to the queue, and answers it. */
async function land(refusal: string | null) {
  await sent.mock.calls.at(-1)![1]()
  await act(async () => answer(refusal))
}

/** The page once the brand's state is in, as the app opens it only after the brand loads. */
function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}

// A scheduled post of two photos: a reel needs its video for Instagram (`makeBlockers`).
const crust = POSTS.find((p) => p.id === 'ravioli')!
// The ravioli post is scheduled already: with its day and time unchanged, its one button saves it.
const schedule = () => screen.getAllByRole('button', { name: 'Save' })[0]!
/** The five-pastas draft's button: a draft is scheduled, not moved. */
const send = () => screen.getAllByRole('button', { name: /^Schedule/ })[0]!

describe('the composer on the API', () => {
  it('says done only once the server has stored the post', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    expect(sent).toHaveBeenCalledTimes(1)
    // Waiting: the button says so, and a second press sends nothing more.
    expect(screen.getAllByText('Saving…').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('Saving…')[0]!)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(told.push).not.toHaveBeenCalled()
    await act(async () => answer(null))
    // Stored: back to the calendar, and the message line says when it goes. Nothing moved, so
    // it is saved, not moved; and a press in the moment before the calendar sends nothing more.
    expect(told.report).toHaveBeenCalledWith(
      expect.stringMatching(/^Saved for \w{3} \d+ \w{3}, \d\d:\d\d$/),
    )
    expect(told.push).toHaveBeenCalledWith('/')
    fireEvent.click(schedule())
    expect(sent).toHaveBeenCalledTimes(1)
  })

  it('saves a scheduled post as it is: its stage kept, a PATCH alone, nothing sent or moved', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    await land(null)
    expect(requests).toEqual(['PATCH /brands/casa-vostra/posts/ravioli'])
    expect(told.report).toHaveBeenCalledWith('Saved for Thu 8 Oct, 12:00')
  })

  it('sends a scheduled post again when an account is added: a PATCH alone makes no job', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={{ ...crust, channels: ['ig'] }} />
        </Loaded>
      </BrandProvider>,
    )
    expect(schedule()).toBeTruthy()
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Facebook/ })[0]!)
    // The day is the same, the accounts are not: the one button sends, and says so.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^Save and send/ })[0]!)
    await land(null)
    const send = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
    expect((send?.body as { channels: string[] }).channels).toEqual(['ig', 'fb'])
  })

  it('keeps an existing carousel’s format and its TikTok on Save: no switch to lose them by', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={{ ...crust, channels: ['ig', 'tt'] }} />
        </Loaded>
      </BrandProvider>,
    )
    // The format is said, not offered: a save would not change it.
    expect(screen.queryByRole('radiogroup', { name: 'Format' })).toBeNull()
    expect(screen.getAllByTitle('Make a new post to change the format').length).toBeGreaterThan(0)
    fireEvent.click(schedule())
    await land(null)
    const patch = bodies.find((r) => r.call === 'PATCH /brands/casa-vostra/posts/ravioli')
    expect((patch?.body as { channels: string[] }).channels).toEqual(['ig', 'tt'])
    expect(requests.some((r) => r.endsWith('/send'))).toBe(false)
  })

  it('saves a scheduled post whose time has passed: a save sends nothing out', async () => {
    // 13:00 in Singapore on Thu 8 Oct: the ravioli post's 12:00 has gone.
    setToday('2026-10-08')
    vi.setSystemTime(new Date('2026-10-08T05:00:00Z'))
    try {
      render(
        <BrandProvider>
          <Loaded>
            <Composer post={crust} />
          </Loaded>
        </BrandProvider>,
      )
      expect(schedule()).not.toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(schedule())
      await land(null)
      expect(requests).toEqual(['PATCH /brands/casa-vostra/posts/ravioli'])
      expect(told.push).toHaveBeenCalledWith('/')
    } finally {
      setToday(DEMO_TODAY)
    }
  })

  it('deletes a post on the server first, then goes back to the calendar', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    // Asked, not yet answered: nothing is said and the page stays.
    expect(told.report).not.toHaveBeenCalled()
    expect(told.push).not.toHaveBeenCalled()
    await land(null)
    expect(requests).toEqual(['DELETE /brands/casa-vostra/posts/ravioli'])
    expect(told.push).toHaveBeenCalledWith('/')
    expect(told.report).toHaveBeenCalledWith('Deleted')
  })

  it('stays on the post when the server refuses the delete, and says nothing of its own', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    // A 409: the app's problem line says why; the composer adds nothing and stays.
    await land('This post is going out now.')
    expect(told.push).not.toHaveBeenCalled()
    expect(told.report).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: crust.hook })).toBeTruthy()
  })

  it('unschedules on the server, then calls it a draft', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unschedule' }))
    expect(told.report).not.toHaveBeenCalled()
    await land(null)
    expect(requests).toEqual(['POST /brands/casa-vostra/posts/ravioli/mark'])
    expect(told.report).toHaveBeenCalledWith('Unscheduled: it is a draft now')
  })

  it('stays open with everything in it when the server refuses', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    await act(async () => answer('A story is already on that day.'))
    expect(told.push).not.toHaveBeenCalled()
    expect(told.report).not.toHaveBeenCalled()
    // The same post, ready to send again.
    expect(schedule()).toBeTruthy()
    fireEvent.click(schedule())
    expect(sent).toHaveBeenCalledTimes(2)
  })

  it('asks for a day ahead when a draft sits on a day that has passed', () => {
    const pasta = POSTS.find((p) => p.id === 'pasta')!
    // The pasta draft sits on Tue 13 Oct; a week later, that day has passed.
    setToday('2026-10-20')
    vi.setSystemTime(new Date('2026-10-20T02:00:00Z'))
    try {
      render(
        <BrandProvider>
          <Loaded>
            <Composer post={pasta} />
          </Loaded>
        </BrandProvider>,
      )
      expect(screen.getAllByText('Pick a day ahead.').length).toBeGreaterThan(0)
      fireEvent.click(send())
      expect(sent).not.toHaveBeenCalled()
    } finally {
      setToday(DEMO_TODAY)
    }
  })

  it('schedules later today, and asks for a time ahead once that time has gone', () => {
    const draft = POSTS.find((p) => p.id === 'five-pastas')!
    // The five-pastas carousel sits on Fri 30 Oct at 18:00; that day is today.
    setToday('2026-10-30')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // 17:00 in Singapore: 18:00 is still ahead, and nothing else holds the post back.
      vi.setSystemTime(new Date('2026-10-30T09:00:00Z'))
      const { unmount } = render(
        <BrandProvider>
          <Loaded>
            <Composer post={draft} />
          </Loaded>
        </BrandProvider>,
      )
      expect(send()).not.toBeDisabled()
      expect(screen.queryByText('Pick a time ahead.')).toBeNull()
      unmount()

      // 19:00: 18:00 has gone, so nothing is sent.
      vi.setSystemTime(new Date('2026-10-30T11:00:00Z'))
      render(
        <BrandProvider>
          <Loaded>
            <Composer post={draft} />
          </Loaded>
        </BrandProvider>,
      )
      expect(screen.getAllByText('Pick a time ahead.').length).toBeGreaterThan(0)
      fireEvent.click(send())
      expect(sent).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      setToday(DEMO_TODAY)
    }
  })

  it('does not send a time that went by while the composer stayed open', () => {
    const draft = POSTS.find((p) => p.id === 'five-pastas')!
    setToday('2026-10-30')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // Opened at 17:50 for 18:00: ready to schedule.
      vi.setSystemTime(new Date('2026-10-30T09:50:00Z'))
      render(
        <BrandProvider>
          <Loaded>
            <Composer post={draft} />
          </Loaded>
        </BrandProvider>,
      )
      expect(screen.queryByText('Pick a time ahead.')).toBeNull()
      // Left open past 18:00, with no redraw: the press itself checks the clock.
      vi.setSystemTime(new Date('2026-10-30T10:05:00Z'))
      fireEvent.click(send())
      expect(sent).not.toHaveBeenCalled()
      expect(screen.getAllByText('Pick a time ahead.').length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
      setToday(DEMO_TODAY)
    }
  })

  it('makes a new post again under the same id when its first save was refused', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    const save = () => screen.getAllByRole('button', { name: 'Save draft' })[0]!
    // An empty draft is refused before it is sent: a caption gives it something to keep.
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Caption' })[0]!, {
      target: { value: 'Pasta night.' },
    })
    fireEvent.click(save())
    await land('The server is busy.')
    const first = requests.find((r) => r.startsWith('POST /brands/casa-vostra/posts '))!
    requests.length = 0
    // Refused, so the next save makes it again: the same id, never a second post.
    fireEvent.click(save())
    await land(null)
    expect(requests).toContain(first)
    // Stored: back to the calendar, with the day it sits on.
    expect(told.report).toHaveBeenCalledWith(
      expect.stringMatching(/^Draft saved for \w{3} \d+ \w{3}, \d\d:\d\d$/),
    )
    expect(told.push).toHaveBeenCalledWith('/')
  })

  it('opens a post saved with its own Facebook text on the tabs, that text in view', () => {
    core.fbText = 'Facebook only: book on the page.'
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    // The tabs are there without asking, so the saved text cannot hide behind the shared box.
    expect(screen.queryByText('Different caption per account')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Facebook/ }))
    expect(screen.getByRole('textbox', { name: 'Facebook text' })).toHaveValue(core.fbText)
  })

  it('says a scheduled post moved only when its day or time changed', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^\w{3} \d+ \w{3}, \d\d:\d\d$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow 18:00' }))
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    // The day changed: the one button now reads Reschedule.
    fireEvent.click(screen.getAllByRole('button', { name: /^Reschedule / })[0]!)
    await land(null)
    expect(told.report).toHaveBeenCalledWith('Moved to Wed 7 Oct, 18:00')
  })

  it('schedules a draft and says so on the way back to the calendar', async () => {
    const draft = POSTS.find((p) => p.id === 'five-pastas')!
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={draft} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(send())
    await land(null)
    expect(told.report).toHaveBeenCalledWith(
      expect.stringMatching(/^Scheduled for \w{3} \d+ \w{3}, \d\d:\d\d$/),
    )
    expect(told.push).toHaveBeenCalledWith('/')
  })

  it('offers only hours still ahead today, the running hour at its next quarter', () => {
    // 18:10 in Singapore on the demo's today.
    vi.setSystemTime(new Date('2026-10-06T10:10:00Z'))
    const pasta = POSTS.find((p) => p.id === 'pasta')!
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={pasta} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^\w{3} \d+ \w{3}, \d\d:\d\d$/ }))
    // Today's quick pick lands on what is left of today.
    fireEvent.click(screen.getByRole('button', { name: 'Today 21:00' }))
    fireEvent.click(screen.getByRole('button', { name: /^Tue 6 Oct, 21:00/ }))
    expect(screen.getByRole('radio', { name: '17:00' })).toBeDisabled()
    const running = screen.getByRole('radio', { name: /^18:15/ })
    expect(running).not.toBeDisabled()
    fireEvent.click(running)
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Tue 6 Oct, 18:15/ })).toBeInTheDocument()
    expect(screen.queryByText('Pick a time ahead.')).toBeNull()
  })

  it('keeps the minutes when a bar picks an hour still ahead', () => {
    const pasta = POSTS.find((p) => p.id === 'pasta')!
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={pasta} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^\w{3} \d+ \w{3}, \d\d:\d\d$/ }))
    const field = screen.getByRole('textbox', { name: 'Post time' })
    act(() => field.focus())
    fireEvent.change(field, { target: { value: '18:30' } })
    fireEvent.blur(field)
    // Another day: the 14 bar applies 14:30, and says so.
    fireEvent.click(screen.getByRole('radio', { name: '14:30' }))
    expect(screen.getByRole('button', { name: /^Tue 13 Oct, 14:30/ })).toBeInTheDocument()
  })

  it('gives a Story stepped off today the best hour, not what was left of today', () => {
    // 18:10: today's slot is 21:00. Tue 6 Oct has a story out, so the Story lands tomorrow.
    core.storyToday = true
    vi.setSystemTime(new Date('2026-10-06T10:10:00Z'))
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getAllByRole('radio', { name: 'Story' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /^\w{3} \d+ \w{3}, \d\d:\d\d$/ }))
    expect(screen.queryByRole('button', { name: /^Today/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tomorrow 18:00' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomorrow 21:00' })).toBeNull()
  })
})

describe('a post dragged on the calendar on the API', () => {
  const calendar = () =>
    renderHook(() => ({ brand: useBrand(), move: useMoveWithUndo() }), {
      wrapper: BrandProvider,
    })
  /** The requests the queued changes make, in order. */
  async function pushed() {
    for (const [, send] of vi.mocked(push).mock.calls) await (send as () => Promise<unknown>)()
    return requests.filter((r) => r.endsWith('/move'))
  }

  it('sends the move, and Undo sends the post back to the day it left', async () => {
    vi.mocked(push).mockClear()
    const { result } = calendar()
    const from = dayOf(result.current.brand.weeks, 'five-pastas')!
    act(() => {
      result.current.move('five-pastas', '2026-10-28')
    })
    const [, undo] = told.report.mock.calls.at(-1)!
    act(() => {
      undo.run()
    })
    expect(dayOf(result.current.brand.weeks, 'five-pastas')).toBe(from)
    expect(await pushed()).toEqual([
      'POST /brands/casa-vostra/posts/five-pastas/move',
      'POST /brands/casa-vostra/posts/five-pastas/move',
    ])
  })

  it('refuses a move to today at a time already gone, and an Undo the calendar no longer takes', () => {
    // 19:00 in Singapore on the demo's today: the five-pastas post's 18:00 has gone today.
    vi.setSystemTime(new Date('2026-10-06T11:00:00Z'))
    const { result } = calendar()
    let moved = true
    act(() => {
      moved = result.current.move('five-pastas', '2026-10-06')
    })
    expect(moved).toBe(false)
    expect(told.report).toHaveBeenLastCalledWith('That time today has passed: pick another day')
    // A move that lands, then the post goes out before Undo: Undo says it could not.
    act(() => {
      result.current.move('five-pastas', '2026-10-28')
    })
    const [, undo] = told.report.mock.calls.at(-1)!
    act(() => {
      result.current.brand.setStage('five-pastas', 'posted')
    })
    act(() => {
      undo.run()
    })
    expect(told.report).toHaveBeenLastCalledWith('Could not move it back')
  })
})
