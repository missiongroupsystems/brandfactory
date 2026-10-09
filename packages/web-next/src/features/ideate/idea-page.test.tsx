import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from '@/features/schedule/posts-store'

import { IdeaPage } from './idea-page'
import { resetIdeas, suggest, useIdeas } from './ideas-store'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate/cv-blindfold',
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  resetIdeas()
  push.mockClear()
})

const open = (id: string) =>
  render(
    <BrandProvider>
      <IdeaPage id={id} />
    </BrandProvider>,
  )

const shotTitles = () =>
  ['Shot 1', 'Shot 2', 'Shot 3'].map((n) => (screen.getByLabelText(n) as HTMLTextAreaElement).value)

/** A drag as a mouse makes it: start on one, over and drop on another. */
function dragTo(from: HTMLElement, to: HTMLElement) {
  const dataTransfer = { setData: vi.fn(), types: [] as string[], effectAllowed: 'move' }
  fireEvent.dragStart(from, { dataTransfer })
  fireEvent.dragOver(to, { dataTransfer })
  fireEvent.drop(to, { dataTransfer })
  fireEvent.dragEnd(from, { dataTransfer })
}

describe('an idea page', () => {
  it('shows the idea in four stages, with a rail, and a way back to Current ideas', () => {
    open('cv-blindfold')
    expect(screen.getByLabelText('Hook')).toHaveValue('Blindfold pizza: the rematch.')
    expect(screen.getByRole('link', { name: 'Current ideas' })).toHaveAttribute(
      'href',
      '/ideate?view=ideas',
    )
    const rail = screen.getByRole('navigation', { name: 'Stages' })
    expect(
      within(rail)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['#references', '#shots', '#shoot', '#post'])
    // References are there, so the idea stands at Shots, which has no shoot day yet.
    expect(within(rail).getByRole('link', { current: 'step' })).toHaveTextContent('Shots')
    for (const name of ['References', 'Shots', 'Shoot', 'Post']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked()
    expect(shotTitles()).toEqual(['Blindfold on', 'One bite, one guess', 'The onions'])
  })

  it('makes the idea a post on the calendar when a status is picked', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(screen.getByRole('link', { name: /On the calendar · Fri 23 Oct/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in scheduler →' })).toBeInTheDocument()
  })

  it('reorders the shots by their arrows and by a drag', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Move shot 1 later' }))
    expect(shotTitles()).toEqual(['One bite, one guess', 'Blindfold on', 'The onions'])
    // The last shot dragged onto the first lands first.
    const cards = screen
      .getAllByRole('listitem')
      .filter((li) => li.dataset.drop?.startsWith('shot:'))
    dragTo(cards[2]!, cards[0]!)
    expect(shotTitles()).toEqual(['The onions', 'One bite, one guess', 'Blindfold on'])
  })

  it('shoots a shot like a reference, picked on the card or dragged onto it', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Like @dough.diaries' }))
    const shots = screen.getByRole('region', { name: 'Shots' })
    expect(within(shots).getByText('like @dough.diaries')).toBeInTheDocument()
    // The second reference (a pin) dragged onto the third shot.
    const refs = screen.getAllByRole('listitem').filter((li) => li.dataset.drop?.startsWith('ref:'))
    const cards = screen
      .getAllByRole('listitem')
      .filter((li) => li.dataset.drop?.startsWith('shot:'))
    dragTo(refs[1]!, cards[2]!)
    expect(within(shots).getByText('like Pizza close-ups')).toBeInTheDocument()
    // On the day, the list says which reference each shot follows.
    const shoot = screen.getByRole('region', { name: 'Shoot' })
    expect(within(shoot).getByText('like @dough.diaries')).toBeInTheDocument()
  })

  it('reorders the references by a drag, and the first becomes the main look', () => {
    open('cv-blindfold')
    const refs = screen.getAllByRole('listitem').filter((li) => li.dataset.drop?.startsWith('ref:'))
    expect(refs[0]).toHaveTextContent('Main look')
    expect(refs[0]).toHaveTextContent('@dough.diaries')
    dragTo(refs[2]!, refs[0]!)
    const after = screen
      .getAllByRole('listitem')
      .filter((li) => li.dataset.drop?.startsWith('ref:'))
    expect(after[0]).toHaveTextContent('Main look')
    expect(after[0]).toHaveTextContent('Cheese pull, slowed down')
    expect(after[1]).toHaveTextContent('@dough.diaries')
  })

  it('counts a captured shot toward the shoot, and a shoot day finishes the Shots stage', () => {
    open('cv-blindfold')
    expect(screen.getAllByText('0 of 3 captured')).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Captured: Blindfold on' }))
    expect(screen.getAllByText('1 of 3 captured')).not.toHaveLength(0)
    // The calendar's shoot on Wed 7 Oct is on offer; picking it moves the idea on to Shoot.
    fireEvent.change(screen.getByRole('combobox', { name: 'Shoot day' }), {
      target: { value: '7' },
    })
    const rail = screen.getByRole('navigation', { name: 'Stages' })
    expect(within(rail).getByRole('link', { current: 'step' })).toHaveTextContent('Shoot')
    expect(screen.getByText('Shooting Wed 7 Oct.')).toBeInTheDocument()
  })

  it('hands a clip captured after the post exists to the post, so the calendar and the scheduler have it', async () => {
    // What the post carries, read from the posts store rather than from the page.
    function PostImages() {
      const { byId } = useBrand()
      const card = useIdeas('casa-vostra').ideas.find((i) => i.id === 'cv-blindfold')
      const post = card?.postId ? byId(card.postId) : undefined
      return <output data-testid="post-images">{post?.images.join(',')}</output>
    }
    render(
      <BrandProvider>
        <IdeaPage id="cv-blindfold" />
        <PostImages />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(screen.getByTestId('post-images')).toHaveTextContent('')
    // jsdom has no object URLs; the page only needs one back.
    const url = URL as { createObjectURL?: (f: Blob) => string }
    url.createObjectURL = () => 'blob:clip-1'
    fireEvent.change(screen.getByLabelText('Add the clip for: One bite, one guess'), {
      target: { files: [new File(['x'], 'bite.png', { type: 'image/png' })] },
    })
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent('blob:clip-1#photo'),
    )
    expect(screen.getByText('1 from the shoot, in shot order.')).toBeInTheDocument()
    delete url.createObjectURL
  })

  it('closes the reference picker on Escape and hands the focus back to the frame', async () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 1' }))
    const none = screen.getByRole('button', { name: 'None' })
    expect(none).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Like @dough.diaries' })).toHaveFocus()
    fireEvent.keyDown(none, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pick a reference for shot 1' })).toHaveFocus(),
    )
  })

  it('goes back to Current ideas when a suggestion is skipped, since the idea is gone', () => {
    // Skip deletes the card; staying would show "not here", which blames a reload.
    act(() => suggest('casa-vostra'))
    open('cv-s-dough-shift')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(push).toHaveBeenCalledWith('/ideate?view=ideas')
  })

  it('says so, quietly, for an idea it does not have', () => {
    open('nothing-here')
    expect(screen.getByText(/This idea is not here/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Current ideas' })).toBeInTheDocument()
  })
})
