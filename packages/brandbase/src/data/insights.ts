/**
 * The insights page's data, one set per brand, for the last 30 days: four headline numbers,
 * three stories with a big number, one sentence and one chart, the best hour, the month's posts
 * and the creators who posted about the brand. Static placeholders,
 * plausible for a Singapore restaurant and different per brand. The first story of each brand
 * is the insight behind the suggested tile on that brand's calendar, so the loop reads true.
 */

import type { BrandId } from './brands'
import { PHOTO } from './demo'
import type { IdeaCard, Pillar } from './ideas'

const PIN = (id: string) => `/demo/pins/${id}.jpg`

/** The chart beside a story. */
export type StoryChart =
  | {
      kind: 'compare'
      unit: string
      /** "%" when the values are a share; counts print as 8.9k. */
      suffix?: string
      rows: Array<{ label: string; value: number }>
    }
  | {
      kind: 'trend'
      /** Twelve weekly points each, oldest first, in thousands. */
      series: Array<{ label: string; points: number[]; followers: number; delta: number }>
      note?: string
    }
  | { kind: 'days'; values: number[]; best: number[] }

export interface Story {
  id: string
  /** The big green number: "2×", "+0.3%", "6–8pm". */
  figure: string
  /** Under the number, in mono: "LONGER WATCHED". */
  label: string
  /** One sentence: what works, or where we underperform. */
  text: string
  chart: StoryChart
  /** The idea "Turn into idea" creates. Absent on the best-hour row. */
  idea?: Omit<IdeaCard, 'id' | 'source' | 'status' | 'image'>
}

export interface PostStat {
  image: string
  hook: string
  format: 'reel' | 'carousel' | 'photo'
  pillar: Pillar
  /** As printed: "16 SEP". */
  date: string
  reach: number
  saves: number
  /** Likes, comments, shares and saves over reach, in percent. */
  engagement: number
}

/** A headline number at the top of the page, with the last 12 weeks behind it. */
export interface Kpi {
  label: string
  /** As printed: "48.2k", "6.1%". */
  value: string
  /** Change against the 30 days before, in percent. */
  delta: number
  /** Twelve weekly points, oldest first. */
  points: number[]
}

/** A creator who posted about the brand in the period, and what their posts earned. */
export interface Creator {
  name: string
  handle: string
  platform: 'ig' | 'tt'
  followers: number
  posts: number
  views: number
  /** Likes, comments, shares and saves over views, in percent. */
  engagement: number
  /** Their best post in the period. */
  top: { image: string; hook: string; views: number }
}

export interface BrandInsights {
  period: string
  /** One plain sentence under the title. */
  line: string
  kpis: Kpi[]
  stories: Story[]
  /** How busy each part of the day is, 0–1: morning, lunch, afternoon, evening, late. */
  hours: number[]
  posts: PostStat[]
  creators: Creator[]
}

const sharper = (a: string, b: string, c: string) => [
  { text: a, tag: 'NUMBER' },
  { text: b, tag: 'TIME' },
  { text: c, tag: 'SOUND' },
]

