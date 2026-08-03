import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandAsset, SocialPost } from '@brandfactory/shared'
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
    source: 'blob',
    role: null,
    status: 'active',
    label,
    blobKey: `k-${id}`,
    position: 100,
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

  it('leads with the unscheduled tray — the grid cannot show those at all', () => {
    renderList()
    const regions = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(regions).toEqual(['Unscheduled', 'Upcoming', 'Past'])
    expect(screen.getByText('1 post')).toBeTruthy()
    expect(screen.getByText('An idea with no date')).toBeTruthy()
  })

  it('omits the tray region entirely when every post has a slot', () => {
    renderList({ posts: [today, soon] })
    expect(screen.queryByRole('heading', { name: 'Unscheduled' })).toBeNull()
  })

  it('splits on today and runs both halves away from now', () => {
    renderList()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    // Today first and forward; then yesterday-ward, most recent first — the
    // rows nearest the present sit nearest the middle.
    expect(headings).toEqual(['Today', 'Mon 10 Aug', 'Tue 28 Jul', 'Mon 20 Jul'])
  })

  it('counts a post later today as upcoming, not as past', () => {
    // 18:30 today is still ahead of 12:00 today, and grouping by day is what
    // keeps a morning post from falling out of Today the moment noon passes.
    renderList({ posts: [today] })
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Past' })).toBeNull()
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
