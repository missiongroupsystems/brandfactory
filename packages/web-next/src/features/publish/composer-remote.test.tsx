import { act, fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import { DEMO_TODAY, setToday } from '@/lib/dates'
import type * as NotAvailable from '@/features/connections/not-available'
import type * as Remote from '@/lib/remote'

import { demoAsCore } from '@/test-core-state'

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
const core = vi.hoisted(() => ({
  loaded: false,
  fbText: '' as string,
  storyToday: false,
  /** The jobs a later read of the brand gives a post, by post id: a send's answers. */
  jobs: {} as Record<string, unknown[]>,
  /** The stores' own hydrate calls, so a read of the brand reaches them again. */
  hydrators: [] as Array<(id: string, state: unknown) => void>,
}))
// What the composer says on the app's message line, and where it goes after.
const told = vi.hoisted(() => ({
  report: vi.fn(),
  push: vi.fn(),
  load: vi.fn(async (): Promise<void> => undefined),
}))
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
    loadBrand: told.load,
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
      for (const p of state.posts as Array<{ id: string; jobs: unknown[] }>) {
        if (core.jobs[p.id]) p.jobs = core.jobs[p.id]!
      }
      hydrate('casa-vostra', state)
      core.hydrators.push(hydrate)
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
  core.jobs = {}
  core.hydrators.length = 0
  told.load.mockReset()
  told.load.mockImplementation(async () => undefined)
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

  it('saves a scheduled post with a new yes: its waiting sends go again at their slot', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={{ ...crust, waiting: ['ig'] }} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    await land(null)
    // A yes covers exactly what a job sends: without the send, the change is refused at 12:00.
    expect(requests).toEqual([
      'PATCH /brands/casa-vostra/posts/ravioli',
      'POST /brands/casa-vostra/posts/ravioli/send',
    ])
    const send = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
    expect(send?.body).toEqual({ when: 'slot', channels: ['ig'] })
    expect(told.report).toHaveBeenCalledWith('Saved for Thu 8 Oct, 12:00')
    // The brand reloads after a send, so the next Save in this tab knows what waits.
    expect(told.load).toHaveBeenCalledWith('casa-vostra')
  })

  it('saves a post marked scheduled by hand as a PATCH alone: nothing waits, so nothing is sent', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    told.load.mockClear()
    fireEvent.click(schedule())
    await land(null)
    expect(requests).toEqual(['PATCH /brands/casa-vostra/posts/ravioli'])
    expect(told.load).not.toHaveBeenCalled()
  })

  it('never marks a scheduled post on Save, so its waiting job is not dropped', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={{ ...crust, channels: ['ig', 'tt'], waiting: ['tt'] }} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    await land(null)
    expect(requests.some((r) => r.endsWith('/mark'))).toBe(false)
    const send = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
    expect((send?.body as { channels: string[] }).channels).toEqual(['tt'])
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
          <Composer post={{ ...crust, channels: ['ig', 'tt'], waiting: ['ig', 'tt'] }} />
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
    // Sent again to the same accounts, as Schedule sends them.
    const send = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
    expect((send?.body as { channels: string[] }).channels).toEqual(['ig', 'tt'])
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
    expect(told.push).not.toHaveBeenCalled()
    await land(null)
    expect(requests).toEqual(['POST /brands/casa-vostra/posts/ravioli/mark'])
    expect(told.report).toHaveBeenCalledWith('Unscheduled: it is a draft now')
    expect(told.push).toHaveBeenCalledWith('/')
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
    expect(screen.queryByRole('dialog', { name: 'When' })).toBeNull()
    // The hours on the page: the gone ones are shut, the running one starts at its next quarter.
    expect(screen.getByRole('radio', { name: '17:00' })).toBeDisabled()
    const running = screen.getByRole('radio', { name: /^18:15/ })
    expect(running).not.toBeDisabled()
    fireEvent.click(running)
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
    const dialog = within(screen.getByRole('dialog', { name: 'When' }))
    expect(dialog.queryByRole('button', { name: /^Today/ })).toBeNull()
    expect(dialog.getByRole('button', { name: 'Tomorrow 18:00' })).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Tomorrow 21:00' })).toBeNull()
  })
})

/** A read of the brand: the stores get its state again, with the jobs the test set. */
function reread() {
  const state = demoAsCore('casa-vostra')
  for (const p of state.posts as Array<{ id: string; jobs: unknown[] }>) {
    if (core.jobs[p.id]) p.jobs = core.jobs[p.id]!
  }
  for (const hydrate of core.hydrators) hydrate('casa-vostra', state)
}

const job = (channel: string, status: string, error: string | null = null) => ({
  id: `ravioli:${channel}`,
  channel,
  status,
  error,
  runAt: '2026-10-06T02:00:00.000Z',
})

