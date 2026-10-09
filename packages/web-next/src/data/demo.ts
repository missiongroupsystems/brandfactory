/**
 * The demo's data: one brand, four weeks, as the Claude Design canvas draws them. Static on
 * purpose — the demo has no server — and transcribed from the canvas's `Main.dc.html`.
 *
 * Today is Tuesday 6 October 2026.
 */

export type Format = 'reel' | 'carousel' | 'story'
/**
 * A post's life: drafted, scheduled, out. Brandwatch adds a step for someone's OK; v1 has no
 * approval, so it has no such stage. `failed` means it was due and did not go out; it needs someone
 * now, so it is never quiet.
 */
export type Stage = 'draft' | 'scheduled' | 'posted' | 'failed'
export type LayerKey = 'city' | 'holiday' | 'ours' | 'shoot'

export const PHOTO = {
  crust: '/demo/crust.jpg',
  pasta: '/demo/pasta.jpg',
  dish: '/demo/dish.jpg',
  tagliatelle: '/demo/casa-vostra/tagliatelle.jpg',
  ravioli: '/demo/casa-vostra/ravioli.jpg',
} as const

export const BRAND = {
  name: 'Casa Vostra',
  initial: 'C',
  handle: '@casavostrasg',
  user: 'NA',
} as const

/** A post that has media, so it can be published. */
export interface Post {
  id: string
  format: Format
  hook: string
  images: string[]
  /** 0:24 for a video; absent for photos. */
  duration?: string
  stage: Stage
  /** The calendar slot, already in words: the demo never computes a date. */
  slot: string
  slotShort: string
  /** Why it did not go out, in plain words and what fixes it. Only on a failed post. */
  error?: string
  /** The account it failed on, which the fix reconnects. */
  failedOn?: 'ig' | 'tt' | 'yt' | 'li' | 'fb'
  /** The accounts it goes to, once someone picked them in the composer. */
  channels?: Array<'ig' | 'tt' | 'yt' | 'li' | 'fb'>
  /** The idea tile it was planned from, kept so taking it back to an idea restores that tile. */
  fromIdea?: { why: string; suggested?: boolean }
}

export const POSTS: Post[] = [
  {
    id: 'crust',
    format: 'reel',
    hook: 'The final touch. Watch the crust.',
    images: [PHOTO.crust],
    duration: '0:24',
    stage: 'scheduled',
    slot: 'Thu 8 Oct, 18:00',
    slotShort: 'Thu, 18:00',
  },
  {
    id: 'ravioli',
    format: 'carousel',
    hook: 'Ravioli, filled by hand.',
    images: [PHOTO.ravioli, PHOTO.tagliatelle],
    stage: 'scheduled',
    slot: 'Thu 8 Oct, 12:00',
    slotShort: 'Thu, 12:00',
  },
  {
    id: 'pasta',
    format: 'reel',
    hook: 'Pasta by hand in 30 seconds.',
    images: [PHOTO.pasta],
    duration: '0:30',
    stage: 'draft',
    slot: 'Tue 13 Oct, 12:00',
    slotShort: 'Tue, 12:00',
  },
  {
    id: 'wine-night',
    format: 'carousel',
    hook: 'Wine pairing night, this Saturday.',
    images: ['/demo/casa-vostra/wine-night.jpg'],
    stage: 'posted',
    slot: 'Mon 5 Oct, 19:30',
    slotShort: 'Mon, 19:30',
    channels: ['ig', 'fb'],
  },
  {
    id: 'margherita',
    format: 'reel',
    hook: 'Margherita, oven to table in 90 seconds.',
    images: ['/demo/pins/cv-p-12.jpg'],
    duration: '0:18',
    stage: 'posted',
    slot: 'Tue 6 Oct, 12:00',
    slotShort: 'Tue, 12:00',
    channels: ['ig', 'tt'],
  },
  {
    id: 'five-pastas',
    format: 'carousel',
    hook: 'Five pastas, one dough.',
    images: [PHOTO.tagliatelle, PHOTO.ravioli, PHOTO.pasta],
    stage: 'draft',
    slot: 'Fri 30 Oct, 18:00',
    slotShort: 'Fri, 18:00',
  },
]

/** What a day shows in its story row. */
export type StoryMark =
  | { kind: 'posted'; image: string; count: number }
  /** A story planned on the shoot brief: the post carries its stage. */
  | { kind: 'post'; postId: string }
  | { kind: 'idea' }
  | { kind: 'open'; draftsReady: boolean }

/** What a day shows in its feed slot. */
export type FeedMark =
  | { kind: 'post'; postId: string }
  | {
      kind: 'idea'
      format: Exclude<Format, 'story'>
      hook: string
      /** One line on why it is on this day: the event it is for, or the insight behind it. */
      why: string
      /** The tool suggested it from the insights; absent for the team's own idea. */
      suggested?: boolean
    }

export interface Day {
  n: string
  /**
   * A day of the month before or after, in the month grid only to fill out a week. It shows its
   * number, dimmed, and nothing else.
   */
  outside?: boolean
  past?: boolean
  today?: boolean
  story: StoryMark
  /** Usually one post; a busy day can hold several, in time order. Read it with `feedsOf`. */
  feed?: FeedMark | FeedMark[]
}

/** A day's feed items as a list, whether it holds none, one or several. */
export function feedsOf(day: Day): FeedMark[] {
  return Array.isArray(day.feed) ? day.feed : day.feed ? [day.feed] : []
}

export interface CalendarEvent {
  layer: LayerKey
  text: string
  /** 1 = Monday. */
  col: number
  span: number
}

export interface Week {
  label: string
  days: Day[]
  events: CalendarEvent[]
}

