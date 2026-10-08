/**
 * Every brand the demo can switch to: its identity, posts, calendar and media. Static, like
 * `demo.ts`, and invented apart from each brand's name and one-line description, which come
 * from `packages/db/src/seed.ts`.
 *
 * Casa Vostra is `demo.ts` unchanged. The other brands share its four-week skeleton (the day
 * numbers, today) and its city events and holidays, which are city-wide; "Our events",
 * "Shoots", stories, posts and ideas are their own.
 *
 * The switcher shows three of the group's seven brands, the ones this demo is built for.
 */

import {
  IDEAS,
  LIBRARY,
  MONTH,
  PHOTO,
  POSTS,
  WEEKS,
  type CalendarEvent,
  type FeedMark,
  type Format,
  type Post,
  type StoryMark,
  type Week,
} from './demo'

export type BrandId = 'casa-vostra' | 'temper' | 'carlitos'

export interface Brand {
  id: BrandId
  name: string
  initial: string
  handle: string
  /** A CSS custom property from `styles/tokens.css`; use it as `var(${brand.colour})`. */
  colour: `--brand-${BrandId}`
  /** The brand's own one-line description, from the seed. */
  line: string
}

export interface Idea {
  hook: string
  format: Exclude<Format, 'story'>
  meta: string
  postId?: string
}

export interface BrandContent {
  brand: Brand
  posts: Post[]
  weeks: Week[]
  ideas: Idea[]
  library: string[]
  month: { title: string; range: string }
  captions: Record<string, string>
}

// ── The shared month ──────────────────────────────────────────────────────────────────────────

const SHARED_LAYERS = new Set(['city', 'holiday'])

/** City events and holidays happen to every brand at once. */
const SHARED_EVENTS: CalendarEvent[][] = WEEKS.map((w) =>
  w.events.filter((e) => SHARED_LAYERS.has(e.layer)),
)

const open: StoryMark = { kind: 'open', draftsReady: false }
const openReady: StoryMark = { kind: 'open', draftsReady: true }
const idea: StoryMark = { kind: 'idea' }
const posted = (image: string, count: number): StoryMark => ({ kind: 'posted', image, count })

/**
 * One brand's month on Casa Vostra's skeleton. `stories` and `feed` are keyed by the day number
 * as the calendar prints it; a day with no story entry is an open slot. `ours` holds the brand's
 * own events and shoots, one list per week.
 */
function month(
  stories: Record<string, StoryMark>,
  feed: Record<string, FeedMark>,
  ours: CalendarEvent[][],
): Week[] {
  return WEEKS.map((w, i) => ({
    label: w.label,
    events: [...SHARED_EVENTS[i]!, ...(ours[i] ?? [])],
    days: w.days.map((d) => ({
      n: d.n,
      ...(d.past ? { past: true } : {}),
      ...(d.today ? { today: true } : {}),
      // From week 43 on, the team has drafts waiting, as on Casa Vostra's calendar.
      story: stories[d.n] ?? (i === 2 ? openReady : open),
      ...(feed[d.n] ? { feed: feed[d.n] } : {}),
    })),
  }))
}

const post = (postId: string): FeedMark => ({ kind: 'post', postId })
const ideaTile = (format: Exclude<Format, 'story'>, hook: string, why: string): FeedMark => ({
  kind: 'idea',
  format,
  hook,
  why,
})
/** An idea the tool suggests from the brand's insights, to fill an empty slot. */
const suggestion = (format: Exclude<Format, 'story'>, hook: string, why: string): FeedMark => ({
  kind: 'idea',
  format,
  hook,
  why,
  suggested: true,
})

// ── Casa Vostra: demo.ts, unchanged ─────────────────────────────────────────────────────────

