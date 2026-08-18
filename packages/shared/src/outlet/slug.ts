import { slugify, uniqueSlug } from '../slug'

/**
 * The outlet half of the slug rule. **The rule itself lives in `../slug.ts`** —
 * it moved there the day influencers needed the same two functions, and these are
 * wrappers so that nothing about an outlet's slug changed in the move.
 *
 * Keeping named wrappers rather than pointing callers at `slugify` directly is
 * what stops the fallback word from being a caller's decision: an outlet with an
 * unusable name becomes `outlet`, and only this file gets to say so.
 */

/** What a name with no usable characters at all becomes — `"翠"`, `"###"`, `""`. */
export const OUTLET_SLUG_FALLBACK = 'outlet'

export function outletSlug(name: string): string {
  return slugify(name, OUTLET_SLUG_FALLBACK)
}

/**
 * The first free outlet slug in a workspace: the base, then `-2`, `-3`, and so
 * on. `taken` is every outlet slug already in the workspace, which is what the
 * query layer reads out of `outlets_workspace_slug_key`.
 */
export function uniqueOutletSlug(name: string, taken: Iterable<string>): string {
  return uniqueSlug(outletSlug(name), taken)
}
