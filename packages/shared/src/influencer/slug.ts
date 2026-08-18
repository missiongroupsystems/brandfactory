import { slugify, uniqueSlug } from '../slug'

/**
 * The influencer half of the slug rule — `slugify` with this aggregate's fallback
 * word. The rule itself is in `../slug.ts`, shared with outlets.
 *
 * The source is the **handle**, not the name; see `InfluencerSlugSchema` for why.
 */

/**
 * What a handle with no usable characters at all becomes — a xiaohongshu handle
 * in Chinese, for instance, which survives `slugify` as nothing.
 *
 * The word is `creator` rather than `influencer`: it is a person, the screen's own
 * empty states and buttons already say "creator", and `/influencers/creator-3`
 * reads as a record rather than as a category.
 */
export const INFLUENCER_SLUG_FALLBACK = 'creator'

export function influencerSlug(handle: string): string {
  return slugify(handle, INFLUENCER_SLUG_FALLBACK)
}

/**
 * The first free influencer slug in a workspace: the base, then `-2`, `-3`, and
 * so on. `taken` is every influencer slug already in the workspace, which is what
 * the query layer reads out of `influencers_workspace_slug_key`.
 *
 * This is the path one person on two platforms takes: the same handle slugifies to
 * the same base twice, so the second row gets `-2`.
 */
export function uniqueInfluencerSlug(handle: string, taken: Iterable<string>): string {
  return uniqueSlug(influencerSlug(handle), taken)
}
