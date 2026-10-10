/**
 * The insights page's other sources, one set per brand, for the same 30 days as `insights.ts`
 * (7 Sep – 6 Oct): each source day by day, and what people said in comments and mentions.
 *
 * The daily series are made, not typed: a base per weekday, a slow climb, and a lift after each
 * post in `insights.ts`, scaled by that post's reach and by how its format moves each source,
 * then fitted to the month's total. So a spike in Maps views or bookings always follows a real
 * post on the page, and the social totals add up to the reach on the Overview. Static
 * placeholders, plausible for a Singapore restaurant and different per brand.
 */

import type { BrandId } from './brands'
import { INSIGHTS_BY_BRAND, type PostStat } from './insights'

/** The 30 days run from Monday 7 Sep 2026. */
export const DAYS = 30
const START = new Date(2026, 8, 7)
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** "16 SEP" → 9: the day of the period a post went out on. */
export function dayOf(date: string): number {
  const [d, m] = date.split(' ')
  const at = new Date(2026, MONTHS.indexOf(m!), Number(d))
  return Math.round((at.getTime() - START.getTime()) / 86_400_000)
}

/** 9 → "Wed 16 Sep". */
export function dayName(i: number): string {
  const at = new Date(2026, 8, 7 + i)
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()]
  const m = MONTHS[at.getMonth()]!
  return `${wd} ${at.getDate()} ${m.charAt(0)}${m.slice(1).toLowerCase()}`
}

/** A day-by-day measure, one value for each of the 30 days. */
export type MetricId =
  | 'ig'
  | 'tt'
  | 'web'
  | 'maps'
  | 'searches'
  | 'calls'
  | 'directions'
  | 'bookings'

/** Where the page's numbers come from. */
export type SourceId = 'ig' | 'tt' | 'web' | 'gbp' | 'res'

export interface Source {
  id: SourceId
  name: string
  /** What it brings to the page, in a few words. */
  brings: string
}

export const SOURCES: Source[] = [
  { id: 'ig', name: 'Instagram', brings: 'Reach, saves, comments, mentions' },
  { id: 'tt', name: 'TikTok', brings: 'Views, shares, comments, mentions' },
  { id: 'web', name: 'Website', brings: 'Visits, through Wix' },
  { id: 'gbp', name: 'Google Business Profile', brings: 'Searches, Maps views, calls, directions' },
  { id: 'res', name: 'Reservations', brings: 'Bookings, by the day they were made' },
]

/** A share of opinion, as counts: positive, neutral, negative. */
export interface Split {
  pos: number
  neu: number
  neg: number
}

export interface Quote {
  text: string
  who: string
  /** A comment on one of the brand's posts, or a post that mentions or tags the brand. */
  where: 'comment' | 'mention'
  /** The post it was left on, or where the mention was. */
  on: string
  tone: keyof Split
}

export interface Sentiment {
  /** Posts by other people that tag or mention the brand. */
  mentions: Split
  /** Comments and mentions together, week by week, oldest first: twelve weeks to 5 Oct. */
  weeks: Split[]
  /** What people praise, and what they complain about, with how often each came up. */
  praise: Array<{ theme: string; count: number }>
  complaints: Array<{ theme: string; count: number }>
  quotes: Quote[]
  /** Each post's comments, by its hook in `insights.ts`. Their sum is the month's comments. */
  posts: Record<string, Split>
}

export interface BrandHub {
  /** Each measure, day by day. */
  daily: Record<MetricId, number[]>
  sentiment: Sentiment
}

// ── The daily series ─────────────────────────────────────────────────────────────────────────

type Format = PostStat['format']

interface Recipe {
  /** The month's total for each measure. */
  totals: Record<MetricId, number>
  /** How busy each weekday is for bookings and Maps, Monday first. */
  week: number[]
  /** How much each format lifts each off-social measure: bookings after a carousel, say. */
  lift: Record<Format, number>
  /** A seed, so each brand's small day-to-day wobble differs but never changes between loads. */
  seed: number
}

/** A tiny seeded random source (mulberry32): the same numbers on every load. */
function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A post's pull on each day after it: social lands the same day, the rest a day or two later. */
const SOCIAL = [1, 0.5, 0.22, 0.08]
const OFF = [0.1, 1, 0.45]
/** How strongly posts move each measure, against its base. */
const PULL: Record<MetricId, number> = {
  ig: 2.4,
  tt: 1.2,
  web: 1.1,
  maps: 1.5,
  searches: 1.0,
  calls: 0.7,
  directions: 1.2,
  bookings: 0.9,
}

