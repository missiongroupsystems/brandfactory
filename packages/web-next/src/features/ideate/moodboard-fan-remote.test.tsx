import { act, render, screen, waitFor, within } from '@testing-library/react'
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

describe('the moodboard’s empty state on the core', () => {
  it('fans out the same four photos as before, as decoration only', () => {
    openMoodboard(false)
    const empty = screen.getByRole('region', { name: 'Connect your accounts' })
    expect(within(empty).getByText('Bring in your moodboard')).toBeVisible()
    // The four photos the fan showed before 2.35.2, whatever the brand.
    expect(photos(empty)).toEqual([
      '/demo/pins/cv-p-1.jpg',
      '/demo/pins/cv-p-2.jpg',
      '/demo/pins/cv-p-4.jpg',
      '/demo/pins/cv-p-5.jpg',
    ])
    // Hidden from screen readers and nothing to press: the only buttons are the three sources.
    const fan = empty.querySelector('img')!.closest('[aria-hidden="true"]')
    expect(fan).not.toBeNull()
    expect(within(empty).queryAllByRole('img')).toHaveLength(0)
    expect(
      within(empty)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Pinterest', 'Instagram DMs', 'TikTok'])
    // Nothing of the demo's moodboard comes with the photos: no board names, captions or handles.
    expect(screen.queryByText('Pasta shots')).toBeNull()
    expect(screen.queryByText('Pizza close-ups')).toBeNull()
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
