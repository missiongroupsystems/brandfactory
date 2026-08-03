import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { SocialPost } from '@brandfactory/shared'
import { brandKeys } from './brands'
import { applySocialPostToCache } from './social-posts'

const BRAND_ID = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-08-01T00:00:00.000Z'

function post(id: string, over: Partial<SocialPost> = {}) {
  return {
    id: id as SocialPost['id'],
    brandId: BRAND_ID as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: null,
    body: '',
    status: 'draft',
    assetIds: [],
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as SocialPost
}

const TRAY = post('p-tray', { body: 'No slot yet.' })
const EARLY = post('p-early', { scheduledAt: '2026-08-05T08:00:00.000Z', body: 'Early.' })
const LATE = post('p-late', { scheduledAt: '2026-08-20T10:00:00.000Z', body: 'Late.' })

let qc: QueryClient

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

function seed(posts: SocialPost[]) {
  qc.setQueryData(brandKeys.socialPosts(BRAND_ID), posts)
}

function read() {
  return qc.getQueryData<SocialPost[]>(brandKeys.socialPosts(BRAND_ID))
}

function ids() {
  return read()?.map((p) => p.id)
}

describe('applySocialPostToCache', () => {
  it('inserts a newly created post in calendar order, not at the end', () => {
    seed([TRAY, LATE])
    applySocialPostToCache(qc, BRAND_ID, EARLY)
    expect(ids()).toEqual(['p-tray', 'p-early', 'p-late'])
  })

  it('replaces in place rather than appending a second copy', () => {
    seed([TRAY, EARLY])
    applySocialPostToCache(qc, BRAND_ID, { ...EARLY, body: 'Early, rewritten.' })
    const rows = read()
    expect(rows).toHaveLength(2)
    expect(rows?.map((p) => p.body)).toEqual(['No slot yet.', 'Early, rewritten.'])
  })

  /**
   * The one way posts differ from assets, and the reason the applier re-sorts.
   *
   * An asset patch cannot change where the row belongs; a post patch routinely
   * does. Splicing a rescheduled post back where it used to sit would leave the
   * calendar showing it under the wrong date until something forced a refetch.
   */
  it('moves a rescheduled post to its new place in the ordering', () => {
    seed([EARLY, LATE])
    applySocialPostToCache(qc, BRAND_ID, { ...EARLY, scheduledAt: '2026-08-25T08:00:00.000Z' })
    expect(ids()).toEqual(['p-late', 'p-early'])
  })

  // The other direction: clearing the slot sends the post to the tray, which
  // sorts as its own group ahead of everything scheduled.
  it('moves an unscheduled post to the front of the list', () => {
    seed([EARLY, LATE])
    applySocialPostToCache(qc, BRAND_ID, { ...LATE, scheduledAt: null })
    expect(ids()).toEqual(['p-late', 'p-early'])
  })

  /**
   * A soft-deleted row leaves the list rather than sitting in it with a
   * `deletedAt` the calendar grid and the list view would each have to
   * remember to filter. The server's own read path drops it, so this is what
   * makes the cache agree with a refetch instead of diverging until one
   * happens.
   */
  it('drops a soft-deleted post out of the list', () => {
    seed([TRAY, EARLY, LATE])
    applySocialPostToCache(qc, BRAND_ID, { ...EARLY, deletedAt: T0 })
    expect(ids()).toEqual(['p-tray', 'p-late'])
  })

  it('is a no-op when the soft-deleted post was not cached', () => {
    seed([TRAY])
    applySocialPostToCache(qc, BRAND_ID, { ...EARLY, deletedAt: T0 })
    expect(ids()).toEqual(['p-tray'])
  })

  // The Undo's cache half: a restored post arrives with `deletedAt: null` and
  // lands back in the ordering it belongs to, not at the end of the list.
  it('puts a restored post back in calendar order', () => {
    seed([TRAY, LATE])
    applySocialPostToCache(qc, BRAND_ID, { ...EARLY, deletedAt: null })
    expect(ids()).toEqual(['p-tray', 'p-early', 'p-late'])
  })

  /**
   * The pending/empty distinction, at the cache layer. `undefined` means the
   * query has never resolved, and seeding a one-row list into it would make
   * the calendar render a single post for a brand whose real plan is still
   * unknown — then swap it for the true list a moment later.
   */
  it('leaves an unseeded cache untouched rather than inventing a list', () => {
    applySocialPostToCache(qc, BRAND_ID, TRAY)
    expect(read()).toBeUndefined()
  })

  it('writes into an empty list, which is a real state and not an absent one', () => {
    seed([])
    applySocialPostToCache(qc, BRAND_ID, TRAY)
    expect(ids()).toEqual(['p-tray'])
  })

  it('does not touch another brand’s list', () => {
    const OTHER = '55555555-5555-4555-8555-555555555555'
    seed([TRAY])
    qc.setQueryData(brandKeys.socialPosts(OTHER), [LATE])
    applySocialPostToCache(qc, BRAND_ID, { ...TRAY, body: 'Edited.' })
    expect(qc.getQueryData<SocialPost[]>(brandKeys.socialPosts(OTHER))?.map((p) => p.body)).toEqual(
      ['Late.'],
    )
  })

  // The re-sort makes this easy to get wrong: `sort` mutates in place, so an
  // applier that sorted the cached array directly would rewrite the list React
  // still holds a reference to.
  it('does not mutate the array it was given', () => {
    const before = [LATE, EARLY]
    seed(before)
    applySocialPostToCache(qc, BRAND_ID, { ...TRAY })
    expect(before.map((p) => p.id)).toEqual(['p-late', 'p-early'])
  })
})

describe('brandKeys.socialPosts', () => {
  /**
   * `['brands', id]` is a prefix of `['brands', id, 'social-posts']`, which is
   * what makes `useDeleteBrand`'s `removeQueries({ queryKey: detail(id) })`
   * take the post list with it. Deleting a brand and landing on a new one that
   * reused a cached post list would be a cross-brand leak; this is a property
   * of the key shape rather than of any code that could be edited away.
   */
  it('nests under the brand detail key so a brand delete sweeps it', () => {
    seed([TRAY])
    qc.removeQueries({ queryKey: brandKeys.detail(BRAND_ID) })
    expect(read()).toBeUndefined()
  })
})