function series(posts: PostStat[], r: Recipe): Record<MetricId, number[]> {
  const next = random(r.seed)
  const avgReach = posts.reduce((n, p) => n + p.reach, 0) / posts.length
  const out = {} as Record<MetricId, number[]>
  for (const id of Object.keys(r.totals) as MetricId[]) {
    const social = id === 'ig' || id === 'tt'
    const kernel = social ? SOCIAL : OFF
    const raw = Array.from({ length: DAYS }, (_, d) => {
      // Social is busy every day; the rest follows the brand's week. Everything climbs a little.
      const base = (social ? 1 : r.week[d % 7]!) * (1 + (0.12 * d) / DAYS)
      let pull = 0
      for (const p of posts) {
        const at = d - dayOf(p.date)
        if (at < 0 || at >= kernel.length) continue
        pull += kernel[at]! * (p.reach / avgReach) * (social ? 1 : r.lift[p.format])
      }
      return base * (1 + PULL[id] * pull * (social ? 0.35 : 0.45)) * (0.94 + next() * 0.12)
    })
    const sum = raw.reduce((n, v) => n + v, 0)
    out[id] = raw.map((v) => Math.round((v / sum) * r.totals[id]))
  }
  return out
}

/** Comment splits for a brand's posts, in the order `insights.ts` lists them. */
function byPost(brand: BrandId, splits: Array<[number, number, number]>): Record<string, Split> {
  return Object.fromEntries(
    INSIGHTS_BY_BRAND[brand].posts.map((p, i) => {
      const [pos, neu, neg] = splits[i]!
      return [p.hook, { pos, neu, neg }]
    }),
  )
}

const w = (pos: number, neu: number, neg: number): Split => ({ pos, neu, neg })

// ── Brands ───────────────────────────────────────────────────────────────────────────────────

const CASA_VOSTRA: BrandHub = {
  // Instagram and TikTok add up to the 49.1k reach on the Overview; TikTok did not move.
  daily: series(INSIGHTS_BY_BRAND['casa-vostra'].posts, {
    totals: {
      ig: 41200,
      tt: 7900,
      web: 6800,
      maps: 9400,
      searches: 3100,
      calls: 142,
      directions: 388,
      bookings: 1120,
    },
    week: [0.7, 0.75, 0.85, 1, 1.25, 1.4, 1.1],
    // The hand-made carousel is the post people book after; offers in a photo barely move it.
    lift: { carousel: 1.5, reel: 0.9, photo: 0.3 },
    seed: 11,
  }),
  sentiment: {
    mentions: w(64, 18, 14),
    weeks: [
      w(38, 12, 6),
      w(41, 11, 7),
      w(40, 13, 8),
      w(44, 12, 7),
      w(43, 13, 9),
      w(47, 12, 6),
      w(46, 14, 7),
      w(50, 12, 6),
      w(52, 13, 7),
      w(55, 14, 6),
      w(54, 13, 6),
      w(60, 14, 7),
    ],
    praise: [
      { theme: 'Hand-made pasta', count: 64 },
      { theme: 'The ravioli', count: 41 },
      { theme: 'Friendly service', count: 22 },
      { theme: 'Wine list', count: 13 },
    ],
    complaints: [
      { theme: 'Wait for a table', count: 11 },
      { theme: 'Small portions', count: 6 },
      { theme: 'Lunch set price', count: 5 },
      { theme: 'Noise at dinner', count: 3 },
    ],
    quotes: [
      {
        text: 'Watched them fill the ravioli by hand and booked the same night. Worth it.',
        who: '@mei.eats.sg',
        where: 'comment',
        on: 'Ravioli, filled by hand.',
        tone: 'pos',
      },
      {
        text: 'Do you take walk-ins on a Sunday, or is it booking only?',
        who: '@joel.tan',
        where: 'comment',
        on: 'Pasta by hand in 30 seconds.',
        tone: 'neu',
      },
      {
        text: 'Food was lovely but we waited 40 minutes past our booking. Not great for a weeknight.',
        who: '@hungryinraffles',
        where: 'mention',
        on: 'A story at Raffles City',
        tone: 'neg',
      },
    ],
    posts: byPost('casa-vostra', [
      [22, 10, 2],
      [5, 3, 1],
      [49, 7, 2],
      [25, 5, 1],
      [6, 4, 4],
      [33, 6, 1],
      [17, 4, 1],
    ]),
  },
}

