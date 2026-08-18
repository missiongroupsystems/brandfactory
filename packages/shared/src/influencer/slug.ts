import { slugify, uniqueSlug } from '../slug'

/**
 * The influencer half of the slug rule — `slugify` with this aggregate's fallback
 * word. The rule itself is in `../slug.ts`, shared with outlets.
 *
 * The source is the **name**, not the handle; see `InfluencerSlugSchema` for why
 * it changed and why the slugs already in the table did not move.
 */

/**
 * What a name with no usable characters at all becomes — a creator entered in
 * Chinese, for instance, which survives `slugify` as nothing.
 *
 * The word is `creator` rather than `influencer`: it is a person, the screen's own
 * empty states and buttons already say "creator", and `/influencers/creator-3`
 * reads as a record rather than as a category.
 */
export const INFLUENCER_SLUG_FALLBACK = 'creator'

export function influencerSlug(name: string): string {
  return slugify(name, INFLUENCER_SLUG_FALLBACK)
}

/**
 * The first free influencer slug in a workspace: the base, then `-2`, `-3`, and
 * so on. `taken` is every influencer slug already in the workspace, which is what
 * the query layer reads out of `influencers_workspace_slug_key`.
 *
 * This is now the path two people who genuinely share a name take. It used to be
 * the path one person on two platforms took, which was the cost that
 * `influencer_accounts` removed.
 */
export function uniqueInfluencerSlug(name: string, taken: Iterable<string>): string {
  return uniqueSlug(influencerSlug(name), taken)
}