const CASA_VOSTRA: BrandInsights = {
  period: '7 SEP – 6 OCT',
  line: 'What worked at Casa Vostra this month, and where it fell short.',
  kpis: [
    {
      label: 'Reach',
      value: '49.1k',
      delta: 12.4,
      points: [8100, 8400, 9000, 8800, 9600, 10200, 10000, 10900, 11400, 11200, 12100, 12600],
    },
    {
      label: 'Engagement rate',
      value: '6.4%',
      delta: 0.8,
      points: [5.2, 5.4, 5.3, 5.6, 5.5, 5.8, 5.9, 5.7, 6.0, 6.2, 6.1, 6.4],
    },
    {
      label: 'New followers',
      value: '+382',
      delta: 2.1,
      points: [70, 74, 69, 81, 77, 85, 88, 84, 90, 93, 95, 104],
    },
    {
      label: 'Saves',
      value: '1,485',
      delta: 18.0,
      points: [210, 230, 240, 236, 262, 280, 300, 310, 322, 340, 356, 372],
    },
  ],
  stories: [
    {
      id: 'cv-h-handmade',
      figure: '2×',
      label: 'LONGER WATCHED',
      text: 'Hand-made reels hold viewers 2× longer.',
      chart: {
        kind: 'compare',
        unit: 'watched to the end · reels',
        suffix: '%',
        rows: [
          { label: 'Hand-made', value: 48 },
          { label: 'Plated', value: 31 },
          { label: 'Events', value: 23 },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'Watch the dough become tagliatelle.',
        angle: 'Chef walks the dough from flour to pass. No talking, just sound.',
        feature: 'Tagliatelle · Chef Marco',
        referenceId: 'cv-r-sfoglina',
        shots: [
          'Flour and eggs, overhead',
          'The sheet through the roller, hands only',
          'The cut, then the pass',
        ],
        sharper: sharper(
          '48 hours for one plate of tagliatelle.',
          'Flour on Monday. Your plate on Wednesday.',
          'This is what 48 hours sounds like.',
        ),
      },
    },
    {
      id: 'cv-h-chef',
      figure: '1.8×',
      label: 'FURTHER REACH',
      text: 'A chef in frame reaches 1.8× further than the plate alone.',
      chart: {
        kind: 'compare',
        unit: 'reach per post',
        rows: [
          { label: 'Chef in frame', value: 8900 },
          { label: 'Plate only', value: 4900 },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Chef',
        hook: 'Meet the hands behind the ravioli.',
        angle: 'Chef Marco, to camera for once: one question, one answer, then back to the fold.',
        feature: 'Chef Marco',
        referenceId: 'cv-p-3',
        shots: ['Marco looks up', 'One question, one answer', 'Back to the fold'],
        sharper: sharper(
          'He has folded 400 ravioli today. Ask him anything.',
          'The hands you see every day. The face you do not.',
          'One question for the man behind the pasta.',
        ),
      },
    },
    {
      id: 'cv-h-tiktok',
      figure: '+0.3%',
      label: 'TIKTOK · 30 DAYS',
      text: 'TikTok is flat for three months. Instagram carries the month.',
      chart: {
        kind: 'trend',
        series: [
          {
            label: 'Instagram',
            followers: 18420,
            delta: 2.1,
            points: [15.9, 16.1, 16.4, 16.6, 16.9, 17.1, 17.4, 17.6, 17.9, 18.0, 18.2, 18.4],
          },
          {
            label: 'TikTok',
            followers: 2150,
            delta: 0.3,
            points: [2.12, 2.12, 2.13, 2.12, 2.13, 2.13, 2.14, 2.13, 2.14, 2.14, 2.15, 2.15],
          },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'Sound on: the pasta cut, in 9 seconds.',
        angle: 'The top craft reel, recut to 9 seconds for TikTok with the board sound up front.',
        feature: 'Tagliatelle · Chef Marco',
        referenceId: 'cv-r-sfoglina',
        shots: ['The board, sound first', 'The cut', 'The end card'],
        sharper: sharper(
          'Nine seconds. Sound on.',
          'The cut, with nothing else.',
          'Shorter. Louder. Same dough.',
        ),
      },
    },
    {
      id: 'cv-h-time',
      figure: '6–8pm',
      label: 'THURSDAY AND FRIDAY',
      text: 'Your people look late in the week, early in the evening.',
      chart: { kind: 'days', values: [0.3, 0.35, 0.4, 0.9, 1, 0.6, 0.35], best: [3, 4] },
    },
  ],
  hours: [0.15, 0.45, 0.3, 1, 0.55],
  posts: [
    {
      image: PHOTO.crust,
      hook: 'Guess the ingredient.',
      format: 'reel',
      pillar: 'Fun',
      date: '9 SEP',
      reach: 8400,
      saves: 190,
      engagement: 6.4,
    },
    {
      image: '/demo/casa-vostra/wine-night.jpg',
      hook: 'Wine pairing night.',
      format: 'photo',
      pillar: 'Occasion',
      date: '11 SEP',
      reach: 2800,
      saves: 31,
      engagement: 4.2,
    },
    {
      image: PHOTO.ravioli,
      hook: 'Ravioli, filled by hand.',
      format: 'carousel',
      pillar: 'Craft',
      date: '16 SEP',
      reach: 11200,
      saves: 480,
      engagement: 10.2,
    },
    {
      image: PIN('cv-p-3'),
      hook: 'Hands only. Sound on.',
      format: 'reel',
      pillar: 'Craft',
      date: '18 SEP',
      reach: 7900,
      saves: 260,
      engagement: 8.4,
    },
    {
      image: PHOTO.tagliatelle,
      hook: 'Lunch set, now $24.',
      format: 'photo',
      pillar: 'Occasion',
      date: '23 SEP',
      reach: 3100,
      saves: 44,
      engagement: 4.8,
    },
    {
      image: PIN('cv-p-4'),
      hook: 'The final touch. Watch the crust.',
      format: 'reel',
      pillar: 'Craft',
      date: '27 SEP',
      reach: 9600,
      saves: 310,
      engagement: 8.2,
    },
    {
      image: PHOTO.pasta,
      hook: 'Pasta by hand in 30 seconds.',
      format: 'reel',
      pillar: 'Craft',
      date: '2 OCT',
      reach: 6100,
      saves: 170,
      engagement: 7.4,
    },
  ],
  creators: [
    {
      name: 'Daniel Ang',
      handle: '@danielfooddiary',
      platform: 'ig',
      followers: 168000,
      posts: 2,
      views: 41200,
      engagement: 7.8,
      top: {
        image: PHOTO.ravioli,
        hook: 'The ravioli everyone in Raffles City is queueing for.',
        views: 28600,
      },
    },
    {
      name: 'Mei Lin',
      handle: '@eatwithmeilin',
      platform: 'tt',
      followers: 52000,
      posts: 3,
      views: 36800,
      engagement: 9.4,
      top: { image: PIN('cv-p-5'), hook: 'This cheese pull should be illegal.', views: 21900 },
    },
    {
      name: 'Aaron Tan',
      handle: '@sgfoodhunt',
      platform: 'ig',
      followers: 94000,
      posts: 1,
      views: 18300,
      engagement: 4.1,
      top: { image: PHOTO.crust, hook: 'Best crust in town? I tried it.', views: 18300 },
    },
    {
      name: 'Priya Nair',
      handle: '@priyaeatssg',
      platform: 'tt',
      followers: 21000,
      posts: 2,
      views: 12900,
      engagement: 11.2,
      top: {
        image: PHOTO.tagliatelle,
        hook: 'Watching them make tagliatelle by hand.',
        views: 8400,
      },
    },
    {
      name: 'Josh Lim',
      handle: '@joshlimeats',
      platform: 'ig',
      followers: 33000,
      posts: 1,
      views: 6100,
      engagement: 3.2,
      top: {
        image: '/demo/casa-vostra/wine-night.jpg',
        hook: 'Wine night at Casa Vostra.',
        views: 6100,
      },
    },
  ],
}

const T = {
  dish: PHOTO.dish,
  pour: '/demo/temper/pour.jpg',
  glass: '/demo/temper/glass.jpg',
  room: '/demo/temper/room.jpg',
} as const

const TEMPER: BrandInsights = {
  period: '7 SEP – 6 OCT',
  line: 'What worked at Temper this month, and where it fell short.',
  kpis: [
    {
      label: 'Reach',
      value: '35.0k',
      delta: 9.1,
      points: [6000, 6200, 6100, 6600, 6900, 7000, 7400, 7300, 7900, 8100, 8400, 8800],
    },
    {
      label: 'Engagement rate',
      value: '5.2%',
      delta: 1.1,
      points: [3.9, 4.0, 4.2, 4.1, 4.4, 4.5, 4.4, 4.7, 4.8, 5.0, 4.9, 5.2],
    },
    {
      label: 'New followers',
      value: '+324',
      delta: 3.4,
      points: [52, 58, 55, 63, 66, 68, 72, 70, 76, 79, 81, 86],
    },
    {
      label: 'Bookings from social',
      value: '46',
      delta: 12.0,
      points: [6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    },
  ],
  stories: [
    {
      id: 'tp-h-faces',
      figure: '3×',
      label: 'MORE SAVES',
      text: 'Faces get 3× the saves of bottles.',
      chart: {
        kind: 'compare',
        unit: 'saves per post',
        rows: [
          { label: 'Faces', value: 186 },
          { label: 'Bottles', value: 62 },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Chef',
        hook: 'What the sommelier drinks on a Monday.',
        angle: 'One bottle, one reason, the room empty behind her. Personality, not a lecture.',
        feature: 'Sommelier Lena',
        referenceId: 'tp-r-wineroom',
        shots: ['Lena at the counter, room empty', 'The bottle, one line', 'The first sip'],
        sharper: sharper(
          'Her Monday bottle is not on the list.',
          'Monday, 10pm, one glass. Hers.',
          'The sommelier has a day off. This is what she opens.',
        ),
      },
    },
    {
      id: 'tp-h-night',
      figure: '2.6×',
      label: 'FURTHER REACH',
      text: 'Room-at-night reels reach 2.6× daytime photos.',
      chart: {
        kind: 'compare',
        unit: 'reach per post',
        rows: [
          { label: 'Room at night', value: 7300 },
          { label: 'Bottle shots', value: 4100 },
          { label: 'Daytime', value: 2800 },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Vibe',
        hook: 'Last seating. Lights down.',
        angle: 'One slow push from the door to the counter at 10:30pm. Records on, no voice.',
        feature: 'The room',
        referenceId: 'tp-r-brutal',
        shots: ['The door at 10:30', 'The push to the counter', 'The record'],
        sharper: sharper(
          'This is the hour we built the room for.',
          'Last seating left. Counter open.',
          'Lights down at Duxton.',
        ),
      },
    },
    {
      id: 'tp-h-tiktok',
      figure: '+0.1%',
      label: 'TIKTOK · 30 DAYS',
      text: 'TikTok is not growing. Instagram is, and so are the bookings.',
      chart: {
        kind: 'trend',
        series: [
          {
            label: 'Instagram',
            followers: 9840,
            delta: 3.4,
            points: [8.1, 8.3, 8.5, 8.6, 8.8, 9.0, 9.2, 9.3, 9.5, 9.6, 9.7, 9.8],
          },
          {
            label: 'TikTok',
            followers: 1120,
            delta: 0.1,
            points: [1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1],
          },
        ],
        note: '46 bookings from social · +12%',
      },
      idea: {
        format: 'reel',
        pillar: 'Vibe',
        hook: 'The in-between, in 9 seconds.',
        angle: 'The top room reel, recut to 9 seconds for TikTok, the record as the only sound.',
        feature: 'The room · 5pm',
        referenceId: 'tp-r-brutal',
        shots: ['5pm, empty', '6pm, first glasses', '7pm, full'],
        sharper: sharper(
          'Nine seconds of the in-between.',
          'Come at 5. Stay for the 7.',
          'Records on. Nothing else.',
        ),
      },
    },
    {
      id: 'tp-h-time',
      figure: '5–7pm',
      label: 'WEDNESDAY AND THURSDAY',
      text: 'You post at 8pm. Your people look at 5.',
      chart: { kind: 'days', values: [0.3, 0.45, 0.9, 1, 0.75, 0.5, 0.25], best: [2, 3] },
    },
  ],
  hours: [0.1, 0.2, 0.55, 1, 0.7],
  posts: [
    {
      image: T.glass,
      hook: 'New on the list this week.',
      format: 'photo',
      pillar: 'Craft',
      date: '8 SEP',
      reach: 1900,
      saves: 18,
      engagement: 3.9,
    },
    {
      image: T.room,
      hook: 'Lights down at Duxton.',
      format: 'reel',
      pillar: 'Vibe',
      date: '12 SEP',
      reach: 8400,
      saves: 260,
      engagement: 8.0,
    },
    {
      image: PIN('tp-p-5'),
      hook: 'Three bottles, three words.',
      format: 'carousel',
      pillar: 'Chef',
      date: '15 SEP',
      reach: 5200,
      saves: 210,
      engagement: 9.8,
    },
    {
      image: T.dish,
      hook: 'Lunch is back, Tuesday to Friday.',
      format: 'photo',
      pillar: 'Occasion',
      date: '19 SEP',
      reach: 2200,
      saves: 26,
      engagement: 4.3,
    },
    {
      image: T.pour,
      hook: 'The pour that starts the in-between.',
      format: 'reel',
      pillar: 'Craft',
      date: '24 SEP',
      reach: 6900,
      saves: 190,
      engagement: 7.3,
    },
    {
      image: PIN('tp-p-1'),
      hook: 'One lamp on.',
      format: 'carousel',
      pillar: 'Vibe',
      date: '29 SEP',
      reach: 4600,
      saves: 150,
      engagement: 8.3,
    },
    {
      image: PIN('tp-p-3'),
      hook: 'Backlit pour.',
      format: 'reel',
      pillar: 'Craft',
      date: '3 OCT',
      reach: 5800,
      saves: 160,
      engagement: 7.3,
    },
  ],
  creators: [
    {
      name: 'Clara Goh',
      handle: '@winewithclara',
      platform: 'ig',
      followers: 41000,
      posts: 2,
      views: 22400,
      engagement: 8.6,
      top: { image: T.glass, hook: 'The natural wine bar I keep coming back to.', views: 15800 },
    },
    {
      name: 'Marcus Teo',
      handle: '@marcusdrinks',
      platform: 'tt',
      followers: 76000,
      posts: 1,
      views: 19700,
      engagement: 5.3,
      top: { image: T.room, hook: 'Duxton after dark.', views: 19700 },
    },
    {
      name: 'Hana Sato',
      handle: '@hana.sips',
      platform: 'ig',
      followers: 18000,
      posts: 3,
      views: 11200,
      engagement: 10.4,
      top: { image: T.pour, hook: 'Three bottles under $90.', views: 5100 },
    },
    {
      name: 'Ben Koh',
      handle: '@bendinessg',
      platform: 'ig',
      followers: 58000,
      posts: 1,
      views: 7400,
      engagement: 2.9,
      top: { image: T.dish, hook: 'Lunch at a wine bar? Yes.', views: 7400 },
    },
  ],
}

const K = {
  croquetas: '/demo/carlitos/croquetas.jpg',
  pintxos: '/demo/carlitos/pintxos.jpg',
  bravas: '/demo/carlitos/bravas.jpg',
  bombas: '/demo/carlitos/bombas.jpg',
  jamon: '/demo/carlitos/jamon.jpg',
} as const

const CARLITOS: BrandInsights = {
  period: '7 SEP – 6 OCT',
  line: 'What worked at Carlitos this month, and where it fell short.',
  kpis: [
    {
      label: 'Reach',
      value: '39.1k',
      delta: 7.6,
      points: [7200, 7400, 7300, 7900, 8200, 8100, 8600, 8900, 9100, 9000, 9500, 9800],
    },
    {
      label: 'Engagement rate',
      value: '5.9%',
      delta: 0.6,
      points: [5.0, 5.1, 5.3, 5.2, 5.4, 5.3, 5.6, 5.5, 5.7, 5.8, 5.8, 5.9],
    },
    {
      label: 'New followers',
      value: '+438',
      delta: 4.2,
      points: [62, 66, 70, 75, 79, 84, 88, 93, 97, 102, 108, 116],
    },
    {
      label: 'Shares',
      value: '982',
      delta: 22.5,
      points: [140, 150, 160, 172, 180, 196, 205, 220, 232, 240, 256, 270],
    },
  ],
  stories: [
    {
      id: 'ca-h-howto',
      figure: '2.1×',
      label: 'MORE SAVES',
      text: 'How-to carousels are saved most.',
      chart: {
        kind: 'compare',
        unit: 'saves per post',
        rows: [
          { label: 'How-to carousel', value: 290 },
          { label: 'Reel', value: 140 },
          { label: 'Photo', value: 40 },
        ],
      },
      idea: {
        format: 'carousel',
        pillar: 'Fun',
        hook: 'How to order tapas like a regular.',
        angle: 'Five slides, five rules, from "never one plate" to "ask what Carlos is eating".',
        feature: 'The counter',
        referenceId: 'ca-r-sevilla',
        shots: ['Rule one, on the counter', 'Rule three, the plates', 'Rule five, Carlos'],
        sharper: sharper(
          'Rule one: never order one plate.',
          'Five rules the regulars will not tell you.',
          'Order like you have been here before.',
        ),
      },
    },
    {
      id: 'ca-h-value',
      figure: '2.4×',
      label: 'MORE SHARES',
      text: 'Value posts get shared 2.4× more.',
      chart: {
        kind: 'compare',
        unit: 'shares per post',
        rows: [
          { label: 'Value', value: 168 },
          { label: 'Craft', value: 70 },
          { label: 'Vibe', value: 64 },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Value',
        hook: "The regular's order, in 15 seconds.",
        angle: 'One regular, one order, called out fast at the counter. Cut to the plates landing.',
        feature: 'A regular · the counter',
        referenceId: 'ca-p-6',
        shots: ['The regular sits', 'The order, fast', 'The plates land'],
        sharper: sharper(
          'Fifteen seconds to order. Thirty years of practice.',
          'He did not look at the menu.',
          'This is what a regular sounds like.',
        ),
      },
    },
    {
      id: 'ca-h-tiktok',
      figure: '+5.8%',
      label: 'TIKTOK · 30 DAYS',
      text: 'TikTok grew 5.8% this month. Counter reels carry it.',
      chart: {
        kind: 'trend',
        series: [
          {
            label: 'TikTok',
            followers: 4320,
            delta: 5.8,
            points: [3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0, 4.1, 4.3],
          },
          {
            label: 'Instagram',
            followers: 12610,
            delta: 1.6,
            points: [12.0, 12.1, 12.1, 12.2, 12.3, 12.3, 12.4, 12.4, 12.5, 12.5, 12.6, 12.6],
          },
        ],
      },
      idea: {
        format: 'reel',
        pillar: 'Vibe',
        hook: 'Counter POV, Friday night.',
        angle:
          'Camera on the barman, orders called out, plates sliding across. One take, TikTok first.',
        feature: 'The counter · Carlos',
        referenceId: 'ca-r-sevilla',
        shots: ['Camera on the barman', 'Orders called', 'Plates slide across'],
        sharper: sharper(
          'One take, one counter, forty orders.',
          'Friday night from behind the bar.',
          'Stand at the counter. This is what you hear.',
        ),
      },
    },
    {
      id: 'ca-h-time',
      figure: '12–2pm',
      label: 'FRIDAY AND SATURDAY',
      text: 'Weekend lunch beats every weeknight. You post on Tuesdays.',
      chart: { kind: 'days', values: [0.3, 0.3, 0.35, 0.4, 0.9, 1, 0.85], best: [4, 5] },
    },
  ],
  hours: [0.1, 1, 0.45, 0.7, 0.35],
  posts: [
    {
      image: K.croquetas,
      hook: 'Crack one open. Molten.',
      format: 'reel',
      pillar: 'Value',
      date: '9 SEP',
      reach: 9100,
      saves: 340,
      engagement: 9.2,
    },
    {
      image: K.bombas,
      hook: 'Closed Monday for a private event.',
      format: 'photo',
      pillar: 'Occasion',
      date: '13 SEP',
      reach: 1700,
      saves: 9,
      engagement: 3.1,
    },
    {
      image: PIN('ca-p-1'),
      hook: 'The table, from above.',
      format: 'carousel',
      pillar: 'Fun',
      date: '17 SEP',
      reach: 6800,
      saves: 290,
      engagement: 10.2,
    },
    {
      image: K.pintxos,
      hook: 'Pintxos night, straight from the counter.',
      format: 'reel',
      pillar: 'Vibe',
      date: '20 SEP',
      reach: 7400,
      saves: 210,
      engagement: 7.5,
    },
    {
      image: K.bravas,
      hook: 'New opening hours.',
      format: 'photo',
      pillar: 'Occasion',
      date: '24 SEP',
      reach: 2300,
      saves: 15,
      engagement: 3.3,
    },
    {
      image: PIN('ca-p-5'),
      hook: 'Five-foot way, 6pm.',
      format: 'reel',
      pillar: 'Vibe',
      date: '28 SEP',
      reach: 6200,
      saves: 180,
      engagement: 7.6,
    },
    {
      image: K.jamon,
      hook: 'Slicing jamón, one breath at a time.',
      format: 'reel',
      pillar: 'Craft',
      date: '3 OCT',
      reach: 5600,
      saves: 140,
      engagement: 6.8,
    },
  ],
  creators: [
    {
      name: 'Rachel Wee',
      handle: '@rachelwee.eats',
      platform: 'tt',
      followers: 112000,
      posts: 2,
      views: 48600,
      engagement: 8.9,
      top: { image: K.croquetas, hook: 'Molten croquetas in Joo Chiat.', views: 33100 },
    },
    {
      name: 'Farid Rahman',
      handle: '@faridfeeds',
      platform: 'ig',
      followers: 64000,
      posts: 2,
      views: 24300,
      engagement: 6.2,
      top: { image: K.pintxos, hook: 'Pintxos night, worth the queue.', views: 16200 },
    },
    {
      name: 'Sophie Chua',
      handle: '@sophieinsg',
      platform: 'tt',
      followers: 29000,
      posts: 3,
      views: 17800,
      engagement: 12.1,
      top: { image: K.bravas, hook: 'Ordering like a regular at Carlitos.', views: 7900 },
    },
    {
      name: 'Kenji Mori',
      handle: '@kenjimori',
      platform: 'ig',
      followers: 47000,
      posts: 1,
      views: 9200,
      engagement: 3.6,
      top: { image: K.jamon, hook: 'The jamón slicer is the show.', views: 9200 },
    },
    {
      name: 'Alicia Ong',
      handle: '@aliciaong',
      platform: 'ig',
      followers: 15000,
      posts: 1,
      views: 4100,
      engagement: 7.4,
      top: { image: K.bombas, hook: 'Bombas for two.', views: 4100 },
    },
  ],
}

export const INSIGHTS_BY_BRAND: Record<BrandId, BrandInsights> = {
  'casa-vostra': CASA_VOSTRA,
  temper: TEMPER,
  carlitos: CARLITOS,
}
