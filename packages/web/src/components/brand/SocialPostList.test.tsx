import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandAsset, SocialPost } from '@brandfactory/shared'
import type { KeyDate, KeyDateSet } from '@/lib/key-dates'
import { SocialPostList } from './SocialPostList'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

// Fixed local noon, so the Upcoming/Past split is a fact of the fixture and not
// of the machine's clock — the `formatRelativeTime` precedent.
const NOW = new Date(2026, 7, 3, 12, 0)

function asset(id: string, label: string): BrandAsset {
  return {
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'image',
    library: 'photography',
    source: 'blob',
    role: null,
    status: 'active',
    label,
    blobKey: `k-${id}`,
    position: 100,
    isPinned: false,
    pinnedAt: null,
    deletedAt: null,
    ...STAMPS,
  }
}

const assets = [asset('a-1', 'The kitchen'), asset('a-2', 'Terrace at dusk')]
const resolve = (key: string) => `/blob/${key}`

/** Scheduled at a **local** wall-clock time, stated the way the wire states it. */
function post(id: string, local: Date | null, overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: id as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: local === null ? null : local.toISOString(),
    body: `Copy for ${id}`,
    status: 'draft',
    createdBy: 'user',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
    ...overrides,
  }
}

const tray = post('p-tray', null, { body: 'An idea with no date' })
const today = post('p-today', new Date(2026, 7, 3, 18, 30), { body: 'Tonight’s service' })
const soon = post('p-soon', new Date(2026, 7, 10, 9, 0), { body: 'Next Monday' })
const gone = post('p-gone', new Date(2026, 6, 28, 9, 0), { body: 'Last Tuesday' })
const older = post('p-older', new Date(2026, 6, 20, 9, 0), { body: 'The week before' })

/** In `bySchedule` order, as the query and the cache applier keep it. */
const ALL = [tray, older, gone, today, soon]

function renderList(props: Partial<React.ComponentProps<typeof SocialPostList>> = {}) {
  return render(
    <SocialPostList posts={ALL} assets={assets} resolveBlob={resolve} now={NOW} {...props} />,
  )
}

