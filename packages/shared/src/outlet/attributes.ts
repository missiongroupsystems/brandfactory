/**
 * The attribute catalogue — what the picker offers, and where a key gets a
 * label.
 *
 * **Static data with no table and no route**, which is the repository's
 * standing rule for a set that is the same for every workspace, that no user
 * edits and that never has to be joined against
 * (`CLAUDE.md`, "Not every fact needs a table"; `lib/key-dates/` is the
 * precedent, at 92 rows). Twelve strings in a table would be twelve strings plus
 * a migration, a query, a route and a fetch that can fail.
 *
 * It lives in `@brandfactory/shared` rather than in the web package because two
 * readers need the same list: the form renders it as checkboxes, and any future
 * import has to map a source system's vocabulary onto it. One list, one spelling.
 *
 * **The catalogue does not gate the column.** `OutletAttributesSchema` accepts
 * any key — see its docstring for why an import must not be refused over a tag —
 * so this is the offered set, not the permitted one.
 *
 * The Operations Hub served an equivalent list from
 * `/reference/outlet-attributes` because its twenty keys also drove licence-
 * requirement rules, and the checkboxes had to agree with the rules by
 * construction. Nothing here reads these keys but the reader, so that endpoint's
 * reason for existing does not carry over.
 */
export interface OutletAttributeDefinition {
  key: string
  label: string
}

export const OUTLET_ATTRIBUTES: readonly OutletAttributeDefinition[] = [
  { key: 'serves_alcohol', label: 'Serves alcohol' },
  { key: 'prepares_food', label: 'Prepares food' },
  { key: 'outdoor_seating', label: 'Outdoor seating' },
  { key: 'live_music', label: 'Live music' },
  { key: 'private_dining', label: 'Private dining room' },
  { key: 'takes_reservations', label: 'Takes reservations' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'breakfast', label: 'Open for breakfast' },
  { key: 'late_night', label: 'Open late' },
  { key: 'pet_friendly', label: 'Pet friendly' },
  { key: 'wheelchair_access', label: 'Step-free access' },
] as const

const BY_KEY = new Map(OUTLET_ATTRIBUTES.map((attribute) => [attribute.key, attribute.label]))

/**
 * The label for a key, or **the key itself** when the catalogue does not know it.
 *
 * The fallback is the honest one. An imported outlet may carry a tag this list
 * has never heard of, and the two alternatives are both worse: dropping it hides
 * a fact the record actually holds, and rendering "Unknown" states something
 * about the outlet rather than about this file.
 */
export function outletAttributeLabel(key: string): string {
  return BY_KEY.get(key) ?? key
}

/**
 * Put a selection back into catalogue order, dropping duplicates.
 *
 * The picker calls this on every tick so the submitted array is stable whatever
 * order the boxes were ticked in — otherwise two people setting the same three
 * attributes write two different arrays and every diff of the row is noise.
 *
 * Keys the catalogue does not know keep their relative order and sort **after**
 * the known ones, so an imported tag stays on the record rather than being
 * silently dropped by the reorder.
 */
export function orderOutletAttributes(keys: readonly string[]): string[] {
  const wanted = new Set(keys)
  const known = OUTLET_ATTRIBUTES.map((a) => a.key).filter((key) => wanted.has(key))
  const knownSet = new Set(known)
  const unknown: string[] = []
  for (const key of keys) {
    if (!knownSet.has(key) && !unknown.includes(key)) unknown.push(key)
  }
  return [...known, ...unknown]
}
