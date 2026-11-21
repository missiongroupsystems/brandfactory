import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PHOTO, POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as NotAvailable from '@/features/connections/not-available'
import type * as RosterStore from '@/features/roster/roster-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'
import { feedFrames, sameBox, shotOf, type Box } from './model'
import type * as Shot from './shot'

// The composer on the API, for what a save sends: the cut of each photo and the part of it its
// tags sit on. `land` runs the save the composer handed to the queue.
let answer: (refusal: string | null) => void = () => undefined
const sent = vi.fn(
  (_brandId: string, _send: () => Promise<unknown>) =>
    new Promise<string | null>((resolve) => (answer = resolve)),
)
const bodies: Array<{ call: string; body: unknown }> = []
const core = vi.hoisted(() => ({ loaded: false, shots: null as unknown }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    sent: (brandId: string, send: () => Promise<unknown>) => sent(brandId, send),
    request: async (method: string, path: string, body?: unknown) => {
      bodies.push({ call: `${method} ${path}`, body })
      return {}
    },
    push: vi.fn(),
    loadBrand: vi.fn(async () => undefined),
    report: vi.fn(),
    onState: (hydrate: (id: string, state: unknown) => void) => {
      if (!core.loaded) return () => undefined
      const state = demoAsCore('casa-vostra')
      if (core.shots) {
        const p = state.posts.find((x) => x.id === 'ravioli') as { draft: unknown }
        p.draft = { shots: core.shots }
      }
      hydrate('casa-vostra', state)
      return () => undefined
    },
  }
})
vi.mock('@/features/connections/not-available', async (original) => ({
  ...(await original<typeof NotAvailable>()),
  notAvailable: () => false,
}))
vi.mock('@/features/roster/roster-store', async (original) => ({
  ...(await original<typeof RosterStore>()),
  loadRoster: async () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/ravioli',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
// Each photo's shape, as the browser would measure it once it loads: both tall, 9:16. `hold`
// keeps them unmeasured until a test lets them load.
const shapes = vi.hoisted(() => ({ hold: false, broken: false, waiting: [] as Array<() => void> }))
vi.mock('./shot', async (original) => ({
  ...(await original<typeof Shot>()),
  ratioOf: (_src: string) =>
    new Promise<number | null>((resolve) => {
      if (shapes.broken) resolve(null)
      else if (shapes.hold) shapes.waiting.push(() => resolve(9 / 16))
      else resolve(9 / 16)
    }),
}))
// The cuts a save makes, by the part of each photo.
const cuts = vi.hoisted(() => [] as Array<{ src: string; box: Box }>)
vi.mock('./cut', () => ({
  cutPhoto: async (_b: string, src: string, box: Box) => {
    cuts.push({ src, box })
    return `https://core.test/files/s/brandbase/cut-${cuts.length}.jpg`
  },
  knownCut: () => undefined,
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
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T02:00:00Z'))
  resetConnections()
  resetIdeas()
  sent.mockClear()
  bodies.length = 0
  cuts.length = 0
  core.shots = null
  shapes.hold = false
  shapes.broken = false
  shapes.waiting.length = 0
})
afterEach(() => vi.useRealTimers())

function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}
const ravioli = { ...POSTS.find((p) => p.id === 'ravioli')!, channels: ['ig', 'fb'] as const }
// What Instagram shows of the two tall photos: the centred 4:5 of each.
const [frame] = feedFrames(
  [shotOf(PHOTO.ravioli), shotOf(PHOTO.tagliatelle)],
  { [PHOTO.ravioli]: 9 / 16, [PHOTO.tagliatelle]: 9 / 16 },
  'carousel',
  true,
)
const tagged = [{ handle: '@ana', at: { x: 0.5, y: 0.9 } }]

async function open() {
  render(
    <BrandProvider>
      <Loaded>
        <Composer post={{ ...ravioli, channels: [...ravioli.channels] }} />
      </Loaded>
    </BrandProvider>,
  )
  // The photos load.
  await act(async () => undefined)
}
async function save() {
  // "Save", or "Save and send …" once the accounts changed.
  fireEvent.click(screen.getAllByRole('button', { name: /^Save/ })[0]!)
  const run = sent.mock.calls.at(-1)![1]()
  // Photos still loading load now, while the save waits for them.
  for (const go of shapes.waiting.splice(0)) go()
  await run
  await act(async () => answer(null))
  const patch = bodies.find((b) => b.call === 'PATCH /brands/casa-vostra/posts/ravioli')
  return (patch?.body as { draft: { shots: Array<{ frame?: Box; tags: unknown }> } }).draft.shots
}

describe('what a save sends of a tagged photo', () => {
  it('cuts each photo to the part its tags sit on', async () => {
    core.shots = [
      { crop: null, tags: tagged, frame: frame!.box },
      { crop: null, tags: [] },
    ]
    await open()
    const shots = await save()
    expect(sameBox(cuts[0]!.box, frame!.box)).toBe(true)
    expect(sameBox(shots[0]!.frame!, cuts[0]!.box)).toBe(true)
    expect(shots[0]!.tags).toEqual(tagged)
  })

  it('keeps the part the tags sit on while Instagram is off', async () => {
    core.shots = [
      { crop: null, tags: tagged, frame: frame!.box },
      { crop: null, tags: [] },
    ]
    await open()
    fireEvent.click(screen.getByRole('checkbox', { name: /Instagram/ }))
    const shots = await save()
    // Without Instagram the photo goes whole, but its tags keep their part for the next save.
    expect(cuts).toEqual([])
    expect(sameBox(shots[0]!.frame!, frame!.box)).toBe(true)
    expect(shots[0]!.tags).toEqual(tagged)
  })

  it('measures a photo first when the save comes before it has loaded', async () => {
    shapes.hold = true
    core.shots = [
      { crop: null, tags: tagged, frame: frame!.box },
      { crop: null, tags: [] },
    ]
    await open()
    const shots = await save()
    // Sent as the part the tags sit on, not whole with the tags on another part.
    expect(sameBox(cuts[0]!.box, frame!.box)).toBe(true)
    expect(sameBox(shots[0]!.frame!, frame!.box)).toBe(true)
  })

  it('frames, cuts and moves nothing for a photo that does not load', async () => {
    shapes.broken = true
    // Tags placed on the whole photo: a guessed shape would move them, or take them off.
    core.shots = [
      { crop: null, tags: tagged },
      { crop: null, tags: [] },
    ]
    await open()
    const shots = await save()
    expect(cuts).toEqual([])
    expect(shots[0]!.tags).toEqual(tagged)
    expect(shots[0]!.frame).toBeUndefined()
  })
})

describe('a tag near the bottom of the photo', () => {
  it('puts its label above its arrow, inside the photo, with the arrow on the spot', async () => {
    core.shots = [
      { crop: null, tags: tagged, frame: frame!.box },
      { crop: null, tags: [] },
    ]
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^More options/, expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }))
    const arrow = document.querySelector<HTMLElement>('[data-arrow="@ana"]')!
    expect(arrow.style.left).toBe('50%')
    expect(arrow.className).toContain('border-t-black/80')
    const label = screen.getByRole('button', { name: 'Remove the tag @ana' }).parentElement!
    expect(label.style.translate).toBe('-50% -100%')
  })
})
