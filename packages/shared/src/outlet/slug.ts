/**
 * The name → slug rule, in one place because two writers would drift.
 *
 * `"Harbour Table — Marina"` becomes `harbour-table-marina`. Accented letters
 * lose their marks (`Café` → `cafe`) rather than being dropped, so a name that is
 * entirely accented still produces a readable segment instead of an empty one.
 *
 * Pure and total: it always returns something a URL can carry. The uniqueness
 * half is not here — that needs the rest of the workspace's slugs, so it lives in
 * the query layer beside the index that enforces it (`uniqueOutletSlug`).
 */

/** What a name with no usable characters at all becomes — `"翠"`, `"###"`, `""`. */
export const OUTLET_SLUG_FALLBACK = 'outlet'

/** Matches the column and `OutletSlugSchema`, leaving room for a `-99` suffix. */
const MAX_BASE_LENGTH = 100

export function outletSlug(name: string): string {
  const slug = name
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
    // `OutletSlugSchema` rejects.
    .replace(/-+$/g, '')

  return slug || OUTLET_SLUG_FALLBACK
}

/**
 * The first free slug in a workspace: the base, then `-2`, `-3`, and so on.
 *
 * Numbering from **2** rather than 1 because the unsuffixed slug is the first
 * one — `casa-vostra` and `casa-vostra-2` read as the first and second, while
 * `casa-vostra-1` would suggest a `casa-vostra` that is not this record.
 *
 * `taken` is every slug already in the workspace, which is what the caller reads
 * out of the index. The loop is bounded by that set's size plus one, so it
 * terminates whatever is in it.
 */
export function uniqueOutletSlug(name: string, taken: Iterable<string>): string {
  const base = outletSlug(name)
  const used = taken instanceof Set ? taken : new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; n <= used.size + 2; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
  // Unreachable: the loop tries more candidates than there are taken slugs.
  /* v8 ignore next */
  throw new Error(`Could not find a free slug for "${name}"`)
}
