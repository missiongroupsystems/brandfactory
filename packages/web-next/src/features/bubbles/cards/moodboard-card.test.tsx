import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { referenceById } from '@/data/ideas'
import { resetIdeas, showIdeas, useIdeasById } from '@/features/ideate/ideas-store'

afterEach(() => resetIdeas())

import { mergeInspiration, MoodboardPicksCard } from './moodboard-card'
import { MoodboardTile } from './moodboard-tile'

vi.mock('next/navigation', () => ({
  usePathname: () => '/bubbles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

const post = (id: string) => referenceById('casa-vostra', id)!
const tile = (id: string) =>
  screen.getByRole('button', { name: `${post(id).account}: ${post(id).borrow}` })

describe('mergeInspiration', () => {
  it('keeps keys the card did not show, drops shown unticked ones, appends new ticks in order', () => {
    const current = ['file:a', 'p1', 'p2', 'p3']
    const shown = ['x', 'y', 'p1', 'p2', 'p3']
    expect(mergeInspiration(current, shown, ['y', 'x', 'p1', 'p3'])).toEqual([
      'file:a',
      'p1',
      'p3',
      'y',
      'x',
    ])
  })
  it('leaves an idea alone when every shown key stays ticked', () => {
    expect(mergeInspiration(['p1', 'p2'], ['p1', 'p2', 'p3'], ['p1', 'p2'])).toEqual(['p1', 'p2'])
  })
  it('empties what it showed when nothing is ticked', () => {
    expect(mergeInspiration(['p1', 'file:a'], ['p1'], [])).toEqual(['file:a'])
  })
})

describe('MoodboardTile', () => {
  it('is a pressed button once ticked', () => {
    function Host() {
      const [on, setOn] = React.useState(false)
      return <MoodboardTile post={post('cv-p-1')} ticked={on} onToggle={() => setOn(!on)} />
    }
    render(<Host />)
    const b = tile('cv-p-1')
    expect(b).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('MoodboardPicksCard', () => {
  it("shows the picks ticked before the idea's own posts, and saves the merged list", () => {
    const onSave = vi.fn()
    render(
      <MoodboardPicksCard
        brandId="casa-vostra"
        ideaId="cv-dough"
        picks={['cv-p-1', 'cv-p-2']}
        why="Both sit in the morning light."
        onSave={onSave}
        onUse={vi.fn()}
      />,
    )
    const card = screen.getByRole('group', {
      name: 'Moodboard picks for Watch the dough become tagliatelle.',
    })
    expect(card).toHaveTextContent('Picked')
    expect(card).toHaveTextContent('Both sit in the morning light.')
    const tiles = within(card).getAllByRole('button', { pressed: true })
    // Bubbles' two picks first, then the idea's own posts (cv-r-sfoglina, cv-p-7, cv-p-10, cv-p-3).
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual(
      ['cv-p-1', 'cv-p-2', 'cv-r-sfoglina', 'cv-p-7', 'cv-p-10', 'cv-p-3'].map(
        (id) => `${post(id).account}: ${post(id).borrow}`,
      ),
    )
    // Only those six show; the rest of the moodboard waits behind one "+N" tile.
    const posts = within(card).getByRole('list', { name: 'Moodboard posts' })
    expect(within(posts).getAllByRole('listitem')).toHaveLength(7)
    expect(
      screen.queryByRole('button', { name: `${post('cv-p-5').account}: ${post('cv-p-5').borrow}` }),
    ).toBeNull()
    const more = within(card).getByRole('button', { name: /^Show \d+ more moodboard posts$/ })
    expect(more).toHaveTextContent(/^\+\d+$/)
    fireEvent.click(more)
    expect(within(card).queryByRole('button', { name: /^Show \d+ more/ })).toBeNull()
    expect(within(posts).getAllByRole('listitem').length).toBeGreaterThan(7)
    // Untick one of the idea's posts, tick one more from the rest.
    fireEvent.click(tile('cv-p-3'))
    fireEvent.click(tile('cv-p-5'))
    fireEvent.click(within(card).getByRole('button', { name: 'Save to idea' }))
    expect(onSave).toHaveBeenCalledWith([
      'cv-r-sfoglina',
      'cv-p-7',
      'cv-p-10',
      'cv-p-1',
      'cv-p-2',
      'cv-p-5',
    ])
  })

  it('without an idea, Use these hands over the ticked keys in tick order', () => {
    const onUse = vi.fn()
    render(
      <MoodboardPicksCard
        brandId="casa-vostra"
        picks={['cv-p-1']}
        onSave={vi.fn()}
        onUse={onUse}
      />,
    )
    const card = screen.getByRole('group', { name: 'Moodboard picks' })
    fireEvent.click(within(card).getByRole('button', { name: /^Show \d+ more/ }))
    fireEvent.click(tile('cv-p-2'))
    fireEvent.click(within(card).getByRole('button', { name: 'Use these' }))
    expect(onUse).toHaveBeenCalledWith(['cv-p-1', 'cv-p-2'])
  })

  it('keeps the posts of an idea that loads after the card did, ticked, and saves them', () => {
    const dough = renderHook(() => useIdeasById()).result.current.get('cv-dough')!.card
    showIdeas('casa-vostra', [])
    const onSave = vi.fn()
    render(
      <MoodboardPicksCard
        brandId="casa-vostra"
        ideaId="cv-dough"
        picks={['cv-p-1', 'cv-p-2']}
        onSave={onSave}
        onUse={vi.fn()}
      />,
    )
    // Not there yet: nothing to save to.
    expect(screen.getByRole('button', { name: 'Use these' })).toBeTruthy()
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2)
    act(() => showIdeas('casa-vostra', [dough]))
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Save to idea' }))
    expect(onSave).toHaveBeenCalledWith([
      'cv-r-sfoglina',
      'cv-p-7',
      'cv-p-10',
      'cv-p-3',
      'cv-p-1',
      'cv-p-2',
    ])
  })

  it('treats an idea the store does not have as no idea', () => {
    const onUse = vi.fn()
    render(
      <MoodboardPicksCard
        brandId="casa-vostra"
        ideaId="gone"
        picks={['cv-p-1']}
        onSave={vi.fn()}
        onUse={onUse}
      />,
    )
    expect(screen.getByRole('group', { name: 'Moodboard picks' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use these' }))
    expect(onUse).toHaveBeenCalledWith(['cv-p-1'])
  })

  it('has no live button when nothing resolves to show', () => {
    render(
      <MoodboardPicksCard
        brandId="casa-vostra"
        picks={['nope']}
        onSave={vi.fn()}
        onUse={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Use these' })).toBeDisabled()
  })

  it('locks once decided: no button, the tiles take no tap', () => {
    render(
      <MoodboardPicksCard
        brandId="casa-vostra"
        ideaId="cv-dough"
        picks={['cv-p-1']}
        decided="saved"
        onSave={vi.fn()}
        onUse={vi.fn()}
      />,
    )
    expect(screen.getByText('Saved to idea')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save to idea' })).toBeNull()
    expect(tile('cv-p-1')).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Show \d+ more/ })).toBeDisabled()
  })
})
