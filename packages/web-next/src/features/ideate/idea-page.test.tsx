import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import { resetShoots } from '@/features/shoot/shoots-store'

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
  resetShoots()
  push.mockClear()
  blobs = 0
  url.createObjectURL = () => `blob:file-${++blobs}`
})

// jsdom loads no media, so a video never says how long it is: here it fails at once and reads 0:00.
beforeAll(() => {
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
  it('shows the idea in three stages, with a rail, and a way back to Current ideas', () => {
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
    ).toEqual(['#references', '#shots', '#post'])
    // References are there, so the idea stands at Storyboard, which has no shoot day yet.
    expect(within(rail).getByRole('link', { current: 'step' })).toHaveTextContent('Storyboard')
    for (const name of ['References', 'Storyboard', 'Post']) {
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

  it('asks before it marks a post posted, and nothing changes a posted post after', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    // Posted cannot be undone, so a stray click only asks; Cancel leaves the post as it was.
    fireEvent.click(screen.getByRole('radio', { name: 'Posted' }))
    expect(screen.getByRole('alertdialog', { name: 'Mark as posted?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Scheduled' })).toBeChecked()
    // Confirmed, it is posted, and the other steps rest.
    fireEvent.click(screen.getByRole('radio', { name: 'Posted' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark as posted' }))
    expect(screen.getByRole('radio', { name: 'Posted' })).toBeChecked()
    for (const step of ['Idea', 'Draft', 'Scheduled']) {
      expect(screen.getByRole('radio', { name: step })).toBeDisabled()
    }
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
    const shots = screen.getByRole('region', { name: 'Storyboard' })
    expect(within(shots).getByText('like @dough.diaries')).toBeInTheDocument()
    // The second reference (a pin) dragged onto the third shot.
    dragTo(items('ref:')[1]!, items('shot:')[2]!)
    expect(within(shots).getByText('like Pizza close-ups')).toBeInTheDocument()
  })

  it('says on every empty shot how a reference gets there, and takes no file on a shot', () => {
    // The owner could not tell that a shot takes a reference: it is a named control on the card
    // at rest, and dragging stays a shortcut. The videographer's files go to the final edit, so a
    // shot has no upload of its own.
    open('cv-blindfold')
    const shots = screen.getByRole('region', { name: 'Storyboard' })
    expect(within(shots).getByRole('button', { name: 'Pick a reference for shot 1' })).toBeVisible()
    expect(within(shots).queryByLabelText(/^Upload/)).not.toBeInTheDocument()
  })

  it("sharpens the hook in a field that stays editable, and goes back to the team's words", () => {
    open('cv-blindfold')
    const field = screen.getByLabelText('Edit the hook')
    expect(field).toHaveValue('Blindfold pizza: the rematch.')
    expect(screen.queryByRole('button', { name: 'Back to mine' })).not.toBeInTheDocument()
    // A sharper hook fills the field and the title above: they are one hook.
    fireEvent.click(screen.getByRole('radio', { name: 'Blindfolded. One bite. Name the topping.' }))
    expect(field).toHaveValue('Blindfolded. One bite. Name the topping.')
    expect(screen.getByLabelText('Hook')).toHaveValue('Blindfolded. One bite. Name the topping.')
    // Typing from there keeps the typed words, and the way back stays.
    fireEvent.change(field, { target: { value: 'Blindfolded. One bite. Name it.' } })
    expect(screen.getByLabelText('Hook')).toHaveValue('Blindfolded. One bite. Name it.')
    expect(
      screen.getByRole('radio', { name: 'Blindfolded. One bite. Name the topping.' }),
    ).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Back to mine' }))
    expect(field).toHaveValue('Blindfold pizza: the rematch.')
    expect(screen.queryByRole('button', { name: 'Back to mine' })).not.toBeInTheDocument()
  })

  it('adds a moodboard post picked on a shot to the references, and shoots the shot like it', () => {
    open('cv-blindfold')
    const before = items('ref:').length
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 3' }))
    const option = screen.getAllByRole('button', { name: /^From the moodboard: / })[0]!
    const account = option.getAttribute('aria-label')!.replace('From the moodboard: ', '')
    fireEvent.click(option)
    expect(items('ref:')).toHaveLength(before + 1)
    const shots = screen.getByRole('region', { name: 'Storyboard' })
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

  it('finishes the Storyboard stage with a shoot day, and links the call sheet from there', () => {
    open('cv-blindfold')
    const storyboard = screen.getByRole('region', { name: 'Storyboard' })
    expect(within(storyboard).queryByRole('link', { name: /Call sheet/ })).not.toBeInTheDocument()
    // The shoot on Wed 7 Oct is on offer, with its start; picking it moves the idea on to Post.
    fireEvent.click(screen.getByRole('button', { name: 'Shoot day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Raffles City · Wed 7 Oct, 12:00' }))
    const rail = screen.getByRole('navigation', { name: 'Stages' })
    expect(within(rail).getByRole('link', { current: 'step' })).toHaveTextContent('Post')
    expect(screen.getByRole('button', { name: 'Shoot day' })).toHaveTextContent('Wed 7 Oct')
    expect(within(storyboard).getByRole('link', { name: /Call sheet/ })).toHaveAttribute(
      'href',
      '/shoot/cv-shoot-raffles',
    )
  })

  it('hands a reel its final edit, one video, and takes it back when the edit is removed', async () => {
    openWithPost('cv-blindfold')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
    // The final edit comes before the status, so a file that lands is scheduled right after.
    const post = screen.getByRole('region', { name: 'Post' })
    const final = within(post).getByRole('region', { name: 'Final edit' })
    expect(
      final.compareDocumentPosition(within(post).getByRole('radiogroup', { name: 'Status' })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByLabelText('Add the final edit')).toHaveAttribute('accept', 'video/*')
    // A photo is no reel, even past the picker: of a photo and a video, the video goes in.
    fireEvent.change(screen.getByLabelText('Add the final edit'), {
      target: {
        files: [
          new File(['x'], 'still.png', { type: 'image/png' }),
          new File(['x'], 'cut.mp4', { type: 'video/mp4' }),
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent(/^blob:file-\d#video$/),
    )
    // The edit taken off again: the post stops carrying it.
    fireEvent.click(screen.getByRole('button', { name: 'Remove the final edit' }))
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
  })

  it('hands a carousel its final edit, several slides in order', async () => {
    // Five pastas already is a post with three photos; the final edit takes their place.
    openWithPost('cv-five-pastas')
    expect(screen.getByTestId('post-images')).toHaveTextContent(/tagliatelle.*ravioli.*pasta/)
    const input = screen.getByLabelText('Add the final edit')
    expect(input).toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', 'image/*,video/*')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['x'], 'a.png', { type: 'image/png' }),
          new File(['x'], 'b.png', { type: 'image/png' }),
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent(
        'blob:file-1#photo,blob:file-2#photo',
      ),
    )
    // One slide removed: the other stays; the last removed gives the post its three photos back.
    fireEvent.click(screen.getByRole('button', { name: 'Remove slide 1 of the final edit' }))
    expect(screen.getByTestId('post-images')).toHaveTextContent('blob:file-2#photo')
    expect(screen.getByTestId('post-images')).not.toHaveTextContent('blob:file-1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove slide 1 of the final edit' }))
    expect(screen.getByTestId('post-images')).toHaveTextContent(/tagliatelle.*ravioli.*pasta/)
    expect(screen.getByTestId('post-images')).not.toHaveTextContent('blob:')
  })

  it('hands a story one file, a photo or a video, and a second file takes its place', async () => {
    openWithPost('cv-st-poll')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    const input = screen.getByLabelText('Add the final edit')
    expect(input).toHaveAttribute('accept', 'image/*,video/*')
    expect(input).not.toHaveAttribute('multiple')
    // Two files at once past the picker: the story takes the first.
    fireEvent.change(input, {
      target: {
        files: [
          new File(['x'], 'one.png', { type: 'image/png' }),
          new File(['x'], 'extra.mp4', { type: 'video/mp4' }),
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent(/^blob:file-1#photo$/),
    )
    fireEvent.change(screen.getByLabelText('Add the final edit'), {
      target: { files: [new File(['x'], 'two.mp4', { type: 'video/mp4' })] },
    })
    await waitFor(() =>
      expect(screen.getByTestId('post-images')).toHaveTextContent(/^blob:file-3#video$/),
    )
  })

  it('stops a carousel at ten slides, as Instagram does', async () => {
    openWithPost('cv-five-pastas')
    const files = Array.from(
      { length: 11 },
      (_, i) => new File(['x'], `${i}.png`, { type: 'image/png' }),
    )
    fireEvent.change(screen.getByLabelText('Add the final edit'), { target: { files } })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove slide 10 of the final edit' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Remove slide 11 of the final edit' })).toBeNull()
    expect(screen.queryByLabelText('Add the final edit')).toBeNull()
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
  it('closes the reference picker without a change, by its button or a tap outside', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 1' }))
    expect(screen.getByRole('group', { name: 'A reference for shot 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close the picker' }))
    expect(screen.queryByRole('group', { name: 'A reference for shot 1' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a reference for shot 1' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: 'A reference for shot 1' })).not.toBeInTheDocument()
    // Neither way linked a reference: the shot still has none.
    expect(screen.getByRole('button', { name: 'Pick a reference for shot 1' })).toBeInTheDocument()
  })
})