describe('SocialPostList', () => {
  it('says so plainly when nothing is planned', () => {
    renderList({ posts: [] })
    expect(screen.getByText(/Nothing planned yet/)).toBeTruthy()
  })

  it('leads with today, then the tray the grid cannot show at all', () => {
    renderList()
    const regions = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    // On the daily clock the first question is what goes out today; the tray
    // comes next because those posts are invisible everywhere else.
    expect(regions).toEqual(['Today', 'Unscheduled', 'Upcoming', 'Past'])
    // One in each of the first two regions.
    expect(screen.getAllByText('1 post')).toHaveLength(2)
    expect(screen.getByText('An idea with no date')).toBeTruthy()
  })

  it('omits the Today region entirely when nothing is scheduled today', () => {
    // A quiet day reads exactly as this list read before the region existed.
    renderList({ posts: [tray, soon, gone] })
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
  })

  it('omits the tray region entirely when every post has a slot', () => {
    renderList({ posts: [today, soon] })
    expect(screen.queryByRole('heading', { name: 'Unscheduled' })).toBeNull()
  })

  it('splits on today and runs both halves away from now', () => {
    renderList()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    // Today has its own region and no day group — the heading would say Today
    // twice. What is left runs forward, then yesterday-ward most recent first,
    // so the rows nearest the present sit nearest the middle.
    expect(headings).toEqual(['Mon 10 Aug', 'Tue 28 Jul', 'Mon 20 Jul'])
  })

  it('counts a post later today as today, not as past', () => {
    // 18:30 today is still ahead of 12:00 today, and grouping by day is what
    // keeps a morning post from falling out of Today the moment noon passes.
    renderList({ posts: [today] })
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Past' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull()
  })

  it('shows a scheduled post’s local time, and none in the tray', () => {
    renderList()
    const scheduledRow = screen.getByText('Tonight’s service').closest('li')!
    expect(within(scheduledRow).getByText('18:30')).toBeTruthy()
    const trayRow = screen.getByText('An idea with no date').closest('li')!
    expect(within(trayRow).queryByText(/^\d\d:\d\d$/)).toBeNull()
  })

  it('names the platform and the status on every row', () => {
    renderList({ posts: [post('p-1', null, { platform: 'tiktok', status: 'ready' })] })
    expect(screen.getByText('TikTok')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
  })

  it('falls back to the platform name for a post with no copy yet', () => {
    // `body: ''` is a claimed slot, an expected state — a blank row would read
    // as a rendering fault rather than as an empty post.
    renderList({ posts: [post('p-1', null, { body: '', platform: 'facebook' })] })
    const row = screen.getAllByRole('listitem')[0]!
    expect(within(row).getAllByText('Facebook').length).toBe(2)
  })

  it('shows attachment thumbnails, and counts the ones past the third', () => {
    const many = ['a-1', 'a-2', 'a-3', 'a-4'].map((id) => asset(id, `Image ${id}`))
    renderList({
      posts: [post('p-1', null, { assetIds: many.map((a) => a.id) })],
      assets: many,
    })
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('skips an attachment whose asset is gone rather than breaking the row', () => {
    // Read-only surface: the join row survives, so restoring the asset brings
    // the thumbnail back on every post that referenced it.
    renderList({ posts: [post('p-1', null, { assetIds: ['a-vanished' as BrandAsset['id']] })] })
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByText('Copy for p-1')).toBeTruthy()
  })
})

describe('SocialPostList — the row menu', () => {
  it('renders no menu at all when the caller passes no callbacks', () => {
    renderList({ posts: [today] })
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
  })

  it('offers Edit, Mark posted and Delete, and reports each', async () => {
    const user = userEvent.setup()
    const onEditPost = vi.fn()
    const onMarkPosted = vi.fn()
    const onDeletePost = vi.fn()
    renderList({ posts: [today], onEditPost, onMarkPosted, onDeletePost })

    await user.click(screen.getByRole('button', { name: 'Actions for Tonight’s service' }))
    await user.click(screen.getByRole('menuitem', { name: 'Mark posted' }))
    await waitFor(() => expect(onMarkPosted).toHaveBeenCalledWith(today))

    await user.click(screen.getByRole('button', { name: 'Actions for Tonight’s service' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(onDeletePost).toHaveBeenCalledWith(today))

    // Edit is deferred by a macrotask because it opens a dialog — the two live
    // focus scopes `EntityMenu` documents.
    await user.click(screen.getByRole('button', { name: 'Actions for Tonight’s service' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await waitFor(() => expect(onEditPost).toHaveBeenCalledWith(today))
  })

  it('drops Mark posted once the post is marked, rather than disabling it', async () => {
    const user = userEvent.setup()
    const posted = post('p-1', null, { body: 'Done', status: 'posted' })
    renderList({ posts: [posted], onEditPost: vi.fn(), onMarkPosted: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Actions for Done' }))
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Mark posted' })).toBeNull()
  })

  it('makes the excerpt itself the edit affordance', async () => {
    const user = userEvent.setup()
    const onEditPost = vi.fn()
    renderList({ posts: [today], onEditPost })

    await user.click(screen.getByRole('button', { name: 'Tonight’s service' }))
    expect(onEditPost).toHaveBeenCalledWith(today)
  })

  it('renders the excerpt as plain text when there is nothing to edit with', () => {
    renderList({ posts: [today] })
    expect(screen.queryByRole('button', { name: 'Tonight’s service' })).toBeNull()
    expect(screen.getByText('Tonight’s service')).toBeTruthy()
  })
})

describe('SocialPostList — dispatch', () => {
  // `today` and `soon` with a real attachment, so `Download` has something
  // behind it. Everything above this line runs with both callbacks omitted and
  // is the proof that the default renders what the list rendered before.
  const withImage = { assetIds: [assets[0]!.id] }
  const todayWithImage = post('p-today', new Date(2026, 7, 3, 18, 30), {
    body: 'Tonight’s service',
    ...withImage,
  })
  const soonWithImage = post('p-soon', new Date(2026, 7, 10, 9, 0), {
    body: 'Next Monday',
    ...withImage,
  })

  const dispatch = { onCopyBody: vi.fn(), onDownloadAssets: vi.fn() }

  it('shows the two actions as buttons inside Today', () => {
    // Dispatch fails by being hard to *find* at 8am, not by being hard to use
    // once found.
    renderList({ posts: [todayWithImage], ...dispatch })
    expect(screen.getByRole('button', { name: 'Copy Tonight’s service' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Download attachments for Tonight’s service' }),
    ).toBeTruthy()
  })

  it('keeps them in the row menu everywhere else', async () => {
    const user = userEvent.setup()
    renderList({ posts: [soonWithImage], ...dispatch })

    // Not buttons out here — the row is a week away.
    expect(screen.queryByRole('button', { name: /^Copy / })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Actions for Next Monday' }))
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Download' })).toBeTruthy()
  })

  it('never offers the same action twice on one row', async () => {
    const user = userEvent.setup()
    renderList({ posts: [todayWithImage], ...dispatch, onEditPost: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Actions for Tonight’s service' }))
    expect(screen.queryByRole('menuitem', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Download' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
  })

  it('reports the post the buttons belong to', async () => {
    const user = userEvent.setup()
    const onCopyBody = vi.fn().mockResolvedValue(undefined)
    const onDownloadAssets = vi.fn()
    renderList({ posts: [todayWithImage], onCopyBody, onDownloadAssets })

    await user.click(screen.getByRole('button', { name: 'Copy Tonight’s service' }))
    await waitFor(() => expect(onCopyBody).toHaveBeenCalledWith(todayWithImage))

    await user.click(
      screen.getByRole('button', { name: 'Download attachments for Tonight’s service' }),
    )
    expect(onDownloadAssets).toHaveBeenCalledWith(todayWithImage)
  })

  it('offers no Download on a post whose attachment cannot be resolved', () => {
    // Same rule the thumbnails follow: a soft-deleted asset resolves to
    // nothing, and a control with nothing behind it is not drawn.
    const orphan = post('p-today', new Date(2026, 7, 3, 18, 30), {
      body: 'Tonight’s service',
      assetIds: ['a-vanished' as BrandAsset['id']],
    })
    renderList({ posts: [orphan], ...dispatch })
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy Tonight’s service' })).toBeTruthy()
  })

  it('draws no menu for a row whose only offer is a Copy it cannot make', async () => {
    // No copy written, no resolvable file, no other callback — a ⋯ trigger over
    // an empty menu is the dead affordance this list keeps refusing to draw.
    renderList({ posts: [post('p-soon', new Date(2026, 7, 10, 9, 0), { body: '' })], ...dispatch })
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
  })

  it('renders no dispatch controls when the caller passes neither callback', () => {
    renderList({ posts: [todayWithImage] })
    expect(screen.queryByRole('button', { name: /^Copy / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Key dates — the same list, with the borrowed dates switched on
// ---------------------------------------------------------------------------
//
// Every assertion above this line runs with `keyDates` omitted and is the proof
// that the default renders exactly what the list rendered before.

function keyDay(name: string, start: string, set: KeyDateSet = 'sg-holidays'): KeyDate {
  return { id: `${set}/${name}`, set, name, start, source: 'test' }
}
function keySeason(
  name: string,
  start: string,
  end: string,
  set: KeyDateSet = 'sg-events',
): KeyDate {
  return { id: `${set}/${name}`, set, name, start, end, source: 'test' }
}

describe('SocialPostList — key dates', () => {
  it('suffixes a day heading that already has a post', () => {
    // 3 August is `today`'s day, and it has a post, so the heading exists to
    // be annotated.
    // Today's rows moved into a region of their own, so the annotation moved
    // with them — onto the region heading, which is the one day heading left
    // that names 3 August.
    renderList({ keyDates: [keyDay('National Day', '2026-08-03')] })
    const heading = screen
      .getAllByRole('heading', { level: 2 })
      .find((h) => h.textContent?.includes('Today'))
    expect(heading?.textContent).toBe('Today · National Day')
  })

  it('keeps the heading separator in the heading’s own flow, not inside the flex span', () => {
    // The Phase F live pass caught this rendering as "Sun 9 Aug· National Day".
    // `textContent` could not see it: the literal ' · ' was present either way,
    // so the assertion above passed while the screen was wrong. A string placed
    // inside an `inline-flex` becomes a flex item and its surrounding
    // whitespace is stripped — only its position in the tree distinguishes the
    // two, so that is what this asserts.
    renderList({ keyDates: [keyDay('National Day', '2026-08-03')] })
    const heading = screen
      .getAllByRole('heading', { level: 2 })
      .find((h) => h.textContent?.includes('Today'))!
    const ownText = Array.from(heading.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
    expect(ownText).toContain(' · ')
  })

  it('never creates a day group for a key date nobody has planned into', () => {
    // E4. The list is a plan of *your* posts; forty empty day groups would bury
    // it. The Upcoming block below is what stops that being a silence.
    renderList({ keyDates: [keyDay('Deepavali', '2026-08-05')] })
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings.some((h) => h?.includes('Deepavali'))).toBe(false)
    // and it is still visible, in the block — which is what makes E4 safe
    expect(screen.getByText('Deepavali')).toBeTruthy()
  })

  it('lists what is coming, in date order, with dates and sets named', () => {
    renderList({
      keyDates: [
        keyDay('Deepavali', '2026-08-20'),
        keySeason('Night Festival', '2026-08-05', '2026-08-09'),
      ],
    })
    const block = screen.getByText('Night Festival').closest('ul')!
    const rows = within(block).getAllByRole('listitem')
    expect(rows[0]!.textContent).toContain('Night Festival')
    expect(rows[0]!.textContent).toContain('5–9 Aug')
    // The set in words, never colour alone.
    expect(rows[0]!.textContent).toContain('Singapore events')
    expect(rows[1]!.textContent).toContain('Deepavali')
    expect(rows[1]!.textContent).toContain('Singapore holidays')
  })

  it('caps the block at six and drops what has already passed', () => {
    // From the 12th, so none of these lands on a day that already has a post —
    // a suffixed heading would match the block's own row by text.
    const many = Array.from({ length: 9 }, (_, i) =>
      keyDay(`Date ${i}`, `2026-08-${String(12 + i).padStart(2, '0')}`),
    )
    renderList({ keyDates: [keyDay('Long gone', '2026-07-01'), ...many] })
    const block = screen.getByText('Date 0').closest('ul')!
    expect(within(block).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByText('Long gone')).toBeNull()
  })

  it('keeps a season that is running right now', () => {
    // `end ?? start`: a four-week ghost month you are three days into is the
    // most relevant thing on the list, not something that has been and gone.
    renderList({ keyDates: [keySeason('Hungry Ghost', '2026-08-01', '2026-08-28')] })
    expect(screen.getByText('Hungry Ghost')).toBeTruthy()
  })

  it('opens Upcoming for key dates even when every post is in the past', () => {
    renderList({ posts: [older, gone], keyDates: [keyDay('Deepavali', '2026-08-20')] })
    const regions = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(regions).toEqual(['Upcoming', 'Past'])
    expect(screen.getByText('Deepavali')).toBeTruthy()
  })

  it('still reads as empty of your work with no posts and eight key dates', () => {
    // E3. The sentence is about *your* posts, and a populated Key dates block
    // above it would contradict it.
    const eight = Array.from({ length: 8 }, (_, i) => keyDay(`Date ${i}`, `2026-08-${10 + i}`))
    renderList({ posts: [], keyDates: eight })
    expect(screen.getByText(/Nothing planned yet/)).toBeTruthy()
    expect(screen.queryByText('Date 0')).toBeNull()
  })

  it('shows no block at all when every set is off', () => {
    renderList()
    expect(screen.queryByText('Singapore holidays')).toBeNull()
  })

  it('suffixes a past day too', () => {
    renderList({ keyDates: [keyDay('National Day', '2026-07-28')] })
    const heading = screen
      .getAllByRole('heading', { level: 3 })
      .find((h) => h.textContent?.includes('28 Jul'))
    expect(heading?.textContent).toContain('National Day')
  })
})

describe('SocialPostList — provenance', () => {
  const written = post('p-agent', new Date(2026, 7, 10, 9, 0), {
    body: 'The planner wrote this',
    createdBy: 'agent',
  })

  it('marks a row the agent wrote, and names the marker', () => {
    renderList({ posts: [written] })
    // The name, not the glyph: a shape is the fast path and never the only one.
    expect(screen.getByRole('img', { name: 'Written by the agent' })).toBeTruthy()
  })

  it('leaves a person’s rows unmarked', () => {
    // The default is that a person wrote it. A marker on every row would say
    // nothing on any of them.
    renderList({ posts: [soon] })
    expect(screen.queryByRole('img', { name: 'Written by the agent' })).toBeNull()
  })

  it('does not replace the status — the two together are the review question', () => {
    // `createdBy === 'agent' && status === 'draft'` is the unreviewed pile, so
    // an agent row still has to say which of the three states it is in.
    renderList({ posts: [written] })
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Written by the agent' })).toBeTruthy()
  })

  it('keeps the marker on a row the agent wrote and a person approved', () => {
    renderList({ posts: [{ ...written, status: 'ready' as const }] })
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Written by the agent' })).toBeTruthy()
  })
})
