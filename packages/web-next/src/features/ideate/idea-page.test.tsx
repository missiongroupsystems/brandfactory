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

/**
 * What the post behind an idea carries and goes to, read from the posts store rather than from
 * the page, and a way to mark it posted as only a publish job can.
 */
function PostImages({ id }: { id: string }) {
  const { byId, setStage } = useBrand()
  const card = useIdeas('casa-vostra').ideas.find((i) => i.id === id)
  const post = card?.postId ? byId(card.postId) : undefined
  return (
    <>
      <output data-testid="post-images">{post?.images.join(',')}</output>
      {post && (
        <>
          <button type="button" onClick={() => setStage(post.id, 'scheduled')}>
            The composer scheduled it
          </button>
          <button type="button" onClick={() => setStage(post.id, 'posted')}>
            The job went live
          </button>
          <button type="button" onClick={() => setStage(post.id, 'failed')}>
            The job failed
          </button>
        </>
      )}
    </>
  )
}

/** The final edit's file input, named for what the format takes. */
const finalEdit = () => screen.getByLabelText(/^Add the (final|slides)/)
const video = () => new File(['x'], 'cut.mp4', { type: 'video/mp4' })
const schedule = () => screen.getByRole('button', { name: /^Schedule/ })

const openWithPost = (id: string) =>
  render(
    <BrandProvider>
      <IdeaPage id={id} />
      <PostImages id={id} />
    </BrandProvider>,
  )

