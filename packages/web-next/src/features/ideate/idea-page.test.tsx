import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from '@/features/schedule/posts-store'

import { IdeaPage } from './idea-page'
import { resetIdeas, suggest, useIdeas } from './ideas-store'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate/cv-blindfold',
  useRouter: () => ({ push }),
}))

// jsdom has no media queries (the page asks whether it is on a phone) and no object URLs (a
// dropped file becomes one); the page only needs an answer from each.
if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}
let blobs = 0
const url = URL as { createObjectURL?: (f: Blob) => string }

beforeEach(() => {
  resetIdeas()
  push.mockClear()
  blobs = 0
  url.createObjectURL = () => `blob:file-${++blobs}`
})

const open = (id: string) =>
  render(
    <BrandProvider>
      <IdeaPage id={id} />
    </BrandProvider>,
  )

const shotTitles = () =>
  ['Shot 1', 'Shot 2', 'Shot 3'].map((n) => (screen.getByLabelText(n) as HTMLTextAreaElement).value)

const items = (prefix: string) =>
  screen.getAllByRole('listitem').filter((li) => li.dataset.drop?.startsWith(prefix))

/**
 * A drag as a mouse makes it: start on one, over another, drop there. jsdom lays nothing out, so
 * every box is at 0,0: a pointer at -1 is on the near side of the item it is over, and the lifted
 * one goes before it.
 */
function dragTo(from: HTMLElement, to: HTMLElement, side: 'before' | 'after' = 'before') {
  const dataTransfer = { setData: vi.fn(), types: [] as string[], effectAllowed: 'move' }
  fireEvent.dragStart(from, { dataTransfer })
  // jsdom's drag event keeps no pointer position of its own.
  const over = createEvent.dragOver(to, { dataTransfer })
  const p = side === 'before' ? -1 : 1
  Object.defineProperty(over, 'clientX', { value: p })
  Object.defineProperty(over, 'clientY', { value: p })
  fireEvent(to, over)
  fireEvent.drop(to, { dataTransfer })
  fireEvent.dragEnd(from, { dataTransfer })
}

const upload = (label: string | RegExp, name = 'clip.png') =>
  fireEvent.change(screen.getByLabelText(label), {
    target: { files: [new File(['x'], name, { type: 'image/png' })] },
  })

/** What the post behind an idea carries, read from the posts store rather than from the page. */
function PostImages({ id }: { id: string }) {
  const { byId } = useBrand()
  const card = useIdeas('casa-vostra').ideas.find((i) => i.id === id)
  const post = card?.postId ? byId(card.postId) : undefined
  return <output data-testid="post-images">{post?.images.join(',')}</output>
}

