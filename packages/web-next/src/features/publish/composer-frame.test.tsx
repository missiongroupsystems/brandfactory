import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
const core = vi.hoisted(() => ({
  loaded: false,
  shots: null as unknown,
  media: null as unknown,
  /**
   * A refusal of the save's media: `source` as a core on a pack before 1.20.0 refuses it, or
   * another property, which no save may get past.
   */
  refuse: null as null | 'source' | 'other',
}))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    sent: (brandId: string, send: () => Promise<unknown>) => sent(brandId, send),
    request: async (method: string, path: string, body?: unknown) => {
      bodies.push({ call: `${method} ${path}`, body })
      const media = (body as { media?: Array<{ source?: string }> } | undefined)?.media
      const named = core.refuse === 'other' || media?.some((m) => m.source !== undefined)
      if (core.refuse && method === 'PATCH' && named) {
        const { RemoteError } = await import('@/lib/remote')
        const at = (media ?? []).findIndex((m) => m.source !== undefined)
        throw new RemoteError(400, 'VALIDATION', 'validation failed', [
          {
            instancePath: `/media/${at}`,
            keyword: 'additionalProperties',
            params: { additionalProperty: core.refuse },
            message: 'must NOT have additional properties',
          },
        ])
      }
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
      if (core.media) {
        const p = state.posts.find((x) => x.id === 'ravioli') as { media: unknown }
        p.media = core.media
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
const shapes = vi.hoisted(() => ({
  ratio: 9 / 16,
  hold: false,
  broken: false,
  waiting: [] as Array<() => void>,
}))
vi.mock('./shot', async (original) => ({
  ...(await original<typeof Shot>()),
  ratioOf: (_src: string) =>
    new Promise<number | null>((resolve) => {
      if (shapes.broken) resolve(null)
      else if (shapes.hold) shapes.waiting.push(() => resolve(shapes.ratio))
      else resolve(shapes.ratio)
    }),
}))
// The cuts a save makes, by the part of each photo.
// The cuts a save makes, by the part of each photo; as in the browser, one tab cuts the same part
// of a photo once, and a cut the post already has is known (`knownCut`). A new tab knows none.
const cuts = vi.hoisted(() => [] as Array<{ src: string; box: Box }>)
const known = vi.hoisted(() => new Map<string, string>())
const partKey = (src: string, box: Box) =>
  [src, ...[box.left, box.top, box.width, box.height].map((v) => v.toFixed(6))].join('|')
vi.mock('./cut', () => ({
  cutPhoto: async (_b: string, src: string, box: Box) => {
    const had = known.get(partKey(src, box))
    if (had) return had
    cuts.push({ src, box })
    const made = `https://core.test/files/s/brandbase/cut-${cuts.length}.jpg`
    known.set(partKey(src, box), made)
    return made
  },
  knownCut: (src: string, box: Box, cut: string) => known.set(partKey(src, box), cut),
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
  known.clear()
  core.shots = null
  core.media = null
  core.refuse = null
  shapes.ratio = 9 / 16
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

/** The post as the app opens it: from the brand's state, as the server keeps it. */
function Opened() {
  const post = useBrand().byId('ravioli')!
  return <Composer post={{ ...post, channels: [...ravioli.channels] }} />
}

async function open() {
  render(
    <BrandProvider>
      <Loaded>
        <Opened />
      </Loaded>
    </BrandProvider>,
  )
  // The photos load.
  await act(async () => undefined)
}
/** The files the last save sent, as the PATCH carried them. */
const sentMedia = () =>
  (
    bodies.find((b) => b.call === 'PATCH /brands/casa-vostra/posts/ravioli')?.body as {
      media: Array<{ src: string; source?: string }>
    }
  ).media

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

describe('what Facebook gets of a photo the post cut by itself', () => {
  it('names the whole photo as the source of a photo cut to Instagram’s part', async () => {
    await open()
    await save()
    const media = sentMedia()
    // Both tall photos are cut to their middle 4:5; each names its whole photo for Facebook.
    expect(media[0]!.src).toMatch(/cut-\d+\.jpg$/)
    expect(media[0]!.source).toBe(PHOTO.ravioli)
    expect(media[1]!.source).toBe(PHOTO.tagliatelle)
    // No cut beyond those two: the whole photos are already the post's own files.
    expect(cuts).toHaveLength(2)
  })

  it('names the person’s own crop when Instagram cuts it further', async () => {
    // A tall crop, zoomed in: still 9:16, so Instagram shows its middle 4:5.
    const tall = { aspect: '9:16' as const, zoom: 1.5, x: 0, y: 0, ratio: 9 / 16 }
    core.shots = [
      { crop: tall, tags: [] },
      { crop: null, tags: [] },
    ]
    await open()
    await save()
    // The crop is cut too, for Facebook: the photo of the crop, not Instagram's 4:5 of it.
    const own = cuts.find((c) => c.src === PHOTO.ravioli && Math.abs(c.box.height - 1 / 1.5) < 1e-6)
    expect(own).toBeDefined()
    expect(sentMedia()[0]!.source).toMatch(/cut-\d+\.jpg$/)
    expect(sentMedia()[0]!.source).not.toBe(sentMedia()[0]!.src)
  })

  it('names nothing, and cuts nothing more, when Instagram shows the photo as it is', async () => {
    shapes.ratio = 4 / 5
    await open()
    await save()
    expect(cuts).toEqual([])
    expect(sentMedia().every((m) => m.source === undefined)).toBe(true)
  })
})

describe('a post opened again and saved with no change', () => {
  it('sends the same files, so the yes given for them still matches', async () => {
    // The second photo carries the person's own crop, and Instagram cuts it further to 4:5.
    const tall = { aspect: '9:16' as const, zoom: 1.5, x: 0, y: 0, ratio: 9 / 16 }
    core.shots = [
      { crop: null, tags: [] },
      { crop: tall, tags: [] },
    ]
    await open()
    await save()
    const first = {
      media: sentMedia(),
      shots: (bodies.at(-1)!.body as { draft: { shots: unknown } }).draft.shots,
    }
    expect(first.media[1]!.source).toMatch(/cut-\d+\.jpg$/)
    // A new tab: the post as the server keeps it, and no cut known yet.
    cleanup()
    known.clear()
    bodies.length = 0
    core.media = first.media.map((m) => ({ ...m, kind: 'photo' }))
    core.shots = first.shots
    await open()
    await save()
    expect(sentMedia()).toEqual(first.media)
  })
})

describe('a save to a core whose pack does not take a source yet', () => {
  it('saves again without it, so the post saves as before and Facebook gets the cut', async () => {
    core.refuse = 'source'
    await open()
    await save()
    const patches = bodies.filter((b) => b.call === 'PATCH /brands/casa-vostra/posts/ravioli')
    expect(patches).toHaveLength(2)
    const media = (patches[1]!.body as { media: Array<{ src: string; source?: string }> }).media
    expect(media.every((m) => m.source === undefined)).toBe(true)
    expect(media[0]!.src).toMatch(/cut-\d+\.jpg$/)
  })

  it('does not try again for any other refusal', async () => {
    core.refuse = 'other'
    await open()
    fireEvent.click(screen.getAllByRole('button', { name: /^Save/ })[0]!)
    await expect(sent.mock.calls.at(-1)![1]()).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(bodies.filter((b) => b.call.startsWith('PATCH'))).toHaveLength(1)
  })
})