const CASA_VOSTRA: BrandContent = {
  brand: {
    id: 'casa-vostra',
    name: 'Casa Vostra',
    initial: 'C',
    handle: '@casavostrasg',
    colour: '--brand-casa-vostra',
    line: 'Gourmet Italian cuisine at casual prices — pasta and pizza made from scratch, by hand, every day.',
  },
  posts: POSTS,
  weeks: WEEKS,
  ideas: IDEAS,
  library: LIBRARY,
  month: MONTH,
  captions: {
    crust:
      'The final touch for a crispy crust and a smoky finish 🔥 Find us at Raffles City. #casavostra #pizzasg #rafflescity',
    ravioli:
      'Ravioli, filled by hand this morning. Thursday lunch at Raffles City. #casavostra #pastasg',
    pasta: 'Pasta by hand, every morning, in the window at Raffles City. #casavostra #freshpasta',
    'five-pastas': 'Five pastas, one dough. Which one are you ordering? #casavostra #pastasg',
  },
}

// ── Temper ───────────────────────────────────────────────────────────────────────────────────

const T = {
  // The demo's original `dish.jpg` is Temper's own photo.
  dish: PHOTO.dish,
  pour: '/demo/temper/pour.jpg',
  glass: '/demo/temper/glass.jpg',
  room: '/demo/temper/room.jpg',
} as const

const TEMPER: BrandContent = {
  brand: {
    id: 'temper',
    name: 'Temper',
    initial: 'T',
    handle: '@temper.sg',
    colour: '--brand-temper',
    line: 'A social wine room, restaurant and lounge that thrives in the in-between.',
  },
  posts: [
    {
      id: 'temper-pour',
      format: 'reel',
      hook: 'The pour that starts the in-between.',
      images: [T.pour],
      duration: '0:12',
      stage: 'scheduled',
      slot: 'Thu 8 Oct, 19:00',
      slotShort: 'Thu, 19:00',
    },
    {
      id: 'temper-fire',
      format: 'reel',
      hook: 'Fire first, then wine.',
      images: [T.dish],
      duration: '0:26',
      stage: 'draft',
      slot: 'Wed 14 Oct, 18:30',
      slotShort: 'Wed, 18:30',
    },
    {
      id: 'temper-lights',
      format: 'reel',
      hook: 'Lights down at Duxton.',
      images: [T.room],
      duration: '0:19',
      stage: 'draft',
      slot: 'Wed 21 Oct, 20:00',
      slotShort: 'Wed, 20:00',
    },
    {
      id: 'temper-bottles',
      format: 'carousel',
      hook: "Six bottles we can't stop opening.",
      images: [T.glass, T.room, T.pour, T.dish],
      stage: 'draft',
      slot: 'Thu 29 Oct, 18:00',
      slotShort: 'Thu, 18:00',
    },
  ],
  weeks: month(
    {
      '5': posted(T.room, 2),
      '6': posted(T.glass, 1),
      '8': posted(T.pour, 3),
      '10': idea,
      '11': posted(T.dish, 2),
      '14': posted(T.dish, 2),
      '16': idea,
      '17': posted(T.glass, 1),
      '21': idea,
      '24': idea,
      '29': idea,
      '31': idea,
    },
    {
      '8': post('temper-pour'),
      '10': ideaTile('carousel', 'Grand Prix night: the late list.', 'F1 weekend'),
      '14': post('temper-fire'),
      '19': suggestion(
        'reel',
        'What the sommelier drinks on a Monday.',
        'Faces get 3× the saves of bottles',
      ),
      '21': post('temper-lights'),
      '24': ideaTile('reel', 'Natural wine in one sip.', 'Team idea'),
      '28': ideaTile(
        'carousel',
        'The darkest reds, for the masquerade.',
        'Masquerade night, Saturday',
      ),
      '29': post('temper-bottles'),
    },
    [
      [
        { layer: 'shoot', text: 'Shoot · Duxton', col: 2, span: 1 },
        { layer: 'ours', text: 'Sommelier takeover', col: 3, span: 1 },
      ],
      [
        { layer: 'shoot', text: 'Shoot · wood fire', col: 2, span: 1 },
        { layer: 'ours', text: 'Winemaker dinner', col: 5, span: 1 },
      ],
      [{ layer: 'ours', text: 'Vinyl & vino', col: 4, span: 1 }],
      [
        { layer: 'shoot', text: 'Shoot · cellar', col: 1, span: 1 },
        { layer: 'ours', text: 'Masquerade wine night', col: 6, span: 1 },
      ],
    ],
  ),
  ideas: [
    {
      hook: 'The pour that starts the in-between.',
      format: 'reel',
      meta: 'Edited, ready to post',
      postId: 'temper-pour',
    },
    {
      hook: "Six bottles we can't stop opening.",
      format: 'carousel',
      meta: 'Draft · 2 days ago',
      postId: 'temper-bottles',
    },
    {
      hook: 'Fire first, then wine.',
      format: 'reel',
      meta: 'Filmed, in editing',
      postId: 'temper-fire',
    },
    {
      hook: 'Lights down at Duxton.',
      format: 'reel',
      meta: 'Filming this week',
      postId: 'temper-lights',
    },
    {
      hook: 'What the sommelier drinks on a Monday.',
      format: 'reel',
      meta: 'Idea · needs a shoot',
    },
    { hook: 'Grand Prix night: the late list.', format: 'carousel', meta: 'Idea · F1 weekend' },
    { hook: 'Natural wine in one sip.', format: 'reel', meta: 'Idea · series' },
    {
      hook: 'The darkest reds, for the masquerade.',
      format: 'carousel',
      meta: 'Idea · Masquerade night',
    },
    { hook: 'Vinyl & vino, side B.', format: 'reel', meta: 'Idea · event recap' },
  ],
  library: [T.dish, T.pour, T.glass, T.room],
  month: MONTH,
  captions: {
    'temper-pour':
      'Not dinner yet, not quite a nightcap. The pour that starts the in-between. Duxton, from 5pm. #temper #winebarsg #duxton',
    'temper-fire':
      'Fire first, then wine. Ask the floor what to open with this one. #temper #woodfire #winebarsg',
    'temper-lights':
      'Lights down, records on, second bottle open. This is the hour we built the room for. #temper #duxton #winebarsg',
    'temper-bottles':
      "Six bottles we can't stop opening this month. Swipe, save, and come try them by the glass. #temper #naturalwine",
  },
}