const openWithPost = (id: string) =>
  render(
    <BrandProvider>
      <IdeaPage id={id} />
      <PostImages id={id} />
    </BrandProvider>,
  )

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
    // A plan with no post is an idea, not a draft: "Draft" is a post's word.
    expect(screen.getByRole('radio', { name: 'Idea' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Draft' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Draft' }))
    expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked()
    expect(screen.getByRole('link', { name: /On the calendar/ })).toBeInTheDocument()
    // Idea takes the post back to a plan: no post on the calendar, the idea checked again.
    fireEvent.click(screen.getByRole('radio', { name: 'Idea' }))
    expect(screen.getByRole('radio', { name: 'Idea' })).toBeChecked()
    expect(screen.queryByRole('link', { name: /On the calendar/ })).not.toBeInTheDocument()
    // The plan keeps its day.
    expect(screen.getByRole('button', { name: 'Post date' })).toHaveTextContent('Fri 23 Oct')
    expect(shotTitles()).toEqual(['Blindfold on', 'One bite, one guess', 'The onions'])
  })

  it('makes the idea a post on the calendar when a status is picked', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(screen.getByRole('link', { name: /On the calendar · Fri 23 Oct/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in scheduler →' })).toBeInTheDocument()
  })

  it('moves the idea to the day picked, and a status then makes it a post at that day and time', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Post date' }))
    const picker = screen.getByRole('dialog', { name: 'Post date' })
    // A day with a post on it says so; the past cannot be picked.
    expect(within(picker).getByRole('button', { name: 'Thu 8 Oct, 2 posts' })).toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: 'Mon 5 Oct' })).toBeDisabled()
    // The arrows skip what cannot be picked: left from Wed 7 Oct, the first open day, stays put.
    const wed = within(picker).getByRole('button', { name: 'Wed 7 Oct' })
    act(() => wed.focus())
    fireEvent.keyDown(wed, { key: 'ArrowLeft' })
    expect(wed).toHaveFocus()
    fireEvent.keyDown(wed, { key: 'ArrowRight' })
    expect(within(picker).getByRole('button', { name: 'Thu 8 Oct, 2 posts' })).toHaveFocus()
    fireEvent.click(within(picker).getByRole('button', { name: 'Tue 27 Oct' }))
    fireEvent.click(within(picker).getByRole('radio', { name: /12:00/ }))
    // Picking the time closes the picker and hands the focus back to the field.
    expect(screen.queryByRole('dialog', { name: 'Post date' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post date' })).toHaveFocus()
    // A date alone moves the plan; it is still an idea, and no post exists yet.
    expect(screen.getByRole('button', { name: 'Post date' })).toHaveTextContent('Tue 27 Oct, 12:00')
    expect(screen.getByRole('radio', { name: 'Idea' })).toBeChecked()
    expect(screen.queryByRole('link', { name: /On the calendar/ })).not.toBeInTheDocument()
    // A status makes it a post, on the day and at the time picked.
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(
      screen.getByRole('link', { name: /On the calendar · Tue 27 Oct, 12:00/ }),
    ).toBeInTheDocument()
  })

  it('reorders the shots by a drag, and by Option with an arrow key on a shot', () => {
    open('cv-blindfold')
    // The last shot dragged onto the first lands first.
    const cards = items('shot:')
    dragTo(cards[2]!, cards[0]!)
    expect(shotTitles()).toEqual(['The onions', 'Blindfold on', 'One bite, one guess'])
    const grip = screen.getByRole('button', { name: 'Move shot 1: The onions' })
    grip.focus()
    fireEvent.keyDown(grip, { key: 'ArrowRight', altKey: true })
    expect(shotTitles()).toEqual(['Blindfold on', 'The onions', 'One bite, one guess'])
    expect(screen.getByText('The onions is now 2 of 3')).toBeInTheDocument()
    // An arrow without Option is not a move.
    fireEvent.keyDown(grip, { key: 'ArrowRight' })
    expect(shotTitles()).toEqual(['Blindfold on', 'The onions', 'One bite, one guess'])
    // Past the far side of the last card, the first goes after it.
    const now = items('shot:')
    dragTo(now[0]!, now[2]!, 'after')
    expect(shotTitles()).toEqual(['The onions', 'One bite, one guess', 'Blindfold on'])
  })

  it('shoots a shot like a reference, picked on the card or dragged onto it', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Like @dough.diaries' }))
    const shots = screen.getByRole('region', { name: 'Shots' })
    expect(within(shots).getByText('like @dough.diaries')).toBeInTheDocument()
    // The second reference (a pin) dragged onto the third shot.
    dragTo(items('ref:')[1]!, items('shot:')[2]!)
    expect(within(shots).getByText('like Pizza close-ups')).toBeInTheDocument()
    // On the day, the list says which reference each shot follows.
    const shoot = screen.getByRole('region', { name: 'Shoot' })
    expect(within(shoot).getByText('like @dough.diaries')).toBeInTheDocument()
  })

  it('says on every empty shot and every Shoot row how media gets there, without a hover', async () => {
    // The owner could not tell that a shot takes a reference or a file: both are named controls
    // on the card at rest, and dragging stays a shortcut, never the only way in.
    open('cv-blindfold')
    const shots = screen.getByRole('region', { name: 'Shots' })
    const shoot = screen.getByRole('region', { name: 'Shoot' })
    expect(within(shots).getByRole('button', { name: 'Pick a reference for shot 1' })).toBeVisible()
    expect(within(shots).getByLabelText('Upload a photo or clip for shot 1')).toHaveAttribute(
      'type',
      'file',
    )
    expect(within(shoot).getByLabelText('Add the clip for: Blindfold on')).toHaveAttribute(
      'type',
      'file',
    )
    // An upload on the card fills its frame and is the clip the Shoot row shows.
    upload('Upload a photo or clip for shot 1')
    await waitFor(() =>
      expect(
        within(shoot).getByRole('button', { name: 'Remove the clip for: Blindfold on' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByLabelText('Upload a photo or clip for shot 1')).not.toBeInTheDocument()
    expect(screen.getAllByText('1 of 3 captured')).not.toHaveLength(0)
  })

  it('adds a moodboard post picked on a shot to the references, and shoots the shot like it', () => {
    open('cv-blindfold')
    const before = items('ref:').length
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 3' }))
    const option = screen.getAllByRole('button', { name: /^From the moodboard: / })[0]!
    const account = option.getAttribute('aria-label')!.replace('From the moodboard: ', '')
    fireEvent.click(option)
    expect(items('ref:')).toHaveLength(before + 1)
    const shots = screen.getByRole('region', { name: 'Shots' })
    expect(within(shots).getByText(`like ${account.split(',')[0]}`)).toBeInTheDocument()
  })

  it('reorders the references by a drag, and the first becomes the main look', () => {
    open('cv-blindfold')
    const refs = items('ref:')
    expect(refs[0]).toHaveTextContent('Main look')
    expect(refs[0]).toHaveTextContent('@dough.diaries')
    dragTo(refs[2]!, refs[0]!)
    const after = items('ref:')
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
    fireEvent.click(screen.getByRole('button', { name: 'Shoot day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Raffles City · Wed 7 Oct' }))
    const rail = screen.getByRole('navigation', { name: 'Stages' })
    expect(within(rail).getByRole('link', { current: 'step' })).toHaveTextContent('Shoot')
    expect(screen.getByText('Shooting Wed 7 Oct.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shoot day' })).toHaveTextContent('Wed 7 Oct')
  })

  it('hands a reel only its final cut: the clips are footage, and nothing new goes before a cut', async () => {
    openWithPost('cv-blindfold')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
    upload('Add the clip for: Blindfold on')
    upload('Add the clip for: One bite, one guess')
    await waitFor(() => expect(screen.getAllByText('2 of 3 captured')).not.toHaveLength(0))
    expect(screen.getByRole('list', { name: "The shoot's clips" }).children).toHaveLength(2)
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
    upload('Add the final cut', 'cut.png')
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent('blob:file-3#photo'),
    )
    expect(screen.getByText('The final cut.')).toBeInTheDocument()
    // The cut taken off again: the post stops carrying it.
    fireEvent.click(screen.getByRole('button', { name: 'Remove the final cut' }))
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
    expect(screen.getByText('Nothing yet, until the final cut lands.')).toBeInTheDocument()
  })

  it('hands a carousel its captured slides, in shot order', async () => {
    // Five pastas already is a post with three photos; the first captured slide takes their place.
    openWithPost('cv-five-pastas')
    expect(screen.getByTestId('post-images')).toHaveTextContent(/tagliatelle.*ravioli.*pasta/)
    upload('Add the clip for: Five cuts in a row')
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent('blob:file-1#photo'),
    )
    expect(screen.getByText('1 from the shoot, in shot order.')).toBeInTheDocument()
    // The slide cleared again: the post gets its three photos back.
    fireEvent.click(screen.getByRole('button', { name: 'Remove the clip for: Five cuts in a row' }))
    expect(screen.getByTestId('post-images')).toHaveTextContent(/tagliatelle.*ravioli.*pasta/)
    expect(screen.getByTestId('post-images')).not.toHaveTextContent('blob:')
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
