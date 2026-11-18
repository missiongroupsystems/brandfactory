import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type { BrandState } from '@/lib/remote'
import type * as Remote from '@/lib/remote'

import { IdeatePage } from './ideate-page'

// On the core: `data/ideas.ts` reads the flag when it loads, so it is set before any import.
// No brand on the core has the demo's moodboard, so the empty state's fan of photos is the same
// four for every brand.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'https://core.test'
})
const hydrate = vi.hoisted(() => {
  const fns: Array<(id: string, s: BrandState) => void> = []
  return { fns, fn: (id: string, s: BrandState) => fns.forEach((f) => f(id, s)) }
})
const answers = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  platformOn: (platform: string) => platform === 'pinterest',
  onState: (fn: (id: string, s: BrandState) => void) => {
    const stack = new Error().stack ?? ''
    if (stack.includes('ideas-store') || stack.includes('connections-store')) hydrate.fns.push(fn)
    return () => undefined
  },
  onAccount: () => () => undefined,
  push: (_brandId: string, send: () => Promise<unknown>) => void send(),
  report: () => undefined,
  request: async (_method: string, path: string) => answers[path] ?? {},
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

const state = (pinterest: boolean): BrandState => ({
  brand: { id: 'casa-vostra', name: 'Casa Vostra' },
  ideas: [],
  connections: pinterest ? [{ key: 'pinterest', status: 'connected' }] : [],
  pinterest: pinterest ? { username: 'brand.pins' } : null,
  moodboard: { boards: [], posts: [] },
})

const openMoodboard = (pinterest: boolean) => {
  const view = render(
    <BrandProvider>
      <IdeatePage />
    </BrandProvider>,
  )
  act(() => hydrate.fn('casa-vostra', state(pinterest)))
  return view
}

/** The photo files the page draws, read back from next/image's addresses. */
const photos = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('img')).map(
    (img) =>
      decodeURIComponent(img.getAttribute('src') ?? '').match(/\/demo\/pins\/[\w-]+\.jpg/)?.[0],
  )

describe('the moodboard on the core', () => {
  it('shows Shared at once, with no fan and none of the demo’s moodboard, before Pinterest is linked', async () => {
    const { container } = openMoodboard(false)
    expect(screen.queryByText('Bring in your moodboard')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Shared' })).toBeVisible()
    expect(container.querySelectorAll('svg[viewBox="0 0 100 132"]')).toHaveLength(0)
    // The one source to add on the live app is Pinterest.
    expect(screen.getByRole('button', { name: 'Add a source' })).toBeVisible()
    expect(screen.queryByText('Pasta shots')).toBeNull()
    expect(screen.queryByText('Pizza close-ups')).toBeNull()
  })

  it('shows a captured reel as added by its sender, opening the post on Instagram', async () => {
    const view = render(
      <BrandProvider>
        <IdeatePage />
      </BrandProvider>,
    )
    act(() =>
      hydrate.fn('casa-vostra', {
        ...state(false),
        pasted: [
          {
            id: 'meta-cap1',
            platform: 'ig',
            account: '@ana.cooks',
            addedBy: '@ana.cooks',
            link: 'https://www.instagram.com/reel/DAbc123xyz/',
            image: '',
            video: 'https://core.test/files/sig/brandbase/x.mp4',
            borrow: 'Shared reel',
            seed: {
              format: 'reel',
              pillar: 'Craft',
              hook: 'h',
              angle: 'a',
              feature: '',
              shots: [],
              sharper: [],
            },
          },
        ],
      } as BrandState),
    )
    const open = await screen.findByRole('link', { name: 'Open on Instagram: Shared reel' })
    expect(open).toHaveAttribute('href', 'https://www.instagram.com/reel/DAbc123xyz/')
    expect(open).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Added by')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Pick Shared reel' })).toBeVisible()
    view.unmount()
  })

  it('shows the linked board’s own pins and no fan', async () => {
    answers['/brands/casa-vostra/pinterest/pins'] = {
      boards: [
        {
          id: '1',
          name: 'Tacos',
          url: 'https://www.pinterest.com/brand.pins/tacos/',
          pins: [
            {
              id: 'p1',
              title: 'Tacos at dusk',
              link: null,
              image: 'https://i.pinimg.com/600x/p1.jpg',
              width: 600,
              height: 900,
            },
          ],
        },
      ],
    }
    const { container } = openMoodboard(true)
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Tacos at dusk/ })).toBeVisible(),
    )
    expect(screen.queryByText('Bring in your moodboard')).toBeNull()
    expect(photos(container).filter(Boolean)).toEqual([])
  })
})