describe('posting now on the core', () => {
  /** The ravioli post, sent with Post now. */
  function postNow() {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={{ ...crust, waiting: ['ig'] }} />
        </Loaded>
      </BrandProvider>,
    )
    // Post now: the quiet button beside the main one, which sends at once.
    fireEvent.click(screen.getAllByRole('button', { name: 'Post now' })[0]!)
  }

  it('sends the post now, then follows each account until its job answers', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(DEMO_CLOCK)
    told.load.mockImplementation(async () => act(() => reread()))
    postNow()
    await land(null)
    const sendCall = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
    expect(sendCall?.body).toMatchObject({ when: 'now' })
    const channels = (sendCall!.body as { channels: string[] }).channels
    // Handed over: each account is sending, and nothing here can send it twice.
    expect(screen.getByRole('heading', { name: 'Publishing' })).toBeInTheDocument()
    expect(screen.getAllByText('Sending')).toHaveLength(channels.length)
    expect(screen.queryByRole('button', { name: 'Edit post' })).toBeNull()
    // The first read after the send: still waiting.
    core.jobs.ravioli = channels.map((c) => job(c, 'scheduled'))
    await act(async () => vi.advanceTimersByTime(4_000))
    expect(screen.getAllByText('Sending')).toHaveLength(channels.length)
    // Then each account answers.
    core.jobs.ravioli = channels.map((c) => job(c, 'live'))
    await act(async () => vi.advanceTimersByTime(4_000))
    expect(screen.getByRole('heading', { name: 'Live everywhere' })).toBeInTheDocument()
    expect(screen.getAllByText('Live')).toHaveLength(channels.length)
    // Answered: no more reads.
    const reads = told.load.mock.calls.length
    await act(async () => vi.advanceTimersByTime(12_000))
    expect(told.load.mock.calls.length).toBe(reads)
  })

  it('shows the job’s own reason for an account that failed, and offers no demo retry', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(DEMO_CLOCK)
    told.load.mockImplementation(async () => act(() => reread()))
    postNow()
    await land(null)
    const sendCall = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
    const channels = (sendCall!.body as { channels: string[] }).channels
    const reason = 'Instagram could not reach @pran._.av. It tags and invites public accounts only.'
    core.jobs.ravioli = channels.map((c) => job(c, 'failed', reason))
    await act(async () => vi.advanceTimersByTime(4_000))
    expect(screen.getAllByText(reason)).toHaveLength(channels.length)
    // Every account failed: nothing went out, and the page says so, with no tick.
    expect(screen.getByRole('heading', { name: 'Not posted' })).toBeInTheDocument()
    expect(screen.getByText(`${channels.length} accounts need you.`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reconnect and retry' })).toBeNull()
  })

  it('reads none of the post’s old jobs as an answer before the first read after the send', async () => {
    // The post failed before: its old job must not show as this send's answer.
    core.jobs.ravioli = [job('ig', 'failed', 'An old refusal.')]
    told.load.mockImplementation(async () => undefined)
    postNow()
    await land(null)
    expect(screen.queryByText('An old refusal.')).toBeNull()
    expect(screen.getAllByText('Sending').length).toBeGreaterThan(0)
  })
})

describe('a failed post on the core', () => {
  it('says why in plain words, links to Connections, and clears to a draft in one press', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer
            post={{ ...crust, stage: 'failed', error: 'no connector social', failedOn: 'ig' }}
          />
        </Loaded>
      </BrandProvider>,
    )
    const banner = screen.getByRole('alert')
    expect(within(banner).getByText('Instagram is not set up for posting yet.')).toBeInTheDocument()
    expect(within(banner).queryByText('no connector social')).toBeNull()
    expect(within(banner).getByRole('link', { name: /Connect Instagram/ })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
    fireEvent.click(within(banner).getByRole('button', { name: 'Move to drafts' }))
    await land(null)
    const mark = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/mark')
    expect(mark?.body).toEqual({ stage: 'draft' })
    expect(told.report).toHaveBeenCalledWith('Moved to drafts')
  })
})

describe('Post now on a failed post on the core', () => {
  it('sends on the first press, though its day is past', async () => {
    // 13:00 on Thu 8 Oct: the ravioli post's 12:00 has gone, and it failed.
    setToday('2026-10-08')
    vi.setSystemTime(new Date('2026-10-08T05:00:00Z'))
    try {
      render(
        <BrandProvider>
          <Loaded>
            <Composer
              post={{ ...crust, stage: 'failed', error: 'no connector social', failedOn: 'ig' }}
            />
          </Loaded>
        </BrandProvider>,
      )
      fireEvent.click(screen.getAllByRole('button', { name: 'Post now' })[0]!)
      await land(null)
      const send = bodies.find((r) => r.call === 'POST /brands/casa-vostra/posts/ravioli/send')
      expect(send?.body).toMatchObject({ when: 'now' })
    } finally {
      setToday(DEMO_TODAY)
    }
  })

  it('names each account’s own reason, and keeps Move to drafts away once one account has it', () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer
            post={{
              ...crust,
              stage: 'failed',
              error: 'no connector social',
              failedOn: 'fb',
              sends: {
                ig: { status: 'live' },
                fb: {
                  status: 'failed',
                  error: 'Facebook did not answer. Nothing was posted. Try again.',
                },
              },
            }}
          />
        </Loaded>
      </BrandProvider>,
    )
    const banner = screen.getByRole('alert')
    expect(
      within(banner).getByText(/Facebook did not answer\. Try again in a few minutes\./),
    ).toBeInTheDocument()
    expect(within(banner).queryByRole('button', { name: 'Move to drafts' })).toBeNull()
  })
})
