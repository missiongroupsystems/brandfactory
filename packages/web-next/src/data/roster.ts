/**
 * The demo's influencer roster: the company's creators, each linked to the brands they work
 * with. Static and invented, like `demo.ts`: the people are the collaborators of `suggestions.ts`
 * and a few creators no brand has worked with yet. On the core the roster is the company's own
 * (`influencer.list`, migration 0029), the old BrandFactory list.
 */

import { ACCOUNTS } from './suggestions'

export type RosterPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'xiaohongshu'
  | 'facebook'
  | 'linkedin'
export type RosterStatus = 'active' | 'prospect' | 'past'

export interface RosterAccount {
  platform: RosterPlatform
  /** As the platform spells it in a link: no "@", in lower case. */
  handle: string
  followers: number | null
  engagement: number | null
  url: string | null
  /** Our own copy of the profile picture; none shows initials. */
  picture: string | null
}

export interface RosterPerson {
  id: string
  orgId: string
  slug: string
  name: string
  /** What they make content about: food, fashion, parenting… */
  category: string | null
  status: RosterStatus
  /** The team's own notes: rates, replies, who to ask. Never published; not in the list. */
  notes?: string
  /** The first is the account they are known by. */
  accounts: RosterAccount[]
  /** The ids of the brands they are linked to. */
  brands: string[]
}

const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Followers the demo shows: a plausible spread, the same on every load. */
const FOLLOWERS = [48_200, 12_600, 215_000, 8_900, 33_400, 96_100, 5_300, 21_800, 140_500, 3_700]

/** A few creators the demo's brands have not worked with yet. */
const UNLINKED: Array<{
  name: string
  ig?: string
  tt?: string
  category: string
  status: RosterStatus
}> = [
  { name: 'Aiko Tan', ig: 'aikoeats', tt: 'aikoeats', category: 'food', status: 'prospect' },
  { name: 'Ben Lim', ig: 'benlim.cooks', category: 'food', status: 'prospect' },
  { name: 'Chloe Ng', ig: 'chloe.ng', tt: 'chloengg', category: 'fashion', status: 'prospect' },
  { name: 'Dev Patel', tt: 'devdines', category: 'food', status: 'past' },
  { name: 'Ella Wong', ig: 'ellawong.sg', category: 'parenting', status: 'prospect' },
  { name: 'Hana Sato', ig: 'hana.sips', category: 'food', status: 'active' },
  {
    name: 'Mei Chen',
    ig: 'meichen.fit',
    tt: 'meichenfit',
    category: 'fitness',
    status: 'prospect',
  },
  { name: 'Nora Lee', ig: 'noraleeathome', category: 'parenting', status: 'past' },
]

function build(): RosterPerson[] {
  const people = new Map<string, RosterPerson>()
  let n = 0
  for (const [brand, accounts] of Object.entries(ACCOUNTS)) {
    for (const a of accounts) {
      const handle = a.handle.replace(/^@/, '')
      const had = people.get(handle)
      if (had) {
        if (!had.brands.includes(brand)) had.brands.push(brand)
        continue
      }
      const followers = FOLLOWERS[n++ % FOLLOWERS.length]!
      people.set(handle, {
        id: `demo-${slugOf(a.name)}`,
        orgId: 'demo',
        slug: slugOf(a.name),
        name: a.name,
        category: 'food',
        status: a.collab ? 'active' : 'prospect',
        notes: a.collab ? `Collab post on ${a.collab}.` : '',
        accounts: [
          {
            platform: 'instagram',
            handle,
            followers,
            engagement: null,
            url: null,
            picture: a.picture ?? null,
          },
          ...(n % 3 === 0
            ? [
                {
                  platform: 'tiktok' as const,
                  handle,
                  followers: Math.round(followers / 3),
                  engagement: null,
                  url: null,
                  picture: null,
                },
              ]
            : []),
        ],
        brands: [brand],
      })
    }
  }
  for (const u of UNLINKED) {
    const followers = FOLLOWERS[n++ % FOLLOWERS.length]!
    const accounts: RosterAccount[] = []
    if (u.ig) {
      accounts.push({
        platform: 'instagram',
        handle: u.ig,
        followers,
        engagement: null,
        url: null,
        picture: null,
      })
    }
    if (u.tt) {
      accounts.push({
        platform: 'tiktok',
        handle: u.tt,
        followers: Math.round(followers * 1.4),
        engagement: null,
        url: null,
        picture: null,
      })
    }
    people.set(u.name, {
      id: `demo-${slugOf(u.name)}`,
      orgId: 'demo',
      slug: slugOf(u.name),
      name: u.name,
      category: u.category,
      status: u.status,
      notes: '',
      accounts,
      brands: [],
    })
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const DEMO_ROSTER: RosterPerson[] = build()