const TEMPER: BrandHub = {
  daily: series(INSIGHTS_BY_BRAND.temper.posts, {
    totals: {
      ig: 29600,
      tt: 5400,
      web: 3900,
      maps: 5200,
      searches: 1700,
      calls: 64,
      directions: 211,
      bookings: 520,
    },
    week: [0.45, 0.7, 0.8, 1, 1.35, 1.5, 0.9],
    // The room at night, in a reel, is what fills the bar: bottles in a photo do little.
    lift: { reel: 1.8, carousel: 1.1, photo: 0.3 },
    seed: 23,
  }),
  sentiment: {
    mentions: w(41, 12, 7),
    weeks: [
      w(22, 8, 4),
      w(24, 7, 4),
      w(23, 8, 5),
      w(26, 8, 4),
      w(27, 7, 4),
      w(28, 9, 5),
      w(29, 8, 3),
      w(31, 8, 4),
      w(30, 9, 4),
      w(33, 8, 4),
      w(34, 9, 3),
      w(36, 8, 4),
    ],
    praise: [
      { theme: 'Natural wine list', count: 38 },
      { theme: 'The room at night', count: 27 },
      { theme: 'Staff know their wine', count: 19 },
      { theme: 'Small plates', count: 9 },
    ],
    complaints: [
      { theme: 'Hard to get a table', count: 8 },
      { theme: 'Prices by the glass', count: 6 },
      { theme: 'Too dark to read the menu', count: 3 },
    ],
    quotes: [
      {
        text: 'The only bar where the staff ask what you like before they pour. The room at 9pm is perfect.',
        who: '@clarissa.drinks',
        where: 'mention',
        on: 'A post from Duxton Road',
        tone: 'pos',
      },
      {
        text: 'Is the lunch menu the same as dinner?',
        who: '@wb.lim',
        where: 'comment',
        on: 'Lunch is back, Tuesday to Friday.',
        tone: 'neu',
      },
      {
        text: 'Tried to book three Fridays in a row. Always full.',
        who: '@sgafterdark',
        where: 'comment',
        on: 'Lights down at Duxton.',
        tone: 'neg',
      },
    ],
    posts: byPost('temper', [
      [4, 3, 1],
      [31, 6, 4],
      [24, 5, 2],
      [5, 4, 1],
      [20, 5, 1],
      [17, 4, 1],
      [16, 5, 2],
    ]),
  },
}

const CARLITOS: BrandHub = {
  // TikTok carries more here than at the other two: it grew 5.8% this month.
  daily: series(INSIGHTS_BY_BRAND.carlitos.posts, {
    totals: {
      ig: 30400,
      tt: 8700,
      web: 4600,
      maps: 8800,
      searches: 2600,
      calls: 118,
      directions: 455,
      bookings: 780,
    },
    week: [0.6, 0.65, 0.7, 0.85, 1.3, 1.5, 1.35],
    // The molten croqueta reel sends people to Maps and to a table; notices only bring questions.
    lift: { reel: 1.7, carousel: 1.2, photo: 0.4 },
    seed: 37,
  }),
  sentiment: {
    mentions: w(58, 15, 11),
    weeks: [
      w(34, 10, 5),
      w(36, 9, 6),
      w(35, 11, 5),
      w(38, 10, 6),
      w(40, 11, 9),
      w(41, 10, 8),
      w(43, 12, 6),
      w(45, 11, 6),
      w(44, 12, 9),
      w(47, 11, 7),
      w(49, 12, 6),
      w(51, 12, 6),
    ],
    praise: [
      { theme: 'The croquetas', count: 52 },
      { theme: 'Good value', count: 30 },
      { theme: 'Friendly staff', count: 18 },
      { theme: 'Open late', count: 11 },
    ],
    complaints: [
      { theme: 'Weekend queue', count: 12 },
      { theme: 'Closed without notice', count: 7 },
      { theme: 'Confusing new hours', count: 4 },
      { theme: 'Bravas too spicy', count: 3 },
    ],
    quotes: [
      {
        text: 'Croquetas actually molten in the middle. Came back the next day with my sister.',
        who: '@eatwithkai',
        where: 'mention',
        on: 'A TikTok from Joo Chiat',
        tone: 'pos',
      },
      {
        text: 'Are you open on Sunday nights now?',
        who: '@priya.r',
        where: 'comment',
        on: 'New opening hours.',
        tone: 'neu',
      },
      {
        text: 'Came all the way to Joo Chiat and you were closed. Post it earlier next time.',
        who: '@marcus_eats',
        where: 'comment',
        on: 'Closed Monday for a private event.',
        tone: 'neg',
      },
    ],
    posts: byPost('carlitos', [
      [41, 7, 2],
      [2, 3, 7],
      [30, 6, 1],
      [26, 6, 2],
      [3, 6, 4],
      [21, 5, 1],
      [18, 4, 1],
    ]),
  },
}

export const HUB_BY_BRAND: Record<BrandId, BrandHub> = {
  'casa-vostra': CASA_VOSTRA,
  temper: TEMPER,
  carlitos: CARLITOS,
}
