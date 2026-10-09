import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BRAND_CONTENT } from '@/data/brands'
import { feedsOf, type FeedMark } from '@/data/demo'
import { IDEAS_BY_BRAND } from '@/data/ideas'
import { IdeaPage } from '@/features/ideate/idea-page'
import { ideaOfTile, resetIdeas, useIdeas } from '@/features/ideate/ideas-store'

import { BrandProvider } from './posts-store'
import { IdeaPills } from './day-view'
import { IdeaTile } from './week-grid'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push }),
}))

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

beforeEach(() => {
  resetIdeas()
  push.mockClear()
})

type IdeaMark = Extract<FeedMark, { kind: 'idea' }>

const f1: IdeaMark = {
  kind: 'idea',
  format: 'reel',
  hook: 'Pizza before the lights go out.',
  why: 'F1 weekend',
}
const dough: IdeaMark = {
  kind: 'idea',
  format: 'reel',
  hook: 'Watch the dough become tagliatelle.',
  why: 'Hand-made reels hold viewers 2× longer',
  suggested: true,
}

/** The brand's ideas, counted, read from the store beside the tile. */
function Count() {
  return <output data-testid="count">{useIdeas('casa-vostra').ideas.length}</output>
}

const show = (mark: IdeaMark) =>
  render(
    <BrandProvider>
      <IdeaTile mark={mark} dayN="9" />
      <Count />
    </BrandProvider>,
  )

describe('an idea tile on the calendar', () => {
  it('reads as a plan, not a post, and opens the idea page, never the composer', () => {
    show(f1)
    const tile = screen.getByRole('button', { name: /^Idea: Pizza before the lights go out/ })
    expect(tile).toHaveTextContent('Idea')
    expect(tile).toHaveTextContent('F1 weekend')
    expect(tile).toHaveTextContent('Reel')
    fireEvent.click(tile)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0]![0]).toMatch(/^\/ideate\/casa-vostra-new-\d+$/)
    expect(push.mock.calls[0]![0]).not.toMatch(/\/post/)
  })

  it('makes the idea for a tile that has none, from its moment, exactly once', () => {
    show(f1)
    const before = Number(screen.getByTestId('count').textContent)
    const tile = screen.getByRole('button', { name: /^Idea: Pizza before/ })
    fireEvent.click(tile)
    fireEvent.click(tile)
    expect(Number(screen.getByTestId('count').textContent)).toBe(before + 1)
    // Both clicks go to the same page, and the idea carries the moment's seed.
    expect(push.mock.calls[1]![0]).toBe(push.mock.calls[0]![0])
    const id = (push.mock.calls[0]![0] as string).split('/').at(-1)!
    const seed = IDEAS_BY_BRAND['casa-vostra'].moments.find((m) => m.id === 'cv-m-f1')!.seed
    expect(ideaOfTile('casa-vostra', f1)).toBe(id)
    expect(screen.getByTestId('count')).toHaveTextContent(String(before + 1))
    const { result } = renderHook(() => useIdeas('casa-vostra'))
    const made = result.current.ideas.find((i) => i.id === id)!
    expect(made.shots.map((s) => s.title)).toEqual(seed.shots.map((s) => s.title))
  })

  it('resolves every seeded tile of every brand to a card or a moment, never a bare idea', () => {
    // A bare idea has no shots; a tile that falls through to one has lost its plan.
    for (const c of BRAND_CONTENT) {
      const tiles = c.weeks.flatMap((w) =>
        w.days.flatMap((d) => feedsOf(d).filter((f) => f.kind === 'idea')),
      )
      for (const tile of tiles) {
        const id = ideaOfTile(c.brand.id, tile)
        const { result } = renderHook(() => useIdeas(c.brand.id))
        const card = result.current.ideas.find((i) => i.id === id)!
        expect(card.shots.length, `${c.brand.name}: ${tile.hook}`).toBeGreaterThan(0)
      }
    }
  })

  it('makes a bare idea for a tile with neither a card nor a moment, once', () => {
    const stray = { format: 'reel' as const, hook: 'A tile from nowhere.', why: 'Someone typed it' }
    const n = IDEAS_BY_BRAND.carlitos.ideas.length
    const a = ideaOfTile('carlitos', stray, '11')
    const b = ideaOfTile('carlitos', stray, '11')
    expect(a).toBe(b)
    const { result } = renderHook(() => useIdeas('carlitos'))
    expect(result.current.ideas).toHaveLength(n + 1)
    expect(result.current.ideas.at(-1)).toMatchObject({
      hook: stray.hook,
      angle: stray.why,
      dayN: '11',
      shots: [],
      source: { kind: 'own' },
    })
  })

  it('opens the team idea behind a suggested tile, by its hook', () => {
    show(dough)
    const tile = screen.getByRole('button', { name: /^Suggested: Watch the dough/ })
    expect(tile).toHaveTextContent('Suggested')
    fireEvent.click(tile)
    expect(push).toHaveBeenCalledWith('/ideate/cv-dough')
  })

  it("opens a suggestion's own page before anyone pressed Suggest, with Keep it and Skip", () => {
    // The tile the ideas page puts down for a suggestion resolves to the suggested card.
    const id = ideaOfTile('casa-vostra', {
      format: 'reel',
      hook: 'The 6am dough shift.',
      why: 'Suggested',
    })
    expect(id).toBe('cv-s-dough-shift')
    render(
      <BrandProvider>
        <IdeaPage id={id} />
      </BrandProvider>,
    )
    expect(screen.getByLabelText('Hook')).toHaveValue('The 6am dough shift.')
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
  })

  it("folds a day's ideas past six behind one button, so many still fit above the hours", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      kind: 'idea' as const,
      format: 'reel' as const,
      hook: `Idea number ${i + 1}.`,
      why: 'Team idea',
    }))
    render(
      <BrandProvider>
        <IdeaPills ideas={many} dayN="9" />
      </BrandProvider>,
    )
    expect(screen.getAllByRole('button', { name: /^Idea: Idea number/ })).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: '+3 more' }))
    expect(screen.getAllByRole('button', { name: /^Idea: Idea number/ })).toHaveLength(9)
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull()
  })
})
