import type { Suggestion } from '@/components/suggest'
import type { RosterPerson } from '@/data/roster'

/** How many people the list shows. */
export const PEOPLE_LIMIT = 8

/** "Antonio Ferri" → "AF"; "@chefantonio" → "CH". */
export const initialsOf = (name: string) => {
  // Only words that start with a letter or a digit: "SG Eats • Hotels" → "SE".
  const words = name
    .replace(/^@+/, '')
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
  const letters = words.length > 1 ? words.map((w) => w.charAt(0)).join('') : (words[0] ?? '')
  return letters.slice(0, 2).toUpperCase()
}

const fold = (handle: string) => handle.replace(/^@+/, '').toLowerCase()

/**
 * The accounts a post's Collaborators or Tag people offers, for one brand: Instagram accounts
 * only, since both are Instagram's. Each row is a person's Instagram account on the roster, a
 * handle the brand saved as a collaborator, or one the team picked for this brand before.
 *
 * - `all` is what typing searches, in this order (each row's `tier`, which the list ranks by
 *   before how well a row matches): the people linked to the brand that the team used lately,
 *   newest first (0), the other linked people by name (1), other accounts used lately (2), then
 *   everyone else (3): the brand's saved collaborators, then the rest of the roster by name. Within
 *   a tier the better match comes first.
 * - `idle` is what the field shows before anything is typed: the linked people, the accounts used
 *   lately and the saved collaborators, in that order, at most `PEOPLE_LIMIT`.
 *
 * A row of someone linked to the brand carries `linkedTo`: the list marks it with the brand's
 * logo. Nothing else tells the rows apart. Every row carries `rename`: the team may fix its name
 * from the list (`personOfHandle` says whose name it is).
 */
export function peopleFor({
  brandId,
  roster,
  saved,
  recent,
  names = new Map(),
  picture = (src) => src,
}: {
  brandId: string
  roster: RosterPerson[]
  /** The brand's saved Instagram collaborators ("@name"). */
  saved: string[]
  /** The handles used for the brand, newest first, without "@". */
  recent: string[]
  /** What is known of the accounts no one on the roster holds, by handle (`account_profiles`). */
  names?: Map<string, { name: string | null; picture: string | null }>
  picture?: (src: string) => string
}): { idle: Suggestion[]; all: Suggestion[] } {
  const used = new Map(recent.map((h, i) => [fold(h), i]))
  const rows: Array<Suggestion & { order: number; sortName: string; own: boolean }> = []
  const seen = new Set<string>()
  for (const p of roster) {
    const linked = p.brands.includes(brandId)
    for (const a of p.accounts) {
      if (a.platform !== 'instagram' || seen.has(a.handle)) continue
      seen.add(a.handle)
      const at = used.get(a.handle)
      const tier = linked ? (at !== undefined ? 0 : 1) : at !== undefined ? 2 : 3
      rows.push({
        value: `@${a.handle}`,
        name: p.name,
        detail: `@${a.handle}`,
        platform: 'ig',
        initials: initialsOf(p.name),
        ...(a.picture && { picture: picture(a.picture) }),
        ...(linked && { linkedTo: brandId }),
        rename: a.handle,
        tier,
        order: at ?? 0,
        sortName: p.name.toLowerCase(),
        own: tier <= 2,
      })
    }
  }
  const bare = (handle: string, tier: number, order: number) => {
    const h = fold(handle)
    if (!h || seen.has(h)) return
    seen.add(h)
    // Every row has the same two lines: a name, then the platform and the handle. An account with
    // no name yet shows its handle first and only its platform under it, until someone names it.
    const known = names.get(h)
    rows.push({
      value: `@${h}`,
      name: known?.name ?? h,
      detail: known?.name ? `@${h}` : 'Instagram',
      platform: 'ig',
      initials: initialsOf(known?.name ?? h),
      ...(known?.picture && { picture: picture(known.picture) }),
      rename: h,
      tier,
      order,
      sortName: (known?.name ?? h).toLowerCase(),
      own: true,
    })
  }
  recent.forEach((h, i) => bare(h, 2, i))
  saved.forEach((h, i) => bare(h, 3, i))
  const byRecency = (t: number) => t === 0 || t === 2
  const sorted = rows.sort(
    (a, b) =>
      a.tier! - b.tier! ||
      (byRecency(a.tier!) ? a.order - b.order : 0) ||
      // The saved collaborators, in the brand's order, before the rest when nothing is typed.
      Number(b.own) - Number(a.own) ||
      (a.own && b.own ? a.order - b.order : 0) ||
      a.sortName.localeCompare(b.sortName),
  )
  const strip = ({ order: _o, sortName: _s, own: _w, ...row }: (typeof rows)[number]) => row
  return {
    idle: sorted
      .filter((r) => r.own)
      .slice(0, PEOPLE_LIMIT)
      .map(strip),
    all: sorted.map(strip),
  }
}

/**
 * The roster person whose Instagram account a handle is, or null: a name fixed in the list is then
 * the person's own (`influencer.edit`), else the saved account's (`influencer.profile_name`).
 */
export function personOfHandle(
  roster: RosterPerson[],
  orgId: string,
  handle: string,
): RosterPerson | null {
  const h = fold(handle)
  return (
    roster.find(
      (p) =>
        (!orgId || p.orgId === orgId) &&
        p.accounts.some((a) => a.platform === 'instagram' && a.handle === h),
    ) ?? null
  )
}
