import { z } from 'zod'

/**
 * The text → slug rule, in one place because two writers would drift.
 *
 * It arrived as `outlet/slug.ts` and moved here the day a second aggregate
 * needed it. **Nothing about the rule changed in the move** — `outletSlug` and
 * `uniqueOutletSlug` are now two-line wrappers over these functions and produce
 * exactly what they produced before, which is what lets every outlet URL already
 * written keep resolving.
 *
 * `"Harbour Table — Marina"` becomes `harbour-table-marina`. Accented letters
 * lose their marks (`Café` → `cafe`) rather than being dropped, so a name that is
 * entirely accented still produces a readable segment instead of an empty one.
 *
 * Pure and total: `slugify` always returns something a URL can carry. The
 * uniqueness half needs the rest of the workspace's slugs, so it is a second
 * function the query layer calls beside the index that enforces it.
 */

/**
 * What a slug looks like on the wire, for every aggregate that carries one:
 * lowercase words joined by single hyphens.
 *
 * One schema rather than one per aggregate, because `slugify` is one function —
 * two regexes would be two chances for a schema to reject what the generator
 * emits. `OutletSlugSchema` and `InfluencerSlugSchema` are both this.
 *
 * The 120 cap is the wire's; `MAX_BASE_LENGTH` below is 100, which leaves room
 * for a `-99` suffix without the result ever failing this.
 */
export const SlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A slug is lowercase words joined by single hyphens')

/** Matches the column and `SlugSchema`, leaving room for a `-99` suffix. */
const MAX_BASE_LENGTH = 100

/**
 * Turn a name or a handle into a URL segment.
 *
 * `fallback` is what a source with no usable characters at all becomes — `"翠"`,
 * `"###"`, `""`. It is a parameter rather than a constant because the word should
 * say what kind of record it is standing in for: `outlet`, `creator`. A caller
 * that shared one fallback across aggregates would put `outlet-2` in an
 * influencer's URL.
 */
export function slugify(source: string, fallback: string): string {
  const slug = source
    .normalize('NFKD')
    // Strip the combining marks NFKD just split off. Doing this *before* the
    // character filter is what turns `é` into `e` rather than deleting it.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Everything that is not a-z0-9 becomes a separator — an em dash, a slash, an
    // ampersand and a run of spaces all collapse to one hyphen below.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    // The slice can land mid-word and leave a trailing hyphen, which
    // `SlugSchema` rejects.
    .replace(/-+$/g, '')

  return slug || fallback
}

/**
 * The first free slug in a workspace: the base, then `-2`, `-3`, and so on.
 *
 * Numbering from **2** rather than 1 because the unsuffixed slug is the first
 * one — `casa-vostra` and `casa-vostra-2` read as the first and second, while
 * `casa-vostra-1` would suggest a `casa-vostra` that is not this record.
 *
 * `base` is already slugified; `taken` is every slug already in the workspace,
 * which is what the caller reads out of the index. The loop is bounded by that
 * set's size plus one, so it terminates whatever is in it.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = taken instanceof Set ? taken : new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; n <= used.size + 2; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
  // Unreachable: the loop tries more candidates than there are taken slugs.
  /* v8 ignore next */
  throw new Error(`Could not find a free slug for "${base}"`)
}