const open: StoryMark = { kind: 'open', draftsReady: false }
const openReady: StoryMark = { kind: 'open', draftsReady: true }
const idea: StoryMark = { kind: 'idea' }

export const MONTH = { title: 'October', range: '5 OCT – 1 NOV · WK 41–44' }

export const WEEKS: Week[] = [
  {
    label: 'WK 41',
    events: [
      { layer: 'city', text: 'F1 Singapore Grand Prix', col: 5, span: 3 },
      { layer: 'shoot', text: 'Shoot · Raffles City', col: 3, span: 1 },
      { layer: 'city', text: 'TOKEN2049', col: 2, span: 3 },
    ],
    days: [
      {
        n: '5',
        past: true,
        story: { kind: 'posted', image: PHOTO.ravioli, count: 4 },
        feed: { kind: 'post', postId: 'wine-night' },
      },
      {
        n: '6',
        today: true,
        story: { kind: 'posted', image: PHOTO.pasta, count: 2 },
        feed: { kind: 'post', postId: 'margherita' },
      },
      { n: '7', story: idea },
      {
        n: '8',
        story: { kind: 'posted', image: PHOTO.crust, count: 3 },
        // The rare busy day: two posts, so the calendar shows its stack.
        feed: [
          { kind: 'post', postId: 'ravioli' },
          { kind: 'post', postId: 'crust' },
        ],
      },
      {
        n: '9',
        story: idea,
        feed: {
          kind: 'idea',
          format: 'reel',
          hook: 'Pizza before the lights go out.',
          why: 'F1 weekend',
        },
      },
      { n: '10', story: idea },
      { n: '11', story: open },
    ],
  },
  {
    label: 'WK 42',
    events: [
      { layer: 'ours', text: 'Private dinner · 40', col: 4, span: 1 },
      { layer: 'city', text: 'BIGBANG world tour', col: 5, span: 3 },
    ],
    days: [
      { n: '12', story: open },
      {
        n: '13',
        story: { kind: 'posted', image: PHOTO.pasta, count: 2 },
        feed: { kind: 'post', postId: 'pasta' },
      },
      { n: '14', story: idea },
      { n: '15', story: open },
      {
        n: '16',
        story: idea,
        feed: {
          kind: 'idea',
          format: 'reel',
          hook: 'Dinner before the concert, in 12 minutes.',
          why: 'BIGBANG at the Stadium',
        },
      },
      { n: '17', story: open },
      { n: '18', story: open },
    ],
  },
  {
    label: 'WK 43',
    events: [
      { layer: 'shoot', text: 'Shoot · pasta', col: 3, span: 1 },
      { layer: 'ours', text: 'Wine pairing night', col: 6, span: 1 },
      { layer: 'city', text: 'Half Marathon', col: 7, span: 1 },
    ],
    days: [
      { n: '19', story: openReady },
      {
        n: '20',
        story: openReady,
        feed: {
          kind: 'idea',
          format: 'reel',
          hook: 'Watch the dough become tagliatelle.',
          why: 'Hand-made reels hold viewers 2× longer',
          suggested: true,
        },
      },
      { n: '21', story: openReady },
      { n: '22', story: openReady },
      {
        n: '23',
        story: openReady,
        feed: {
          kind: 'idea',
          format: 'reel',
          hook: 'Blindfold pizza: the rematch.',
          why: 'Team idea',
        },
      },
      {
        n: '24',
        story: openReady,
        feed: {
          kind: 'idea',
          format: 'reel',
          hook: "Carb up before tomorrow's race.",
          why: 'Half Marathon, Sunday',
        },
      },
      { n: '25', story: openReady },
    ],
  },
  {
    label: 'WK 44',
    events: [{ layer: 'holiday', text: 'Halloween', col: 6, span: 1 }],
    days: [
      { n: '26', story: open },
      { n: '27', story: open },
      {
        n: '28',
        story: open,
        feed: {
          kind: 'idea',
          format: 'carousel',
          hook: 'The pizza that stares back.',
          why: 'Halloween, Saturday',
        },
      },
      { n: '29', story: open },
      { n: '30', story: idea, feed: { kind: 'post', postId: 'five-pastas' } },
      { n: '31', story: idea },
      { n: '1', story: open },
    ],
  },
]

export const LAYERS: Array<{ key: LayerKey; name: string }> = [
  { key: 'city', name: 'City events' },
  { key: 'holiday', name: 'Holidays' },
  { key: 'ours', name: 'Our events' },
  { key: 'shoot', name: 'Shoots' },
]

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  city: true,
  holiday: true,
  ours: true,
  shoot: false,
}

/** The ideas a new post can start from, in the composer. */
export const IDEAS: Array<{
  hook: string
  format: Exclude<Format, 'story'>
  meta: string
  postId?: string
}> = [
  {
    hook: 'The final touch. Watch the crust.',
    format: 'reel',
    meta: 'Edited, ready to post',
    postId: 'crust',
  },
  {
    hook: 'Five pastas, one dough.',
    format: 'carousel',
    meta: 'Draft · 2 days ago',
    postId: 'five-pastas',
  },
  {
    hook: 'Pasta by hand in 30 seconds.',
    format: 'reel',
    meta: 'Filmed, in editing',
    postId: 'pasta',
  },
  { hook: "Carb up before tomorrow's race.", format: 'reel', meta: 'Idea · Half Marathon' },
  { hook: 'Blindfold pizza: the rematch.', format: 'reel', meta: 'Idea · needs a shoot' },
  { hook: 'The pizza that stares back.', format: 'carousel', meta: 'Idea · Halloween' },
]

/** The media library shown when starting from scratch. */
export const LIBRARY: string[] = [PHOTO.crust, PHOTO.pasta, PHOTO.tagliatelle, PHOTO.ravioli]
