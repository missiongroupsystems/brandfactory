/**
 * The roster's data for `roster.ts`: the old BrandFactory tables as CSV exports of its Supabase
 * project, and the brand links read from each brand's saved collaborators. Pure functions, no
 * network, so the tests read them as they are.
 *
 * The exports are the roster's source (146 people, 216 accounts, the same as the archive's seed
 * `SEED_INFLUENCERS`, with their notes). They hold negotiated rates and remarks about named people,
 * and this repository is public: they stay out of git, and the script prints counts only.
 */

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'xiaohongshu' | 'facebook' | 'linkedin'
export type Status = 'active' | 'prospect' | 'past'

export const PLATFORMS: Platform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'xiaohongshu',
  'facebook',
  'linkedin',
]
export const CATEGORIES = [
  'beauty',
  'fashion',
  'food',
  'fitness',
  'travel',
  'home',
  'tech',
  'parenting',
  'motoring',
  'family',
] as const
export type Category = (typeof CATEGORIES)[number]

export interface RosterAccount {
  platform: Platform
  handle: string
  followers: number | null
  engagement: number | null
  url: string | null
}

/** One person as `influencer.import` takes them, with the brands to link by our ids. */
export interface RosterPerson {
  slug: string
  name: string
  category: Category | null
  status: Status
  notes?: string | null
  accounts: RosterAccount[]
  brands?: string[]
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 rows: fields split by commas, a quoted field may hold commas, newlines and doubled
 * quotes. Supabase's table export writes this, with a header row and an empty field for null.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f !== ''))
  if (!header) return []
  return body.map((r) => Object.fromEntries(header.map((h, n) => [h.trim(), r[n] ?? ''])))
}

/** The old database's tables, as its CSV exports hold them. */
export interface OldTables {
  influencers: Record<string, string>[]
  accounts: Record<string, string>[]
  /** `influencer_brands.csv`: empty in the old project (no link was ever made). */
  links: Record<string, string>[]
  brands: Record<string, string>[]
}