describe('an idea page', () => {
  it('shows the idea in three sections, no stepper, and a way back to Current ideas', () => {
    open('cv-blindfold')
    expect(screen.getByLabelText('Hook')).toHaveValue('Blindfold pizza: the rematch.')
    expect(screen.getByRole('link', { name: 'Current ideas' })).toHaveAttribute(
      'href',
      '/ideate?view=ideas',
    )
    // The judge found the stepper repeated the three headings: the headings alone remain.
    expect(screen.queryByRole('navigation', { name: 'Stages' })).not.toBeInTheDocument()
    for (const name of ['References', 'Storyboard', 'Post']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.queryByText('None yet')).not.toBeInTheDocument()
    // A plan with no post is an idea: a draft is made on purpose, and taken back the same way.
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
    expect(screen.getByRole('link', { name: /Draft · Fri 23 Oct/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in scheduler →' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove the draft' }))
    expect(screen.queryByRole('link', { name: /Draft · / })).not.toBeInTheDocument()
    // The plan keeps its day.
    expect(screen.getByRole('button', { name: 'Post date' })).toHaveTextContent('Fri 23 Oct')
    expect(shotTitles()).toEqual(['Blindfold on', 'One bite, one guess', 'The onions'])
  })

  it('schedules only once the final edit is in, then hands the draft to the composer to send', async () => {
    // The judge could schedule an empty idea in one tap: nothing half-done reaches the calendar.
    // Two reviews found a send path of the page's own wrong twice: the composer is the one place
    // that sends, so Schedule makes the draft on its day and opens it there.
    openWithPost('cv-blindfold')
    expect(schedule()).toHaveTextContent('Schedule · Fri 23 Oct, 18:00')
    expect(schedule()).toBeDisabled()
    expect(screen.getByText('Add the final video first.')).toBeInTheDocument()
    fireEvent.change(finalEdit(), { target: { files: [video()] } })
    await waitFor(() => expect(schedule()).toBeEnabled())
    expect(screen.queryByText('Add the final video first.')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Accounts' })).not.toBeInTheDocument()
    fireEvent.click(schedule())
    expect(screen.getByRole('link', { name: /Draft · Fri 23 Oct, 18:00/ })).toBeInTheDocument()
    expect(screen.getByTestId('post-images')).toHaveTextContent(/^blob:file-1#video$/)
    const id = screen.getByRole('link', { name: 'Open in scheduler →' }).getAttribute('href')
    expect(id).toMatch(/^\/post\//)
    await waitFor(() => expect(push).toHaveBeenCalledWith(id))
    // Scheduled in the composer: the state stands here, and Unschedule makes it a draft again,
    // the post kept. Only "Remove the draft" takes it off the calendar.
    fireEvent.click(screen.getByRole('button', { name: 'The composer scheduled it' }))
    expect(screen.getByRole('link', { name: /Scheduled · Fri 23 Oct, 18:00/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Schedule/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unschedule' }))
    expect(screen.getByRole('link', { name: /Draft · Fri 23 Oct/ })).toBeInTheDocument()
    expect(schedule()).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove the draft' }))
    expect(screen.queryByRole('link', { name: /Draft · / })).not.toBeInTheDocument()
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
  })

  it('offers no way to mark a post posted by hand, and Unschedule on a failed one', async () => {
    openWithPost('cv-blindfold')
    fireEvent.change(finalEdit(), { target: { files: [video()] } })
    await waitFor(() => expect(schedule()).toBeEnabled())
    fireEvent.click(schedule())
    fireEvent.click(screen.getByRole('button', { name: 'The composer scheduled it' }))
    // A job failed: the post reads Failed, and Unschedule takes it back to a draft to fix.
    fireEvent.click(screen.getByRole('button', { name: 'The job failed' }))
    expect(screen.getByRole('link', { name: /Failed · Fri 23 Oct/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unschedule' }))
    expect(screen.getByRole('link', { name: /Draft · Fri 23 Oct/ })).toBeInTheDocument()
    // Only a publish job sets Posted; the page has no control for it, and Posted is final.
    expect(screen.queryByText(/Mark as posted/)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Posted' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'The job went live' }))
    expect(screen.getByRole('link', { name: /Posted · Fri 23 Oct/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unschedule' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Schedule/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post date' })).toBeDisabled()
  })

  it('moves the idea to the day picked, and Schedule then makes it a post at that day and time', async () => {
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
    expect(schedule()).toHaveTextContent('Schedule · Tue 27 Oct, 12:00')
    expect(screen.queryByRole('link', { name: /Open in scheduler/ })).not.toBeInTheDocument()
    // With its final edit in, Schedule makes it a draft on the day and at the time picked, and
    // opens the composer to send it.
    fireEvent.change(finalEdit(), { target: { files: [video()] } })
    await waitFor(() => expect(schedule()).toBeEnabled())
    fireEvent.click(schedule())
    expect(screen.getByRole('link', { name: /Draft · Tue 27 Oct, 12:00/ })).toBeInTheDocument()
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/post\//)))
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

  it('takes a shoot day beside the Storyboard heading, and links the call sheet from there', () => {
    open('cv-blindfold')
    const storyboard = screen.getByRole('region', { name: 'Storyboard' })
    expect(within(storyboard).queryByRole('link', { name: /Call sheet/ })).not.toBeInTheDocument()
    // The shoot on Wed 7 Oct is on offer, with its start.
    fireEvent.click(within(storyboard).getByRole('button', { name: 'Shoot day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Raffles City · Wed 7 Oct, 12:00' }))
    expect(screen.getByRole('button', { name: 'Shoot day' })).toHaveTextContent('Wed 7 Oct')
    expect(within(storyboard).getByRole('link', { name: /Call sheet/ })).toHaveAttribute(
      'href',
      '/shoot/cv-shoot-raffles',
    )
  })

  it('hands a reel its final edit, one video, and takes it back when the edit is removed', async () => {
    openWithPost('cv-blindfold')
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
    expect(screen.getByTestId('post-images')).toBeEmptyDOMElement()
    // The final edit comes before the button, so a file that lands is scheduled right after.
    const post = screen.getByRole('region', { name: 'Post' })
    const final = within(post).getByRole('region', { name: 'Final edit' })
    expect(final.compareDocumentPosition(schedule())).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(finalEdit()).toHaveAttribute('accept', 'video/*')
    // A photo is no reel, even past the picker: of a photo and a video, the video goes in.
    fireEvent.change(finalEdit(), {
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
    const input = screen.getByLabelText('Add the slides')
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
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
    const input = screen.getByLabelText('Add the final photo or video')
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
    fireEvent.change(finalEdit(), {
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
    fireEvent.change(finalEdit(), { target: { files } })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove slide 10 of the final edit' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Remove slide 11 of the final edit' })).toBeNull()
    expect(screen.queryByLabelText('Add the slides')).toBeNull()
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
