import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { IDEAS_BY_BRAND } from '@/data/ideas'
import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { IdeaPage } from './idea-page'
import { resetIdeas } from './ideas-store'

// The idea page on the core once the server posts to Instagram and Facebook through Make: TikTok
// stays planned only. The brand has both linked. Every store that listens for the brand's state is
// handed the same state, with the demo's Casa Vostra ideas as the server would send them.
const requests: Array<{ call: string; body?: unknown }> = []
/** Calls the core refuses, by "METHOD path". */
const refused = new Set<string>()
const hydrators = vi.hoisted(() => [] as Array<(id: string, state: unknown) => void>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  platformOn: (p: string) => p === 'instagram' || p === 'facebook',
  request: async (method: string, path: string, body?: unknown) => {
    requests.push({ call: `${method} ${path}`, body })
    if (refused.has(`${method} ${path}`)) throw new Error('a story needs a free day')
    return {}
  },
  push: (_brandId: string, send: () => Promise<unknown>) => void send().catch(() => undefined),
  // The final edit lands on the core's files: here, a stable address at once.
  upload: async (_brandId: string, file: File) =>
    `https://files.test/${file.name}#${file.type.startsWith('video/') ? 'video' : 'photo'}`,
  sent: (_brandId: string, send: () => Promise<unknown>) =>
    send().then(
      () => null,
      (err: Error) => err.message,
    ),
  onState: (hydrate: (id: string, state: unknown) => void) => {
    hydrators.push(hydrate)
    return () => undefined
  },
}))
const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate/cv-blindfold',
  useRouter: () => ({ push, replace: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
let blobs = 0
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  const url = URL as {
    createObjectURL?: (f: Blob) => string
    revokeObjectURL?: (url: string) => void
  }
  url.createObjectURL = () => `blob:file-${++blobs}`
  url.revokeObjectURL = () => undefined
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return this.getAttribute('src') ?? ''
    },
    set(this: HTMLMediaElement, v: string) {
      this.setAttribute('src', v)
      queueMicrotask(() => this.onerror?.(new Event('error')))
    },
  })
})

/** The brand's state as the core sends it: its ideas, no posts yet, Instagram and Facebook linked. */
const state = () => ({
  brand: { id: 'casa-vostra' },
  posts: [],
  ideas: IDEAS_BY_BRAND['casa-vostra'].ideas.map((c) => ({
    id: c.id,
    format: c.format,
    pillar: c.pillar,
    hook: c.hook,
    angle: c.angle,
    feature: c.feature,
    image: c.image ?? null,
    source: c.source,
    status: 'idea',
    inspiration: c.inspiration,
    shots: c.shots,
    cut: null,
    sharper: c.sharper,
    builtOn: null,
  })),
  shoots: [],
  crew: [],
  inbox: { people: [], messages: [] },
  kit: {
    voice: { summary: '', words: [], examples: [] },
    colours: [],
    logo: { src: null, name: null },
  },
  files: [],
  versions: [],
  shareLinks: [],
  comments: [],
  connections: [
    { key: 'ig', status: 'connected' },
    { key: 'fb', status: 'connected' },
    { key: 'tt', status: 'connected' },
  ],
  pasted: [],
  moodboard: null,
})

beforeEach(() => {
  resetIdeas()
  requests.length = 0
  refused.clear()
  push.mockClear()
  act(() => hydrators.forEach((h) => h('casa-vostra', state())))
})

const open = (id: string) =>
  render(
    <BrandProvider>
      <IdeaPage id={id} />
    </BrandProvider>,
  )
const schedule = () => screen.getByRole('button', { name: /^Continue to post/ })
const calls = () => requests.map((r) => r.call)

/** Picks the first open day ahead and 18:00: the core's calendar runs on real dates. */
function pickADay() {
  fireEvent.click(screen.getByRole('button', { name: 'Post date' }))
  const picker = screen.getByRole('dialog', { name: 'Post date' })
  const day = within(picker)
    .getAllByRole('button', { name: /^\w{3} \d{1,2} \w{3}/ })
    .find((b) => !(b as HTMLButtonElement).disabled)
  fireEvent.click(day!)
  fireEvent.click(within(picker).getByRole('radio', { name: /18:00/ }))
}

describe('scheduling an idea on the core', () => {
  it('makes the post as a draft on its day, then opens the composer, the one place that sends', async () => {
    // Two reviews found a send path of the page's own wrong (no caption, the media rules and a
    // new account skipped): the page plans, the composer sends.
    open('cv-blindfold')
    expect(schedule()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Add the final video'), {
      target: { files: [new File(['x'], 'cut.mp4', { type: 'video/mp4' })] },
    })
    pickADay()
    await waitFor(() => expect(schedule()).toBeEnabled())
    // It goes on to the post, which schedules; it does not say Schedule itself.
    expect(schedule()).not.toHaveTextContent(/Schedule/)
    expect(screen.queryByRole('group', { name: 'Accounts' })).toBeNull()
    requests.length = 0
    fireEvent.click(schedule())
    const plan = requests.find(
      (r) => r.call === 'POST /brands/casa-vostra/ideas/cv-blindfold/plan',
    )!
    expect(plan.body).toMatchObject({ stage: 'draft', time: '18:00' })
    const id = (plan.body as { postId: string }).postId
    // On to the composer once the core has the post.
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/post/${id}`))
    // Nothing is sent or marked from here.
    expect(calls().some((c) => c.endsWith('/send') || c.endsWith('/mark'))).toBe(false)
    expect(screen.getByRole('link', { name: /Draft · / })).toBeInTheDocument()
  })

  it('opens a story in the composer too, where the core says what it can take', async () => {
    open('cv-st-poll')
    fireEvent.change(screen.getByLabelText('Add the final photo or video'), {
      target: { files: [new File(['x'], 'frame.png', { type: 'image/png' })] },
    })
    // A story has no tile: a day makes it a draft post at once, in the story row.
    pickADay()
    await waitFor(() => expect(schedule()).toBeEnabled())
    const plan = requests.find((r) => r.call.endsWith('/plan'))!
    expect(plan.body).toMatchObject({ stage: 'draft' })
    requests.length = 0
    fireEvent.click(schedule())
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/post/${(plan.body as { postId: string }).postId}`),
    )
    expect(calls().some((c) => c.endsWith('/send') || c.endsWith('/mark'))).toBe(false)
  })

  it('stays on the idea when the core refuses the plan: the post is not there to open', async () => {
    refused.add('POST /brands/casa-vostra/ideas/cv-blindfold/plan')
    open('cv-blindfold')
    fireEvent.change(screen.getByLabelText('Add the final video'), {
      target: { files: [new File(['x'], 'cut.mp4', { type: 'video/mp4' })] },
    })
    pickADay()
    await waitFor(() => expect(schedule()).toBeEnabled())
    fireEvent.click(schedule())
    await waitFor(() =>
      expect(calls()).toContain('POST /brands/casa-vostra/ideas/cv-blindfold/plan'),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(push).not.toHaveBeenCalled()
  })
})