/** "Chin Mee Chin" → "chin-mee-chin": how the new brands' ids were made from their names. */
export const brandIdOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const numberOr = (v: string | undefined) => {
  const t = (v ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const textOr = (v: string | undefined) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/** What did not come across, by reason, for the script to print. */
export interface Skipped {
  /** A link whose old brand has no brand of ours (by name), with the old brand's name. */
  brands: Record<string, number>
  /** An account on a platform or with a handle the roster does not take. */
  accounts: number
  /** A link or an account whose person is not in `influencers.csv`. */
  orphans: number
  /** A person of another workspace than `--workspace`. */
  workspace: number
}

/**
 * The people of the old tables, with their brands mapped to ours by name: an old brand is ours
 * when its name makes one of `ours` (Casa Vostra → casa-vostra). Brands that do not exist here
 * (Mission Group, say) are skipped and counted.
 */
export function peopleOfTables(
  tables: OldTables,
  ours: Set<string>,
  workspace?: string,
): { people: RosterPerson[]; skipped: Skipped } {
  const skipped: Skipped = { brands: {}, accounts: 0, orphans: 0, workspace: 0 }
  const brandName = new Map(tables.brands.map((b) => [b.id, b.name ?? '']))
  const byId = new Map<string, RosterPerson & { at: Map<number, RosterAccount> }>()
  for (const r of tables.influencers) {
    if (workspace && r.workspace_id && r.workspace_id !== workspace) {
      skipped.workspace++
      continue
    }
    const vertical = textOr(r.vertical)
    const status = textOr(r.status)
    byId.set(r.id!, {
      slug: r.slug!.trim(),
      name: r.name!.trim(),
      category: CATEGORIES.includes(vertical as Category) ? (vertical as Category) : null,
      status: status === 'active' || status === 'past' ? status : 'prospect',
      notes: r.notes ?? '',
      accounts: [],
      brands: [],
      at: new Map(),
    })
  }
  for (const a of tables.accounts) {
    const person = byId.get(a.influencer_id!)
    if (!person) {
      skipped.orphans++
      continue
    }
    const platform = (a.platform ?? '').trim() as Platform
    const handle = (a.handle ?? '').trim().replace(/^@+/, '')
    if (!PLATFORMS.includes(platform) || handle === '' || /[\s/?#@]/.test(handle)) {
      skipped.accounts++
      continue
    }
    const url = textOr(a.url)
    person.at.set(numberOr(a.position) ?? person.at.size, {
      platform,
      handle,
      followers: numberOr(a.followers),
      engagement: numberOr(a.engagement_rate),
      url: url && url.startsWith('https://') ? url : null,
    })
  }
  for (const l of tables.links) {
    const person = byId.get(l.influencer_id!)
    if (!person) {
      skipped.orphans++
      continue
    }
    const name = brandName.get(l.brand_id!) ?? l.brand_id ?? ''
    const ours_ = brandIdOf(name)
    if (!ours.has(ours_)) {
      skipped.brands[name] = (skipped.brands[name] ?? 0) + 1
      continue
    }
    if (!person.brands!.includes(ours_)) person.brands!.push(ours_)
  }
  const people = [...byId.values()].map(({ at, ...p }) => ({
    ...p,
    accounts: [...at.entries()].sort(([x], [y]) => x - y).map(([, a]) => a),
  }))
  return { people, skipped }
}

/** A brand's saved collaborators (`brands.collaborators`, migration 0025), by platform. */
export type Collaborators = Partial<Record<'ig' | 'tt' | 'fb', string[]>>

const ON: Partial<Record<Platform, 'ig' | 'tt'>> = { instagram: 'ig', tiktok: 'tt' }

/**
 * Links each person to the brands that already work with them: a brand whose saved Instagram or
 * TikTok collaborators hold one of the person's handles on that platform. Nothing else links a
 * person; the rest stay on the roster unlinked. Answers the links made, per brand.
 */
export function linkByCollaborators(
  people: RosterPerson[],
  brands: Record<string, Collaborators>,
): Record<string, number> {
  const matched: Record<string, number> = {}
  for (const [brand, saved] of Object.entries(brands)) {
    const held = {
      ig: new Set((saved.ig ?? []).map((h) => h.replace(/^@+/, '').toLowerCase())),
      tt: new Set((saved.tt ?? []).map((h) => h.replace(/^@+/, '').toLowerCase())),
    }
    matched[brand] = 0
    for (const p of people) {
      const hit = p.accounts.some((a) => {
        const on = ON[a.platform]
        return on !== undefined && held[on].has(a.handle.replace(/^@+/, '').toLowerCase())
      })
      if (!hit) continue
      p.brands ??= []
      if (!p.brands.includes(brand)) {
        p.brands.push(brand)
        matched[brand]!++
      }
    }
  }
  return matched
}

/**
 * The names researched for the brands' saved Instagram collaborators (`handle-names.csv`:
 * brand,platform,handle,name,kind,confidence,source_url), one per handle: a name of high or
 * medium confidence, on Instagram, for a handle no one on the roster holds. A handle saved by
 * several brands is named once. TikTok and Facebook rows are counted and left: the post page names
 * Instagram accounts only.
 */
export function namesOf(
  rows: Record<string, string>[],
  roster: Set<string>,
): { names: Map<string, string>; skipped: { unsure: number; platform: number; roster: number } } {
  const names = new Map<string, string>()
  const skipped = { unsure: 0, platform: 0, roster: 0 }
  for (const r of rows) {
    const platform = (r.platform ?? '').trim().toLowerCase()
    if (platform !== 'ig' && platform !== 'instagram') {
      skipped.platform++
      continue
    }
    const handle = (r.handle ?? '').trim().replace(/^@+/, '').toLowerCase()
    const name = (r.name ?? '').trim()
    const sure = ['high', 'medium'].includes((r.confidence ?? '').trim().toLowerCase())
    if (!sure || !name || !/^[a-z0-9._]{1,30}$/.test(handle)) {
      skipped.unsure++
      continue
    }
    if (roster.has(handle)) {
      skipped.roster++
      continue
    }
    if (!names.has(handle)) names.set(handle, name.slice(0, 200))
  }
  return { names, skipped }
}
