import type { PlatformLogoKey } from '@/components/platform-logos'
import type { RosterAccount, RosterPerson, RosterStatus } from '@/data/roster'

/** 1250 → "1.3K", 1_200_000 → "1.2M", 980 → "980". */
export function followersOf(n: number | null): string {
  if (n === null) return ''
  if (n < 1000) return String(n)
  const [v, unit] = n < 1_000_000 ? [n / 1000, 'K'] : [n / 1_000_000, 'M']
  const shown = v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
  return `${shown}${unit}`
}

/** The platforms the app has a logo for; Xiaohongshu has none and shows its short name. */
export const LOGO: Partial<Record<RosterAccount['platform'], PlatformLogoKey>> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  facebook: 'fb',
  linkedin: 'li',
}

export const PLATFORM_NAME: Record<RosterAccount['platform'], string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  xiaohongshu: 'Xiaohongshu',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
}

/** An account's page on its platform: its own address when the roster has one. */
export function profileUrl(a: RosterAccount): string {
  if (a.url) return a.url
  const h = encodeURIComponent(a.handle)
  switch (a.platform) {
    case 'instagram':
      return `https://www.instagram.com/${h}/`
    case 'tiktok':
      return `https://www.tiktok.com/@${h}`
    case 'youtube':
      return `https://www.youtube.com/@${h}`
    case 'facebook':
      return `https://www.facebook.com/${h}`
    case 'linkedin':
      return `https://www.linkedin.com/in/${h}`
    case 'xiaohongshu':
      return `https://www.xiaohongshu.com/search_result?keyword=${h}`
  }
}

/** The account a person is known by, and the picture to show: the first account that has one. */
export const mainOf = (p: RosterPerson) => p.accounts[0] ?? null
export const pictureOf = (p: RosterPerson) => p.accounts.find((a) => a.picture)?.picture ?? null

export type StatusFilter = RosterStatus | 'all'

/**
 * The two statuses the team sorts creators into. A prospect, from the old roster, counts as
 * active: its stored status is kept until someone sets one.
 */
export const shownStatus = (s: RosterStatus): 'active' | 'past' =>
  s === 'past' ? 'past' : 'active'

export const STATUS_NAME: Record<RosterStatus, string> = {
  active: 'Active',
  prospect: 'Prospect',
  past: 'Past',
}

/** A tag in one spelling, as the core keeps it (`tag_of`), or null when it is no tag. */
export function tagOf(raw: string): string | null {
  const t = raw
    .replace(/^[\s#]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return /^[a-z0-9]([a-z0-9 &'-]{0,28}[a-z0-9])?$/.test(t) ? t : null
}

const fold = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * The people a search and the filters leave, in the roster's order (by name). A search matches a
 * word of the name or of a tag from its start, or any part of a handle; "@" and "#" are ignored.
 */
export function filterRoster(
  people: RosterPerson[],
  { query, brand, status }: { query: string; brand: string | 'all'; status: StatusFilter },
): RosterPerson[] {
  const q = fold(query.trim().replace(/^[@#]+/, ''))
  return people.filter((p) => {
    if (brand !== 'all' && !p.brands.includes(brand)) return false
    if (status !== 'all' && shownStatus(p.status) !== status) return false
    if (!q) return true
    const name = fold(p.name)
    return (
      name.startsWith(q) ||
      name.split(/[\s-]+/).some((w) => w.startsWith(q)) ||
      p.accounts.some((a) => fold(a.handle).includes(q)) ||
      matchedTag(p, query) !== null
    )
  })
}

/** The first of a person's tags a search matches by a word from its start, or null. */
export function matchedTag(p: RosterPerson, query: string): string | null {
  const q = fold(query.trim().replace(/^[@#]+/, ''))
  if (!q) return null
  return (
    (p.tags ?? []).find((t) => t.startsWith(q) || t.split(' ').some((w) => w.startsWith(q))) ?? null
  )
}

/**
 * An Instagram account a brand saved as a collaborator that no one on the roster holds: listed on
 * the Creators page beside the people, so the team can name it.
 */
export interface SavedHandle {
  orgId: string
  handle: string
  name: string | null
  picture: string | null
  followers: number | null
  /** The brands that saved it. */
  brands: string[]
}

/**
 * The saved handles of every brand, each once per company, with what is known of them: the
 * handles no one on the roster holds there, by name (an unnamed one by its handle).
 */
export function savedHandles(
  saved: Record<string, string[]>,
  orgOf: (brandId: string) => string,
  roster: RosterPerson[],
  profiles: Array<{
    orgId: string
    handle: string
    name: string | null
    picture: string | null
    followers: number | null
  }>,
): SavedHandle[] {
  const held = new Set(
    roster.flatMap((p) =>
      p.accounts.filter((a) => a.platform === 'instagram').map((a) => `${p.orgId}:${a.handle}`),
    ),
  )
  const known = new Map(profiles.map((p) => [`${p.orgId}:${p.handle}`, p]))
  const out = new Map<string, SavedHandle>()
  for (const [brandId, handles] of Object.entries(saved)) {
    const orgId = orgOf(brandId)
    if (!orgId) continue
    for (const raw of handles) {
      const handle = raw.replace(/^@+/, '').toLowerCase()
      const key = `${orgId}:${handle}`
      if (!/^[a-z0-9._]{1,30}$/.test(handle) || held.has(key)) continue
      const had = out.get(key)
      if (had) {
        if (!had.brands.includes(brandId)) had.brands.push(brandId)
        continue
      }
      const p = known.get(key)
      out.set(key, {
        orgId,
        handle,
        name: p?.name ?? null,
        picture: p?.picture ?? null,
        followers: p?.followers ?? null,
        brands: [brandId],
      })
    }
  }
  return [...out.values()]
}

/** The saved handles a search and the brand filter leave; they count as active, never past. */
export function filterHandles(
  handles: SavedHandle[],
  { query, brand, status }: { query: string; brand: string | 'all'; status: StatusFilter },
): SavedHandle[] {
  const q = fold(query.trim().replace(/^@+/, ''))
  return handles.filter((h) => {
    // A saved collaborator has no status of its own: a brand works with it now, so it is active.
    if (status === 'past') return false
    if (brand !== 'all' && !h.brands.includes(brand)) return false
    if (!q) return true
    const name = fold(h.name ?? '')
    return (
      name.startsWith(q) ||
      name.split(/[\s-]+/).some((w) => w.startsWith(q)) ||
      h.handle.includes(q)
    )
  })
}