// ── Carlitos ─────────────────────────────────────────────────────────────────────────────────

const K = {
  croquetas: '/demo/carlitos/croquetas.jpg',
  pintxos: '/demo/carlitos/pintxos.jpg',
  bravas: '/demo/carlitos/bravas.jpg',
  bombas: '/demo/carlitos/bombas.jpg',
  jamon: '/demo/carlitos/jamon.jpg',
} as const

const CARLITOS: BrandContent = {
  brand: {
    id: 'carlitos',
    name: 'Carlitos',
    initial: 'C',
    handle: '@carlitos.sg',
    colour: '--brand-carlitos',
    line: 'A neighbourhood tapas bar — a native ritual of Spain, brought to life in Singapore.',
  },
  posts: [
    {
      id: 'carlitos-croquetas',
      format: 'reel',
      hook: 'Crack one open. Molten.',
      images: [K.croquetas],
      duration: '0:14',
      stage: 'scheduled',
      slot: 'Thu 8 Oct, 18:00',
      slotShort: 'Thu, 18:00',
    },
    {
      id: 'carlitos-pintxos',
      format: 'reel',
      hook: 'Pintxos night, straight from the counter.',
      images: [K.pintxos],
      duration: '0:22',
      stage: 'draft',
      slot: 'Fri 16 Oct, 18:00',
      slotShort: 'Fri, 18:00',
    },
    {
      id: 'carlitos-bravas',
      format: 'reel',
      hook: 'Patatas bravas, done properly.',
      images: [K.bravas],
      duration: '0:17',
      stage: 'draft',
      slot: 'Tue 20 Oct, 18:00',
      slotShort: 'Tue, 18:00',
    },
    {
      id: 'carlitos-bites',
      format: 'carousel',
      hook: 'Four bites to start the night.',
      images: [K.bombas, K.jamon, K.croquetas, K.pintxos],
      stage: 'draft',
      slot: 'Fri 30 Oct, 18:00',
      slotShort: 'Fri, 18:00',
    },
  ],
  weeks: month(
    {
      '5': posted(K.pintxos, 2),
      '6': posted(K.jamon, 3),
      '8': posted(K.croquetas, 2),
      '9': idea,
      '11': idea,
      '13': posted(K.bravas, 1),
      '15': idea,
      '16': posted(K.pintxos, 2),
      '20': idea,
      '24': idea,
      '30': idea,
      '31': idea,
    },
    {
      '8': post('carlitos-croquetas'),
      '11': ideaTile('reel', 'Race night: pintxos and the big screen.', 'F1 race, Sunday'),
      '13': suggestion(
        'carousel',
        'How to order tapas like a regular.',
        'How-to carousels are saved most',
      ),
      '16': post('carlitos-pintxos'),
      '20': post('carlitos-bravas'),
      '21': ideaTile('reel', 'Slicing jamón, one breath at a time.', 'Jamón night, Friday'),
      '30': post('carlitos-bites'),
      '1': ideaTile('reel', 'Paella Sunday, from the pan.', 'Team idea'),
    },
    [
      [
        { layer: 'shoot', text: 'Shoot · Joo Chiat', col: 2, span: 1 },
        { layer: 'ours', text: 'Vermut hour', col: 3, span: 1 },
      ],
      [{ layer: 'ours', text: 'Sherry tasting', col: 4, span: 1 }],
      [
        { layer: 'shoot', text: 'Shoot · bravas', col: 1, span: 1 },
        { layer: 'ours', text: 'Jamón carving night', col: 5, span: 1 },
      ],
      [{ layer: 'ours', text: 'Flamenco Friday', col: 5, span: 1 }],
    ],
  ),
  ideas: [
    {
      hook: 'Crack one open. Molten.',
      format: 'reel',
      meta: 'Edited, ready to post',
      postId: 'carlitos-croquetas',
    },
    {
      hook: 'Four bites to start the night.',
      format: 'carousel',
      meta: 'Draft · today',
      postId: 'carlitos-bites',
    },
    {
      hook: 'Pintxos night, straight from the counter.',
      format: 'reel',
      meta: 'Filmed, in editing',
      postId: 'carlitos-pintxos',
    },
    {
      hook: 'Patatas bravas, done properly.',
      format: 'reel',
      meta: 'Filming this week',
      postId: 'carlitos-bravas',
    },
    { hook: 'Vermut hour on Joo Chiat Road.', format: 'reel', meta: 'Idea · needs a shoot' },
    { hook: 'How to order tapas like a regular.', format: 'carousel', meta: 'Idea · explainer' },
    { hook: 'Slicing jamón, one breath at a time.', format: 'reel', meta: 'Idea · event' },
    { hook: 'Paella Sunday, from the pan.', format: 'reel', meta: 'Idea · weekend' },
    { hook: 'Sherry, three ways.', format: 'carousel', meta: 'Idea · tasting' },
  ],
  library: [K.croquetas, K.pintxos, K.bravas, K.bombas, K.jamon],
  month: MONTH,
  captions: {
    'carlitos-croquetas':
      'Crisp outside, molten inside. Our croquetas de jamón, made by hand every afternoon. ¡Vamos! #carlitossg #tapas #joochiat',
    'carlitos-pintxos':
      'Friday is pintxos night. Pick from the counter, pay by the stick. #carlitossg #pintxos #joochiat',
    'carlitos-bravas':
      'Crisp potatoes, smoky brava, cold alioli. The tapa every table orders twice. #carlitossg #patatasbravas',
    'carlitos-bites':
      'Four bites to start the night. Which one do you order first? #carlitossg #tapasbar',
  },
}

// ── The registry ─────────────────────────────────────────────────────────────────────────────

/** In switcher order. The first is the default. */
export const BRAND_CONTENT: BrandContent[] = [CASA_VOSTRA, TEMPER, CARLITOS]

export const BRANDS: Brand[] = BRAND_CONTENT.map((c) => c.brand)

export const DEFAULT_BRAND_ID: BrandId = 'casa-vostra'

export function contentFor(id: BrandId): BrandContent {
  return BRAND_CONTENT.find((c) => c.brand.id === id) ?? CASA_VOSTRA
}
