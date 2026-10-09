/**
 * The ideas page's data, one set per brand. Static, like `demo.ts`. Hooks that already sit on a
 * brand's calendar (`brands.ts`) appear here with the same words, so the two pages agree.
 *
 * Each brand keeps its own ideas, references, boards and moments. Nothing is shared between
 * brands on purpose: the team never posts the same thing across brands.
 */

import type { BrandId } from './brands'
import { PHOTO, type Format, type Stage } from './demo'

export type Pillar = 'Craft' | 'Fun' | 'Occasion' | 'Vibe' | 'Value' | 'Chef'
/** Every format an idea can take: the feed's reels and carousels, and stories. */
export type IdeaFormat = Format

/** Where an idea came from. Shown on the card, so nothing reads as made from nothing. */
export type IdeaSource =
  | { kind: 'own' }
  | { kind: 'insight'; line: string }
  | { kind: 'reference'; account: string }
  | { kind: 'moment'; title: string }
  | { kind: 'suggested' }

/** What a suggestion grew from: one of the team's ideas, and the insight behind it. */
export interface BuiltOn {
  idea: { hook: string; image?: string; meta: string }
  insight?: { line: string; a: number; b: number; unit: string }
}

/** A stronger hook and what makes it stronger. */
export interface Sharper {
  text: string
  tag: string
}

/** A reference on the shelf: a saved post or a pin, with what to borrow from it. */
export interface Reference {
  id: string
  platform: 'ig' | 'tt' | 'pinterest'
  /** The account, or the board for a pin. */
  account: string
  image: string
  /** What to borrow, in the team's words. */
  borrow: string
  /** Height over width, for a pin on the board. */
  ratio?: number
  /** What an idea planned from this post starts with, when it is picked first. */
  seed: Omit<IdeaCard, 'id' | 'source' | 'status' | 'inspiration'>
}

export type IdeaStatus = 'suggested' | 'idea' | Stage

/** One shot of the storyboard: a slide of a carousel, or a beat of a reel or a story. */
export interface Shot {
  title: string
  /** The reference to shoot it like: an entry of the idea's `inspiration`. */
  ref?: string
  /** The photo or clip captured on the day, as a media URL (`components/media.tsx`). */
  media?: string
  /** Ticked on the day, with or without media. */
  captured?: boolean
}

/** Shots from their titles, as the seeds write them. */
export const storyboard = (...titles: string[]): Shot[] => titles.map((title) => ({ title }))

/** True for a reference that is a file the team added, not a saved post. */
export const isMediaRef = (ref: string) => /^(blob:|data:|\/|https?:)/.test(ref)

export interface IdeaCard {
  id: string
  format: IdeaFormat
  pillar: Pillar
  hook: string
  angle: string
  /** The dish or the chef in frame. */
  feature: string
  image?: string
  source: IdeaSource
  status: IdeaStatus
  /** The day it sits on, or the day a suggestion proposes. Absent until it is sent. */
  dayN?: string
  /** The post it became, whose stage is the status. */
  postId?: string
  /**
   * What it should look like, in order: the saved posts it grew from, by id, and any photo or
   * video the team added on its page, as a media URL (`isMediaRef`). The first is the main look;
   * the first post's photo stands in as the cover when the idea has no photo of its own.
   */
  inspiration: string[]
  shots: Shot[]
  /** The day the team shoots it, on the calendar. */
  shootDay?: string
  sharper: Sharper[]
  builtOn?: BuiltOn
}

/** A Pinterest board on the team's account: the demo imports its pins onto the shelf. */
export interface Board {
  id: string
  name: string
  pinCount: number
  covers: string[]
  pins: Reference[]
}

export interface Moment {
  id: string
  /** As printed: "SAT 10 OCT". */
  when: string
  /** The day number in the calendar month, if the moment falls inside it. */
  dayN?: string
  title: string
  /** The nearest venue and how far. */
  near: string
  seed: Omit<IdeaCard, 'id' | 'source' | 'status' | 'image'>
}

export interface BrandIdeas {
  /** Two a week across the month. */
  target: number
  ideas: IdeaCard[]
  references: Reference[]
  boards: Board[]
  moments: Moment[]
}

const S = (text: string, tag: string): Sharper => ({ text, tag })

/** A pin: the board is its account, the note is what to borrow, and the angle says to shoot it. */
function pin(
  id: string,
  board: string,
  borrow: string,
  seed: Pick<IdeaCard, 'format' | 'pillar' | 'hook' | 'feature'> & {
    sharper: Sharper[]
    shots?: Shot[]
  },
): Reference {
  return {
    id,
    platform: 'pinterest',
    account: board,
    image: PIN(id),
    ratio: PIN_RATIO[id],
    borrow,
    seed: {
      ...seed,
      angle: `Shoot it like the pin: ${borrow.toLowerCase()}.`,
      shots: seed.shots ?? [],
    },
  }
}

/** Each pin has its own photo, named after the pin id. */
const PIN = (id: string) => `/demo/pins/${id}.jpg`

/** Each pin photo's height over width, so the board lays them out at their own shape. */
const PIN_RATIO: Record<string, number> = {
  'cv-p-1': 1.25,
  'cv-p-2': 1.59,
  'cv-p-3': 1.13,
  'cv-p-4': 0.56,
  'cv-p-5': 1.5,
  'cv-p-6': 0.56,
  'cv-p-7': 0.67,
  'cv-p-8': 1.5,
  'cv-p-9': 1.5,
  'cv-p-10': 1.5,
  'cv-p-11': 1.78,
  'cv-p-12': 0.79,
  'cv-p-13': 0.67,
  'cv-p-14': 0.67,
  'tp-p-1': 0.56,
  'tp-p-2': 1.5,
  'tp-p-3': 1.5,
  'tp-p-4': 1.33,
  'tp-p-5': 1.5,
  'tp-p-6': 1.25,
  'tp-p-7': 0.67,
  'tp-p-8': 0.67,
  'tp-p-9': 0.67,
  'tp-p-10': 1.5,
  'tp-p-11': 1.5,
  'tp-p-12': 1.5,
  'tp-p-13': 1.5,
  'tp-p-14': 0.67,
  'ca-p-1': 1.33,
  'ca-p-2': 0.67,
  'ca-p-3': 1.25,
  'ca-p-4': 0.9,
  'ca-p-5': 1.5,
  'ca-p-6': 0.67,
  'ca-p-7': 1.5,
  'ca-p-8': 1.5,
  'ca-p-9': 0.67,
  'ca-p-10': 0.75,
  'ca-p-11': 0.56,
  'ca-p-12': 0.77,
  'ca-p-13': 1.5,
  'ca-p-14': 1.5,
}

// ── Casa Vostra ──────────────────────────────────────────────────────────────────────────────

const CASA_VOSTRA: BrandIdeas = {
  target: 8,
  ideas: [
    {
      id: 'cv-five-pastas',
      format: 'carousel',
      pillar: 'Craft',
      hook: 'Five pastas, one dough.',
      angle: 'One sheet, five cuts, tagliatelle to pappardelle, shot overhead on the bench.',
      feature: 'Fresh pasta · Chef Marco',
      image: PHOTO.tagliatelle,
      source: { kind: 'own' },
      status: 'idea',
      postId: 'five-pastas',
      inspiration: ['cv-r-sfoglina', 'cv-p-10', 'cv-p-8'],
      shots: storyboard('The sheet, overhead', 'Five cuts in a row', 'All five, plated'),
      sharper: [
        S('One dough. Five pastas. No shortcuts.', 'NUMBER'),
        S('Same dough, five cuts. Pick yours.', 'ASK'),
        S('Everything on this bench started as one sheet.', 'PLACE'),
      ],
    },
    {
      id: 'cv-carb-up',
      format: 'reel',
      pillar: 'Occasion',
      hook: "Carb up before tomorrow's race.",
      angle: 'Race-eve bowls at dinner, bibs on the table, the Half Marathon route out the window.',
      feature: 'Tagliatelle al ragù',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['cv-r-cozy', 'cv-p-8'],
      shots: storyboard('Bibs on the table', 'The bowl lands', 'The route, out the window'),
      sharper: [
        S('The 21 km start at the dinner table.', 'NUMBER'),
        S('Tomorrow you run. Tonight you eat.', 'TIME'),
        S('Carb-load like the front of the pack.', 'BOLDER'),
      ],
    },
    {
      id: 'cv-blindfold',
      format: 'reel',
      pillar: 'Fun',
      hook: 'Blindfold pizza: the rematch.',
      angle: 'Two cooks, one blindfold, guess the topping. The loser preps the onions.',
      feature: 'Chef Marco vs Chef Dani',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['cv-r-dough', 'cv-p-11', 'cv-p-5'],
      shots: storyboard('Blindfold on', 'One bite, one guess', 'The onions'),
      sharper: [
        S('He lost last time. He asked for this.', 'STORY'),
        S('Blindfolded. One bite. Name the topping.', 'SHORTER'),
        S('The rematch nobody in the kitchen wanted.', 'BOLDER'),
      ],
    },
    {
      id: 'cv-stares-back',
      format: 'carousel',
      pillar: 'Fun',
      hook: 'The pizza that stares back.',
      angle: 'Olive eyes, mozzarella ghosts: the Halloween pie in four frames.',
      feature: 'Halloween special',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['cv-r-nightshift', 'cv-p-12', 'cv-p-6'],
      shots: storyboard('The eyes', 'The ghosts', 'The whole pie, lights low'),
      sharper: [
        S("Don't make eye contact with slice three.", 'NUMBER'),
        S('It stares. You eat it anyway.', 'SHORTER'),
        S('Our Halloween pie has opinions.', 'VOICE'),
      ],
    },
    {
      id: 'cv-dough',
      format: 'reel',
      pillar: 'Craft',
      hook: 'Watch the dough become tagliatelle.',
      angle: 'Chef walks the dough from flour to pass. No talking, just sound.',
      feature: 'Tagliatelle · Chef Marco',
      image: PHOTO.pasta,
      source: { kind: 'insight', line: 'Hand-made reels hold viewers 2× longer' },
      status: 'idea',
      inspiration: ['cv-r-sfoglina', 'cv-p-7', 'cv-p-10', 'cv-p-3'],
      shots: storyboard(
        'Flour and eggs, overhead',
        'The sheet through the roller, hands only',
        'The cut, then the pass',
      ),
      sharper: [
        S('48 hours for one plate of tagliatelle.', 'NUMBER'),
        S('Flour on Monday. Your plate on Wednesday.', 'TIME'),
        S('This is what 48 hours sounds like.', 'SOUND'),
      ],
    },
    {
      id: 'cv-s-dough-shift',
      format: 'reel',
      pillar: 'Craft',
      hook: 'The 6am dough shift.',
      angle: 'Open the kitchen before the mall does. Flour, first light, no words.',
      feature: 'Morning prep · Chef Marco',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '14',
      inspiration: ['cv-p-1', 'cv-p-9', 'cv-r-sfoglina'],
      shots: storyboard(
        'The shutter goes up, 6am, mall empty',
        'Flour hits the bench in first light',
        'Hands only, the first sheet',
      ),
      sharper: [
        S('The mall opens at 10. We open at 6.', 'TIME'),
        S('Before the first customer, the first sheet.', 'STORY'),
        S('Nobody sees this part. Now you do.', 'BOLDER'),
      ],
      builtOn: {
        idea: {
          hook: 'Watch the dough become tagliatelle.',
          image: PHOTO.pasta,
          meta: 'YOUR IDEA · REEL · CRAFT · TUE 20 OCT',
        },
        insight: {
          line: 'Hand-made reels hold viewers 2× longer.',
          a: 48,
          b: 31,
          unit: 'watched to the end',
        },
      },
    },
    {
      id: 'cv-s-staff-pick',
      format: 'reel',
      pillar: 'Fun',
      hook: 'Which pasta are you? Staff pick.',
      angle: 'Four staff, four shapes, one honest answer each. Fast cuts.',
      feature: 'The floor team',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '22',
      inspiration: ['cv-r-dough', 'cv-p-11'],
      shots: storyboard('Four faces, four answers', 'Each shape, held up', 'The argument'),
      sharper: [
        S('Four staff. Four pastas. One argument.', 'NUMBER'),
        S('We asked the floor. They did not hold back.', 'STORY'),
        S('Tell us your pasta and we will tell you who you are.', 'ASK'),
      ],
      builtOn: {
        idea: {
          hook: 'Blindfold pizza: the rematch.',
          meta: 'YOUR IDEA · REEL · FUN · FRI 23 OCT',
        },
        insight: {
          line: 'A chef in frame reaches 1.8× further.',
          a: 8900,
          b: 4900,
          unit: 'reach per post',
        },
      },
    },
    {
      id: 'cv-s-deepavali',
      format: 'carousel',
      pillar: 'Occasion',
      hook: 'Deepavali, family style.',
      angle: 'Sharing platters for the long weekend, shot from above like the five pastas.',
      feature: 'Family set · 8 Nov',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '29',
      inspiration: ['cv-p-2', 'cv-p-9', 'cv-r-cozy'],
      shots: storyboard('The full table, overhead', 'Hands reaching in', 'The last plate'),
      sharper: [
        S('One table. Every plate in the middle.', 'PLACE'),
        S('Pass the pasta. Deepavali at Casa Vostra.', 'VOICE'),
        S('The long weekend, served family style.', 'TIME'),
      ],
      builtOn: {
        idea: {
          hook: 'Five pastas, one dough.',
          image: PHOTO.tagliatelle,
          meta: 'YOUR IDEA · CAROUSEL · CRAFT · FRI 30 OCT',
        },
      },
    },
    {
      id: 'cv-st-poll',
      format: 'story',
      pillar: 'Fun',
      hook: 'Pappardelle or tagliatelle? Vote.',
      angle: "A two-frame poll from the pass. The winner is Friday's special.",
      feature: 'Fresh pasta · Chef Marco',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['cv-p-8', 'cv-p-10'],
      shots: storyboard('Both pastas side by side', 'The poll sticker frame', 'The winner, plated'),
      sharper: [],
    },
    {
      id: 'cv-st-prep',
      format: 'story',
      pillar: 'Craft',
      hook: 'Prep, 7am, before anyone is in.',
      angle: 'Five quick frames of the kitchen waking up. No words, the time on each.',
      feature: 'The kitchen',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['cv-p-1', 'cv-p-9'],
      shots: storyboard('7:02, lights on', '7:15, flour out', '7:40, the first sheet'),
      sharper: [],
    },
  ],
  references: [
    {
      id: 'cv-r-sfoglina',
      platform: 'ig',
      account: '@sfoglina.bologna',
      image: PHOTO.pasta,
      borrow: 'Hands in frame, face out. Overhead, sound on.',
      seed: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'Hands only. Sound on.',
        angle: 'Shoot it like the reference: hands in frame, face out, overhead, sound on.',
        feature: 'Tagliatelle · Chef Marco',
        shots: storyboard('Flour and eggs, overhead', 'The knife, close', 'The cut'),
        sharper: [
          S('No music. Just the board.', 'SOUND'),
          S('Turn the sound on for this one.', 'ASK'),
          S('Overhead, hands only, 20 seconds.', 'NUMBER'),
        ],
      },
    },
    {
      id: 'cv-r-dough',
      platform: 'tt',
      account: '@dough.diaries',
      image: PHOTO.crust,
      borrow: 'The flame in frame. One take, end on the crust.',
      seed: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'One take. Bench to oven.',
        angle: 'Shoot it like the reference: the flame in frame, one take, end on the crust.',
        feature: 'Margherita · Chef Dani',
        shots: storyboard('The stretch', 'Into the oven', 'The crust, close'),
        sharper: [
          S('No cuts. Bench to oven in 40 seconds.', 'NUMBER'),
          S('One pizza, one take, one oven roar.', 'SOUND'),
          S('We did not edit this.', 'BOLDER'),
        ],
      },
    },
    {
      id: 'cv-r-cozy',
      platform: 'pinterest',
      account: 'Cozy trattoria light',
      image: PHOTO.tagliatelle,
      borrow: 'Warm, low light, a candle in frame.',
      seed: {
        format: 'carousel',
        pillar: 'Vibe',
        hook: 'Dinner in the warm light.',
        angle: 'Shoot it like the pin: warm, low light, a candle in frame.',
        feature: 'The dining room',
        shots: storyboard('The candle', 'The plate', 'The window at Raffles City'),
        sharper: [
          S('The room at 7pm, before the second seating.', 'TIME'),
          S('We turned the lights down. Come see.', 'ASK'),
          S('Warm light, warm plates.', 'SHORTER'),
        ],
      },
    },
    {
      id: 'cv-r-nightshift',
      platform: 'ig',
      account: '@osteria.nightshift',
      image: PHOTO.ravioli,
      borrow: 'Hold the cut for three seconds before the reveal.',
      seed: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'Ravioli, filled by hand. Then the menu.',
        angle: 'Shoot it like the reference: hold the cut for three seconds before the reveal.',
        feature: 'Ravioli · Chef Marco',
        shots: storyboard(
          'Fill, fold, press',
          'The three-second hold',
          'The dish, with the menu line',
        ),
        sharper: [
          S('Filled by hand this morning. On the menu by noon.', 'TIME'),
          S('Fold, press, plate. Then the end card.', 'SHORTER'),
          S('Every ravioli, one pair of hands.', 'NUMBER'),
        ],
      },
    },
  ],
  boards: [
    {
      id: 'cv-b-pasta',
      name: 'Pasta shots',
      pinCount: 24,
      covers: [PIN('cv-p-1'), PIN('cv-p-2'), PIN('cv-p-3')],
      pins: [
        pin('cv-p-1', 'Pasta shots', 'Flour dust in backlight', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Flour in the morning light.',
          feature: 'Tagliatelle · Chef Marco',
          shots: storyboard('The window, 7am', 'Flour thrown into the light', 'The first sheet'),
          sharper: [
            S('7am. The only light is the window.', 'TIME'),
            S('Flour, light, nothing else.', 'SHORTER'),
            S('The prettiest minute of the day is before we open.', 'STORY'),
          ],
        }),
        pin('cv-p-2', 'Pasta shots', 'Rows of ravioli, shot straight down', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'Forty ravioli, one morning.',
          feature: 'Ravioli',
          shots: storyboard(
            'The tray, straight down',
            'One row, close',
            'The hands that filled them',
          ),
          sharper: [
            S('Forty ravioli. One pair of hands. One morning.', 'NUMBER'),
            S('Count them.', 'ASK'),
            S('Every one of these was folded before 10am.', 'TIME'),
          ],
        }),
        pin('cv-p-3', 'Pasta shots', 'Hands in frame, face out of it', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Hands only.',
          feature: 'Chef Marco',
          shots: storyboard('The fold, hands only', 'The press', 'The tray fills'),
          sharper: [
            S('You will never see his face. You will know his hands.', 'STORY'),
            S('Hands only. Sound on.', 'SOUND'),
            S('Twenty years in these two hands.', 'NUMBER'),
          ],
        }),
        pin('cv-p-7', 'Pasta shots', 'The sheet through the machine, side on', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'The sheet comes through.',
          feature: 'Tagliatelle · Chef Marco',
          shots: storyboard('The machine, side on', 'The sheet comes through', 'Hands catch it'),
          sharper: [],
        }),
        pin('cv-p-8', 'Pasta shots', 'Nests on a floured cloth', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'Six nests before service.',
          feature: 'Tagliatelle',
          shots: storyboard('Six nests on the cloth', 'One nest, close', 'The tray, overhead'),
          sharper: [],
        }),
        pin('cv-p-9', 'Pasta shots', 'Eggs and flour, before anything happens', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'It starts as two things.',
          feature: 'Fresh pasta',
          shots: storyboard(
            'Eggs and flour, untouched',
            'The first crack',
            'The well in the flour',
          ),
          sharper: [],
        }),
        pin('cv-p-10', 'Pasta shots', 'The knife through the rolled sheet', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Cut by hand, not by machine.',
          feature: 'Pappardelle · Chef Marco',
          shots: storyboard('The rolled sheet, overhead', 'The knife, close', 'Ribbons lifted'),
          sharper: [],
        }),
      ],
    },
    {
      id: 'cv-b-pizza',
      name: 'Pizza close-ups',
      pinCount: 17,
      covers: [PIN('cv-p-4'), PIN('cv-p-5'), PIN('cv-p-6')],
      pins: [
        pin('cv-p-4', 'Pizza close-ups', 'The blister on the crust, macro', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Look at that leopard spot.',
          feature: 'Margherita · Chef Dani',
          shots: storyboard(
            'Macro on the crust',
            'The blister, lit from the side',
            'The slice lifts',
          ),
          sharper: [
            S('Ninety seconds at 450 degrees does this.', 'NUMBER'),
            S('Leopard spots. That is the whole post.', 'SHORTER'),
            S('If the crust does not look like this, send it back.', 'BOLDER'),
          ],
        }),
        pin('cv-p-5', 'Pizza close-ups', 'Cheese pull, slowed down', {
          format: 'reel',
          pillar: 'Fun',
          hook: 'The pull.',
          feature: 'Quattro formaggi',
          shots: storyboard('The slice lifts, slow', 'The pull, side on', 'The bite'),
          sharper: [
            S('Four cheeses. One pull.', 'NUMBER'),
            S('Slowed down, because you asked.', 'VOICE'),
            S('Do not watch this hungry.', 'BOLDER'),
          ],
        }),
        pin('cv-p-6', 'Pizza close-ups', 'Oven glow as the only light', {
          format: 'carousel',
          pillar: 'Vibe',
          hook: 'Lit by the oven.',
          feature: 'The oven',
          shots: storyboard('The oven mouth', 'The peel goes in', 'The glow on the wall'),
          sharper: [
            S('No lights. Just the oven.', 'SHORTER'),
            S('450 degrees is also a lamp.', 'NUMBER'),
            S('The warmest light in Raffles City.', 'PLACE'),
          ],
        }),
        pin('cv-p-11', 'Pizza close-ups', 'The pizza held up to camera, hand in frame', {
          format: 'reel',
          pillar: 'Fun',
          hook: 'Hold it up. Show them.',
          feature: 'Margherita · Chef Dani',
          shots: storyboard(
            'The pizza held to camera',
            'Dani behind it, out of focus',
            'The first slice pulled',
          ),
          sharper: [],
        }),
        pin('cv-p-12', 'Pizza close-ups', 'Straight down, basil last', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'Basil goes on last.',
          feature: 'Margherita',
          shots: storyboard('Straight down, no basil', 'Basil goes on', 'The whole pie'),
          sharper: [],
        }),
        pin('cv-p-13', 'Pizza close-ups', 'Low angle, the char on the edge', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Burnt in the right places.',
          feature: 'Diavola · Chef Dani',
          shots: storyboard('Low on the edge', 'The char, macro', 'The cut'),
          sharper: [],
        }),
        pin('cv-p-14', 'Pizza close-ups', 'Macro, one leaf, one blister', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'One leaf. One blister.',
          feature: 'Margherita',
          shots: storyboard('One leaf, macro', 'The blister beside it', 'Pull back to the pie'),
          sharper: [],
        }),
      ],
    },
  ],
  moments: [
    {
      id: 'cv-m-f1',
      when: 'FRI 9 OCT',
      dayN: '9',
      title: 'F1 Singapore Grand Prix',
      near: '1.2 km',
      seed: {
        format: 'reel',
        pillar: 'Occasion',
        hook: 'Pizza before the lights go out.',
        angle: 'The quick pre-race order, timed on camera, the circuit lights in the window.',
        feature: 'Margherita · race week',
        inspiration: ['cv-p-6', 'cv-p-5'],
        shots: storyboard('The order, timed', 'The window, circuit lights', 'Out the door'),
        sharper: [
          S('Lights out at 8. Pizza at 6:40.', 'TIME'),
          S('Pole position for dinner.', 'VOICE'),
          S('The fastest pizza on the circuit.', 'BOLDER'),
        ],
      },
    },
    {
      id: 'cv-m-bigbang',
      when: 'FRI 16 OCT',
      dayN: '16',
      title: 'BIGBANG world tour',
      near: 'Stadium · 4.1 km',
      seed: {
        format: 'reel',
        pillar: 'Occasion',
        hook: 'Dinner before the concert, in 12 minutes.',
        angle: 'The quick pre-concert order, timed on camera, with the train line to the stadium.',
        feature: 'Pizza and a spritz',
        inspiration: ['cv-r-cozy', 'cv-p-11'],
        shots: storyboard('The clock starts', 'The plates land', 'The train platform'),
        sharper: [
          S('Doors at 8. Pizza at 6:40.', 'TIME'),
          S('Twelve minutes. Timed.', 'NUMBER'),
          S('In, fed, and at the stadium before the lights.', 'STORY'),
        ],
      },
    },
    {
      id: 'cv-m-halloween',
      when: 'SAT 31 OCT',
      dayN: '31',
      title: 'Halloween',
      near: 'Raffles City',
      seed: {
        format: 'carousel',
        pillar: 'Fun',
        hook: 'Trick, treat or tiramisu.',
        angle: 'Three desserts in costume, one per frame, the tiramisu as the reveal.',
        feature: 'Dessert trio',
        inspiration: ['cv-p-6', 'cv-r-nightshift'],
        shots: storyboard('Dessert one, in costume', 'Dessert two', 'The tiramisu, unmasked'),
        sharper: [
          S('Three desserts. One is in disguise.', 'NUMBER'),
          S('Trick or tiramisu?', 'ASK'),
          S('Halloween dessert, no tricks.', 'SHORTER'),
        ],
      },
    },
  ],
}

// ── Temper ───────────────────────────────────────────────────────────────────────────────────

const T = {
  pour: '/demo/temper/pour.jpg',
  glass: '/demo/temper/glass.jpg',
  room: '/demo/temper/room.jpg',
} as const

const TEMPER: BrandIdeas = {
  target: 8,
  ideas: [
    {
      id: 'tp-sommelier',
      format: 'reel',
      pillar: 'Chef',
      hook: 'What the sommelier drinks on a Monday.',
      angle: 'One bottle, one reason, the room empty behind her. Personality, not a lecture.',
      feature: 'Sommelier Lena',
      source: { kind: 'insight', line: 'Faces get 3× the saves of bottles' },
      status: 'idea',
      inspiration: ['tp-r-wineroom', 'tp-p-4', 'tp-p-13'],
      shots: storyboard('Lena at the counter, room empty', 'The bottle, one line', 'The first sip'),
      sharper: [
        S('Her Monday bottle is not on the list.', 'STORY'),
        S('Monday, 10pm, one glass. Hers.', 'TIME'),
        S('The sommelier has a day off. This is what she opens.', 'VOICE'),
      ],
    },
    {
      id: 'tp-gp-night',
      format: 'carousel',
      pillar: 'Occasion',
      hook: 'Grand Prix night: the late list.',
      angle: 'Five bottles for after the race, each with a one-line reason to open it late.',
      feature: 'The late list',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['tp-r-cellar', 'tp-p-5', 'tp-p-9'],
      shots: storyboard('Five bottles in a row', 'Each label, close', 'The room after midnight'),
      sharper: [
        S('After the podium, the late list.', 'TIME'),
        S('Race over. Five bottles for what comes next.', 'NUMBER'),
        S('The list we only pour after midnight.', 'STORY'),
      ],
    },
    {
      id: 'tp-one-sip',
      format: 'reel',
      pillar: 'Craft',
      hook: 'Natural wine in one sip.',
      angle: 'A single pour, a single sip, one sentence from the floor on why it tastes like that.',
      feature: 'Pét-nat · the floor team',
      image: T.pour,
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['tp-r-cellar', 'tp-p-3', 'tp-p-14'],
      shots: storyboard('The pour, close', 'The sip', 'One sentence to camera'),
      sharper: [
        S('One sip explains natural wine. Watch.', 'ASK'),
        S('Cloudy on purpose. Here is why.', 'STORY'),
        S('Natural wine, explained in one pour.', 'NUMBER'),
      ],
    },
    {
      id: 'tp-darkest-reds',
      format: 'carousel',
      pillar: 'Occasion',
      hook: 'The darkest reds, for the masquerade.',
      angle: 'Masquerade week: four inky bottles, shot against the black of the room.',
      feature: 'Masquerade · the cellar',
      image: T.glass,
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['tp-r-brutal', 'tp-p-8', 'tp-p-7', 'tp-p-1'],
      shots: storyboard(
        'Four bottles against black',
        'One glass, held to the lamp',
        'A mask on the counter',
      ),
      sharper: [
        S('Four reds darker than the room.', 'NUMBER'),
        S('Masks on. Labels off.', 'SHORTER'),
        S('The inkiest glasses in Duxton.', 'PLACE'),
      ],
    },
    {
      id: 'tp-counter',
      format: 'carousel',
      pillar: 'Vibe',
      hook: 'The counter at 10pm.',
      angle:
        'Four frames of the counter when the second seating leaves: glasses, records, low light.',
      feature: 'The room',
      image: T.room,
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['tp-r-brutal', 'tp-p-10', 'tp-p-1'],
      shots: storyboard('The counter, empty glasses', 'The record turns', 'The lamp'),
      sharper: [
        S('This is the hour we built the room for.', 'TIME'),
        S('Second seating gone. Counter open.', 'SHORTER'),
        S('10pm at the counter. Stay.', 'ASK'),
      ],
    },
    {
      id: 'tp-s-ask-floor',
      format: 'reel',
      pillar: 'Chef',
      hook: 'Ask the floor, not the label.',
      angle: 'A guest points at a bottle, the floor team picks a better one. Short, warm, cheeky.',
      feature: 'The floor team',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '15',
      inspiration: ['tp-r-wineroom', 'tp-p-2'],
      shots: storyboard('The guest points', 'The floor picks', 'The better glass'),
      sharper: [
        S('The label lies. The floor does not.', 'BOLDER'),
        S('Point at a bottle. We will point at a better one.', 'ASK'),
        S('Do not read the label. Ask us.', 'SHORTER'),
      ],
      builtOn: {
        idea: {
          hook: 'What the sommelier drinks on a Monday.',
          meta: 'YOUR IDEA · REEL · CHEF · MON 19 OCT',
        },
        insight: {
          line: 'Faces get 3× the saves of bottles.',
          a: 186,
          b: 62,
          unit: 'saves per post',
        },
      },
    },
    {
      id: 'tp-s-winemaker',
      format: 'carousel',
      pillar: 'Occasion',
      hook: 'Three glasses, one winemaker.',
      angle: 'Winemaker dinner preview: three pours, three frames, the maker in the last.',
      feature: 'Winemaker dinner · Fri 16 Oct',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '16',
      inspiration: ['tp-p-5', 'tp-p-6', 'tp-p-12'],
      shots: storyboard('Three glasses in a row', 'Each pour', 'The winemaker, last frame'),
      sharper: [
        S('She made all three. Come meet her.', 'STORY'),
        S('Three glasses. One pair of hands behind them.', 'NUMBER'),
        S('The winemaker is in the room on Friday.', 'TIME'),
      ],
      builtOn: {
        idea: {
          hook: 'Natural wine in one sip.',
          image: T.pour,
          meta: 'YOUR IDEA · REEL · CRAFT · SAT 24 OCT',
        },
      },
    },
    {
      id: 'tp-s-side-b',
      format: 'reel',
      pillar: 'Vibe',
      hook: 'Vinyl & vino, side B.',
      angle: 'The record flips, the bottle changes. One minute of the night, no narration.',
      feature: 'Vinyl & vino · Thu 22 Oct',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '22',
      inspiration: ['tp-p-1', 'tp-r-lowlight', 'tp-p-7'],
      shots: storyboard('The record flips', 'The new bottle opens', 'The room, one minute'),
      sharper: [
        S('Side B is where the night starts.', 'STORY'),
        S('Flip the record. Open the next bottle.', 'SHORTER'),
        S('One minute of Vinyl & vino, no talking.', 'SOUND'),
      ],
      builtOn: {
        idea: { hook: 'The counter at 10pm.', image: T.room, meta: 'YOUR IDEA · CAROUSEL · VIBE' },
        insight: {
          line: 'Room-at-night reels reach 2.6× daytime photos.',
          a: 7300,
          b: 2800,
          unit: 'reach per post',
        },
      },
    },
    {
      id: 'tp-st-pour',
      format: 'story',
      pillar: 'Vibe',
      hook: "Tonight's pour, at 5pm.",
      angle: 'One frame each evening: the bottle Lena opens first, with the price.',
      feature: 'Sommelier Lena',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['tp-p-3', 'tp-p-14'],
      shots: storyboard('The bottle at 5pm', 'The pour', 'Price and one line'),
      sharper: [],
    },
    {
      id: 'tp-st-ask',
      format: 'story',
      pillar: 'Chef',
      hook: 'Ask the sommelier.',
      angle: 'A question sticker in the morning, Lena answers three at night.',
      feature: 'Sommelier Lena',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['tp-r-wineroom', 'tp-p-11'],
      shots: storyboard('The question sticker', 'Lena reads one', 'Her answer, to camera'),
      sharper: [],
    },
  ],
  references: [
    {
      id: 'tp-r-brutal',
      platform: 'ig',
      account: '@bar.brutal',
      image: T.room,
      borrow: 'Grain, low light, nobody looking at the camera.',
      seed: {
        format: 'reel',
        pillar: 'Vibe',
        hook: 'Nobody here is looking at the camera.',
        angle: 'Shoot it like the reference: grain, low light, nobody looking at the camera.',
        feature: 'The room',
        shots: storyboard('Handheld through the door', 'The counter, unposed', 'The lamp'),
        sharper: [
          S('Shot at 11pm. Nobody posed.', 'TIME'),
          S('The room, unposed.', 'SHORTER'),
          S('We did not ask anyone to smile.', 'VOICE'),
        ],
      },
    },
    {
      id: 'tp-r-cellar',
      platform: 'tt',
      account: '@cellar.door',
      image: T.glass,
      borrow: 'The pour as the only sound.',
      seed: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'Sound on. Just the pour.',
        angle: 'Shoot it like the reference: the pour as the only sound.',
        feature: 'Pét-nat',
        shots: storyboard('Macro on the glass', 'The pour', 'The last drop'),
        sharper: [
          S('Just the pour. Sound on.', 'SOUND'),
          S('Ten seconds of a pour.', 'NUMBER'),
          S('Listen to this one.', 'ASK'),
        ],
      },
    },
    {
      id: 'tp-r-lowlight',
      platform: 'pinterest',
      account: 'Low-light bars',
      image: T.room,
      borrow: 'Fire in the frame, plate off centre.',
      seed: {
        format: 'carousel',
        pillar: 'Craft',
        hook: 'Fire first. Then the plate.',
        angle: 'Shoot it like the pin: fire in the frame, plate off centre.',
        feature: 'Wood fire · Chef Ren',
        shots: storyboard('The fire', 'The plate, off centre', 'The glass catching the flame'),
        sharper: [
          S('Everything on this menu touched the fire.', 'BOLDER'),
          S('Fire in the frame, every time.', 'SHORTER'),
          S('The plate is off centre. The fire is not.', 'VOICE'),
        ],
      },
    },
    {
      id: 'tp-r-wineroom',
      platform: 'ig',
      account: '@wine.room.nyc',
      image: T.pour,
      borrow: 'Text on screen instead of a voice.',
      seed: {
        format: 'reel',
        pillar: 'Chef',
        hook: 'Three things the floor wants you to know.',
        angle: 'Shoot it like the reference: text on screen instead of a voice.',
        feature: 'The floor team',
        shots: storyboard('Card one, over the room', 'Card two', 'Card three'),
        sharper: [
          S('Three things. No voiceover.', 'NUMBER'),
          S('What the floor wishes you knew.', 'STORY'),
          S('Read this before you order.', 'ASK'),
        ],
      },
    },
  ],
  boards: [
    {
      id: 'tp-b-moods',
      name: 'Bar moods',
      pinCount: 31,
      covers: [PIN('tp-p-1'), PIN('tp-p-2'), PIN('tp-p-3')],
      pins: [
        pin('tp-p-1', 'Bar moods', 'One lamp, the rest dark', {
          format: 'carousel',
          pillar: 'Vibe',
          hook: 'One lamp on.',
          feature: 'The room',
          shots: storyboard('The lamp', 'The counter under it', 'The dark beyond'),
          sharper: [
            S('One lamp. That is the lighting plan.', 'NUMBER'),
            S('Everything else is dark on purpose.', 'VOICE'),
            S('The room at 11pm, lit by one bulb.', 'TIME'),
          ],
        }),
        pin('tp-p-2', 'Bar moods', 'Glass in front, room out of focus', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'The glass is the only thing in focus.',
          feature: 'The counter',
          shots: storyboard('The glass, sharp', 'The room, soft', 'The focus pulls'),
          sharper: [
            S('Focus on the glass. The room can wait.', 'SHORTER'),
            S('Everything behind this glass is a blur. Good.', 'VOICE'),
            S('One glass in focus, forty people out of it.', 'NUMBER'),
          ],
        }),
        pin('tp-p-3', 'Bar moods', 'The pour, lit from behind', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Backlit pour.',
          feature: 'Pét-nat',
          shots: storyboard(
            'The bottle against the lamp',
            'The pour, lit through',
            'The glass fills',
          ),
          sharper: [
            S('Light through the pour. Sound on.', 'SOUND'),
            S('This is what cloudy looks like in good light.', 'STORY'),
            S('Backlit. Ten seconds.', 'NUMBER'),
          ],
        }),
        pin('tp-p-7', 'Bar moods', 'A candle and a bottle on bare wood', {
          format: 'carousel',
          pillar: 'Vibe',
          hook: 'One candle per table.',
          feature: 'The counter',
          shots: storyboard(
            'The candle lit',
            'Bottle and glass beside it',
            'The room behind, dark',
          ),
          sharper: [],
        }),
        pin('tp-p-8', 'Bar moods', 'The last inch of wine, lit red', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'The last glass of the night.',
          feature: 'The room · 11pm',
          shots: storyboard('The last pour', 'The glass, lit red', 'The empty bottle'),
          sharper: [],
        }),
        pin('tp-p-9', 'Bar moods', 'A row of glasses, nobody in shot', {
          format: 'carousel',
          pillar: 'Vibe',
          hook: 'Eight glasses, poured.',
          feature: 'The counter',
          shots: storyboard(
            'Eight glasses in a row',
            'The pour along the row',
            'The row, finished',
          ),
          sharper: [],
        }),
        pin('tp-p-10', 'Bar moods', 'The empty bar before doors', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'Ten minutes before doors.',
          feature: 'The room · 4:50pm',
          shots: storyboard('The empty room, 4:50pm', 'The lights come up', 'The door opens'),
          sharper: [],
        }),
      ],
    },
    {
      id: 'tp-b-labels',
      name: 'Wine labels',
      pinCount: 12,
      covers: [PIN('tp-p-4'), PIN('tp-p-5'), PIN('tp-p-6')],
      pins: [
        pin('tp-p-4', 'Wine labels', 'Label flat to camera, hand holding it', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'Read the label with us.',
          feature: 'The list',
          shots: storyboard('The label, flat', 'The hand turns it', 'The back label'),
          sharper: [
            S('Three words on this label matter. Here they are.', 'NUMBER'),
            S('Read the back, not the front.', 'ASK'),
            S('What the label says, and what it means.', 'STORY'),
          ],
        }),
        pin('tp-p-5', 'Wine labels', 'Three bottles in a row, one word each', {
          format: 'carousel',
          pillar: 'Chef',
          hook: 'Three bottles, three words.',
          feature: 'Sommelier Lena',
          shots: storyboard('Three bottles, lined up', 'One word on each', 'Lena picks one'),
          sharper: [
            S('Three bottles. Three words. Pick one.', 'ASK'),
            S('Lena describes each bottle in one word.', 'STORY'),
            S('One word each. No tasting notes.', 'SHORTER'),
          ],
        }),
        pin('tp-p-6', 'Wine labels', 'The bottle beside the plate it is for', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'This bottle, that plate.',
          feature: 'Wood fire · Chef Ren',
          shots: storyboard('Bottle and plate, side by side', 'The pour', 'The first bite'),
          sharper: [
            S('Every bottle on the list has a plate. This is one pair.', 'STORY'),
            S('Pairing, in one frame.', 'SHORTER'),
            S('This bottle was chosen for this plate. Taste why.', 'ASK'),
          ],
        }),
        pin('tp-p-11', 'Wine labels', 'Label to camera on a plain wall', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'The label, then the story.',
          feature: 'This week on the list',
          shots: storyboard('The label to camera', 'Lena turns the bottle', 'The pour'),
          sharper: [],
        }),
        pin('tp-p-12', 'Wine labels', 'The bottle on the bar top, brick behind', {
          format: 'carousel',
          pillar: 'Craft',
          hook: 'Pink label, serious wine.',
          feature: 'This week on the list',
          shots: storyboard('The bottle on the bar', 'The brick behind', 'The first glass'),
          sharper: [],
        }),
        pin('tp-p-13', 'Wine labels', 'One bottle, warm light, nothing else', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'One bottle. One reason.',
          feature: 'Sommelier Lena',
          shots: storyboard('One bottle, warm light', 'The cork', 'One line from Lena'),
          sharper: [],
        }),
        pin('tp-p-14', 'Wine labels', 'Bottle and glass, poured', {
          format: 'carousel',
          pillar: 'Chef',
          hook: 'What Lena pours first.',
          feature: 'Sommelier Lena',
          shots: storyboard('Bottle and glass', 'The pour, close', 'Lena lifts the glass'),
          sharper: [],
        }),
      ],
    },
  ],
  moments: [
    {
      id: 'tp-m-f1',
      when: 'SAT 10 OCT',
      dayN: '10',
      title: 'F1 Singapore Grand Prix',
      near: '2.4 km',
      seed: {
        format: 'carousel',
        pillar: 'Occasion',
        hook: 'Grand Prix night: the late list.',
        angle: 'Five bottles for after the race, each with a one-line reason to open it late.',
        feature: 'The late list',
        inspiration: ['tp-p-10', 'tp-p-9'],
        shots: storyboard('Five bottles in a row', 'Each label, close', 'The room after midnight'),
        sharper: [
          S('After the podium, the late list.', 'TIME'),
          S('Race over. Five bottles for what comes next.', 'NUMBER'),
          S('The list we only pour after midnight.', 'STORY'),
        ],
      },
    },
    {
      id: 'tp-m-bigbang',
      when: 'FRI 16 OCT',
      dayN: '16',
      title: 'BIGBANG world tour',
      near: 'Stadium · 6.8 km',
      seed: {
        format: 'reel',
        pillar: 'Vibe',
        hook: 'The after-show glass.',
        angle: 'Late doors, the room filling after the encore. One tracking shot to the counter.',
        feature: 'The counter, late',
        inspiration: ['tp-p-14', 'tp-p-2'],
        shots: storyboard('The door at 11', 'The room fills', 'The counter'),
        sharper: [
          S('Encore done. We are still pouring.', 'TIME'),
          S('The show ends at 10. We do not.', 'BOLDER'),
          S('After the stadium, the counter.', 'PLACE'),
        ],
      },
    },
    {
      id: 'tp-m-halloween',
      when: 'SAT 31 OCT',
      dayN: '31',
      title: 'Halloween',
      near: 'Masquerade wine night',
      seed: {
        format: 'reel',
        pillar: 'Occasion',
        hook: 'Masks on. Labels off.',
        angle: 'Masquerade night: blind pours, masked guests, the reveal of the bottle at the end.',
        feature: 'Masquerade wine night',
        inspiration: ['tp-p-8', 'tp-p-7'],
        shots: storyboard('Masks at the door', 'The blind pour', 'The reveal'),
        sharper: [
          S('You will not know what you are drinking. That is the point.', 'BOLDER'),
          S('Masks on, labels off, glasses full.', 'SHORTER'),
          S('A blind pour for a masked room.', 'STORY'),
        ],
      },
    },
  ],
}

// ── Carlitos ─────────────────────────────────────────────────────────────────────────────────

const K = {
  croquetas: '/demo/carlitos/croquetas.jpg',
  pintxos: '/demo/carlitos/pintxos.jpg',
  bravas: '/demo/carlitos/bravas.jpg',
  bombas: '/demo/carlitos/bombas.jpg',
  jamon: '/demo/carlitos/jamon.jpg',
} as const

const CARLITOS: BrandIdeas = {
  target: 8,
  ideas: [
    {
      id: 'ca-vermut',
      format: 'reel',
      pillar: 'Vibe',
      hook: 'Vermut hour on Joo Chiat Road.',
      angle: 'The shophouse front at 5pm, vermut on ice, the street going by. Loose and sunny.',
      feature: 'Vermut hour · 5–7pm',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['ca-r-counters', 'ca-p-5', 'ca-p-6'],
      shots: storyboard('The shophouse front, 5pm', 'Vermut on ice', 'The street going by'),
      sharper: [
        S('5pm on Joo Chiat. Vermut is on ice.', 'TIME'),
        S('The hour between work and dinner has a name.', 'STORY'),
        S('Vermut, ice, orange, Joo Chiat.', 'SHORTER'),
      ],
    },
    {
      id: 'ca-regular',
      format: 'carousel',
      pillar: 'Fun',
      hook: 'How to order tapas like a regular.',
      angle: 'Five slides, five rules, from "never one plate" to "ask what Carlos is eating".',
      feature: 'The counter',
      source: { kind: 'insight', line: 'How-to carousels are saved most' },
      status: 'idea',
      inspiration: ['ca-r-sevilla', 'ca-p-6', 'ca-p-2'],
      shots: storyboard('Rule one, on the counter', 'Rule three, the plates', 'Rule five, Carlos'),
      sharper: [
        S('Rule one: never order one plate.', 'NUMBER'),
        S('Five rules the regulars will not tell you.', 'STORY'),
        S('Order like you have been here before.', 'ASK'),
      ],
    },
    {
      id: 'ca-jamon',
      format: 'reel',
      pillar: 'Craft',
      hook: 'Slicing jamón, one breath at a time.',
      angle: 'The cortador, close on the knife, one slice per breath. No music.',
      feature: 'Jamón ibérico · Carlos',
      image: K.jamon,
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['ca-r-cortador', 'ca-p-8', 'ca-p-7'],
      shots: storyboard('The knife, close', 'One slice per breath', 'The slice held to the light'),
      sharper: [
        S('One breath. One slice. Thirty years.', 'NUMBER'),
        S('The knife does not hurry.', 'SHORTER'),
        S('Watch the slice go translucent.', 'ASK'),
      ],
    },
    {
      id: 'ca-paella',
      format: 'reel',
      pillar: 'Occasion',
      hook: 'Paella Sunday, from the pan.',
      angle: 'Top-down on the pan from socarrat to serve, then the table reaching in.',
      feature: 'Paella · Sundays',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['ca-p-1', 'ca-p-3', 'ca-p-9'],
      shots: storyboard('The pan, top down', 'The socarrat scrape', 'Eight spoons'),
      sharper: [
        S('Listen for the socarrat.', 'SOUND'),
        S('Sunday is a pan with eight spoons.', 'NUMBER'),
        S('The pan comes to the table. Then the hands.', 'STORY'),
      ],
    },
    {
      id: 'ca-under-30',
      format: 'reel',
      pillar: 'Value',
      hook: 'Three tapas under $30.',
      angle:
        'Croquetas, bravas, bombas: the order that feeds two for under thirty, with the receipt.',
      feature: 'Croquetas, bravas, bombas',
      image: K.croquetas,
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['ca-r-barrio', 'ca-p-2', 'ca-p-8'],
      shots: storyboard('The three plates land', 'The receipt', 'The last croqueta'),
      sharper: [
        S('Two people. Three plates. $28.', 'NUMBER'),
        S('Under $30, and you will fight over the last croqueta.', 'STORY'),
        S('The order we tell every first-timer.', 'VOICE'),
      ],
    },
    {
      id: 'ca-s-sherry',
      format: 'carousel',
      pillar: 'Craft',
      hook: 'Sherry, three ways.',
      angle:
        'Fino, amontillado, oloroso: one frame each, one plate each, the tasting night as the end card.',
      feature: 'Sherry tasting · Thu 15 Oct',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '15',
      inspiration: ['ca-r-counters', 'ca-p-7'],
      shots: storyboard('Fino, with its plate', 'Amontillado', 'Oloroso, then the end card'),
      sharper: [
        S('Three sherries. Three plates. One Thursday.', 'NUMBER'),
        S('Sherry is not what you think it is.', 'BOLDER'),
        S('From bone dry to dessert in three glasses.', 'STORY'),
      ],
      builtOn: {
        idea: { hook: 'Vermut hour on Joo Chiat Road.', meta: 'YOUR IDEA · REEL · VIBE' },
        insight: {
          line: 'How-to carousels are saved most.',
          a: 290,
          b: 140,
          unit: 'saves per post',
        },
      },
    },
    {
      id: 'ca-s-pre-gig',
      format: 'reel',
      pillar: 'Occasion',
      hook: 'Pintxos for the pre-gig crowd.',
      angle: 'Friday, 6pm, pintxos by the stick, out the door by 7:15 for the stadium.',
      feature: 'Pintxos night · Fri 16 Oct',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '17',
      inspiration: ['ca-p-2', 'ca-p-11', 'ca-r-sevilla'],
      shots: storyboard('The counter at 6', 'Sticks counted', 'Out the door at 7:15'),
      sharper: [
        S('Doors at 8. Pintxos at 6.', 'TIME'),
        S('Pay by the stick, leave by 7:15.', 'NUMBER'),
        S('The pre-show plan: pintxos.', 'SHORTER'),
      ],
      builtOn: {
        idea: {
          hook: 'How to order tapas like a regular.',
          meta: 'YOUR IDEA · CAROUSEL · FUN · TUE 13 OCT',
        },
      },
    },
    {
      id: 'ca-s-regulars-order',
      format: 'reel',
      pillar: 'Value',
      hook: "The regular's order, in 15 seconds.",
      angle: 'One regular, one order, called out fast at the counter. Cut to the plates landing.',
      feature: 'A regular · the counter',
      source: { kind: 'suggested' },
      status: 'suggested',
      dayN: '22',
      inspiration: ['ca-p-6', 'ca-r-barrio'],
      shots: storyboard('The regular sits', 'The order, fast', 'The plates land'),
      sharper: [
        S('He did not look at the menu.', 'STORY'),
        S('Fifteen seconds to order. Thirty years of practice.', 'NUMBER'),
        S('This is what a regular sounds like.', 'SOUND'),
      ],
      builtOn: {
        idea: {
          hook: 'Three tapas under $30.',
          image: K.croquetas,
          meta: 'YOUR IDEA · REEL · VALUE',
        },
        insight: {
          line: 'Value posts get shared 2.4× more.',
          a: 168,
          b: 70,
          unit: 'shares per post',
        },
      },
    },
    {
      id: 'ca-st-count',
      format: 'story',
      pillar: 'Value',
      hook: 'Twelve croquetas left.',
      angle: 'A countdown sticker as the lunch tray empties. Urgency without an ad.',
      feature: 'Croquetas',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['ca-p-8', 'ca-r-barrio'],
      shots: storyboard('The full tray, noon', 'Half gone', 'The last one'),
      sharper: [],
    },
    {
      id: 'ca-st-street',
      format: 'story',
      pillar: 'Vibe',
      hook: 'Joo Chiat, 6pm.',
      angle: 'The walk from the MRT to the door in four frames.',
      feature: 'Joo Chiat Road',
      source: { kind: 'own' },
      status: 'idea',
      inspiration: ['ca-p-11', 'ca-p-5', 'ca-p-14'],
      shots: storyboard('The MRT exit', 'The shophouse row', 'Our door, lights on'),
      sharper: [],
    },
  ],
  references: [
    {
      id: 'ca-r-sevilla',
      platform: 'tt',
      account: '@barra.sevilla',
      image: K.pintxos,
      borrow: 'Counter POV, the barman calling orders.',
      seed: {
        format: 'reel',
        pillar: 'Vibe',
        hook: 'Counter POV, Friday night.',
        angle: 'Shoot it like the reference: counter POV, the barman calling orders.',
        feature: 'The counter · Carlos',
        shots: storyboard('Camera on the barman', 'Orders called', 'Plates slide across'),
        sharper: [
          S('Stand at the counter. This is what you hear.', 'SOUND'),
          S('Friday night from behind the bar.', 'TIME'),
          S('One take, one counter, forty orders.', 'NUMBER'),
        ],
      },
    },
    {
      id: 'ca-r-barrio',
      platform: 'ig',
      account: '@elbarrio.sg',
      image: K.bravas,
      borrow: 'The price in the first frame.',
      seed: {
        format: 'carousel',
        pillar: 'Value',
        hook: '$12. Then the rest.',
        angle: 'Shoot it like the reference: the price in the first frame.',
        feature: 'Patatas bravas',
        shots: storyboard('The price', 'The plate', 'The table'),
        sharper: [
          S('$12 for this.', 'NUMBER'),
          S('The price first. Then the plate.', 'SHORTER'),
          S('Yes, that is the price.', 'VOICE'),
        ],
      },
    },
    {
      id: 'ca-r-counters',
      platform: 'pinterest',
      account: 'Counter bars, Spain',
      image: K.bombas,
      borrow: 'Paper napkins and tiles, nothing styled.',
      seed: {
        format: 'carousel',
        pillar: 'Vibe',
        hook: 'Nothing on this counter is styled.',
        angle: 'Shoot it like the pin: paper napkins and tiles, nothing styled.',
        feature: 'The counter',
        shots: storyboard('Napkins', 'Tiles', 'A half-drunk caña'),
        sharper: [
          S('No stylist. Just the counter.', 'SHORTER'),
          S('We moved nothing for this photo.', 'VOICE'),
          S('Napkins, tiles, caña.', 'NUMBER'),
        ],
      },
    },
    {
      id: 'ca-r-cortador',
      platform: 'ig',
      account: '@jamon.cortador',
      image: K.jamon,
      borrow: 'Macro on the fat, slow motion.',
      seed: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'Watch the fat go glassy.',
        angle: 'Shoot it like the reference: macro on the fat, slow motion.',
        feature: 'Jamón ibérico · Carlos',
        shots: storyboard('Macro on the fat', 'The slice, slowed', 'Light through it'),
        sharper: [
          S('Slow it down. Look at the fat.', 'ASK'),
          S('Thin enough to read through.', 'SHORTER'),
          S('This is why it costs what it costs.', 'BOLDER'),
        ],
      },
    },
  ],
  boards: [
    {
      id: 'ca-b-spreads',
      name: 'Tapas spreads',
      pinCount: 28,
      covers: [PIN('ca-p-1'), PIN('ca-p-2'), PIN('ca-p-3')],
      pins: [
        pin('ca-p-1', 'Tapas spreads', 'The whole table from above', {
          format: 'carousel',
          pillar: 'Fun',
          hook: 'The table, from above.',
          feature: 'Pintxos night',
          shots: storyboard('The table, straight down', 'The hands come in', 'The empty plates'),
          sharper: [
            S('Nine plates. Four people. One table.', 'NUMBER'),
            S('This is what Friday looks like from the ceiling.', 'TIME'),
            S('Order this many. Trust us.', 'ASK'),
          ],
        }),
        pin('ca-p-2', 'Tapas spreads', 'Plates arriving one by one', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'Plate one. Plate two. Plate seven.',
          feature: 'The counter',
          shots: storyboard('Plate one lands', 'Plates three to six, fast', 'Plate seven'),
          sharper: [
            S('Seven plates in forty seconds.', 'NUMBER'),
            S('They keep coming.', 'SHORTER'),
            S('The kitchen does not stop at plate seven.', 'STORY'),
          ],
        }),
        pin('ca-p-3', 'Tapas spreads', 'Hands reaching in, mid-shot', {
          format: 'reel',
          pillar: 'Fun',
          hook: 'Nobody waits for the photo.',
          feature: 'Croquetas',
          shots: storyboard('The plate lands', 'Hands reach in', 'The empty plate'),
          sharper: [
            S('Nobody waited for the photo. Good.', 'VOICE'),
            S('Four hands, one plate, three seconds.', 'NUMBER'),
            S('Eat first. Post later.', 'SHORTER'),
          ],
        }),
        pin('ca-p-7', 'Tapas spreads', 'Low light, the plate in hand', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'The plate everyone shares.',
          feature: 'The counter',
          shots: storyboard('The plate in hand, low light', 'Hands reaching in', 'The empty plate'),
          sharper: [],
        }),
        pin('ca-p-8', 'Tapas spreads', 'Close on the sauce, steam rising', {
          format: 'reel',
          pillar: 'Craft',
          hook: 'Straight from the pan.',
          feature: 'Gambas al ajillo',
          shots: storyboard('The pan on the flame', 'The sauce, steam rising', 'Bread dipped in'),
          sharper: [],
        }),
        pin('ca-p-9', 'Tapas spreads', 'The board from above, every plate', {
          format: 'carousel',
          pillar: 'Value',
          hook: 'Everything on one board.',
          feature: 'The tabla',
          shots: storyboard(
            'The board from above',
            'Each plate lands',
            'Hands take the first bite',
          ),
          sharper: [],
        }),
        pin('ca-p-10', 'Tapas spreads', 'A set table before the first guest', {
          format: 'carousel',
          pillar: 'Occasion',
          hook: 'Set for eight.',
          feature: 'Group dinner',
          shots: storyboard('The set table', 'Glasses filled', 'The first guest sits'),
          sharper: [],
        }),
      ],
    },
    {
      id: 'ca-b-streets',
      name: 'Joo Chiat streets',
      pinCount: 15,
      covers: [PIN('ca-p-4'), PIN('ca-p-5'), PIN('ca-p-6')],
      pins: [
        pin('ca-p-4', 'Joo Chiat streets', 'Shophouse colour as the backdrop', {
          format: 'carousel',
          pillar: 'Vibe',
          hook: 'Joo Chiat, on a plate.',
          feature: 'Patatas bravas',
          shots: storyboard('The plate against the shophouse', 'The tiles', 'The street'),
          sharper: [
            S('The wall is the plate. The plate is the wall.', 'VOICE'),
            S('Joo Chiat colours, one plate.', 'SHORTER'),
            S('Shot outside, because the street is the room.', 'PLACE'),
          ],
        }),
        pin('ca-p-5', 'Joo Chiat streets', 'Golden hour, side light through the window', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'Five-foot way, 6pm.',
          feature: 'Vermut hour',
          shots: storyboard(
            'The five-foot way at 6',
            'Vermut on ice in the side light',
            'The street going by',
          ),
          sharper: [
            S('6pm. The light does the work.', 'TIME'),
            S('Golden hour on the five-foot way.', 'PLACE'),
            S('Come at six. Bring nobody. Stay.', 'ASK'),
          ],
        }),
        pin('ca-p-6', 'Joo Chiat streets', 'Neighbours at the counter, not models', {
          format: 'carousel',
          pillar: 'Fun',
          hook: 'Regulars, not models.',
          feature: 'The counter',
          shots: storyboard('The regulars, unposed', 'The counter', 'The last stool'),
          sharper: [
            S('Nobody in this photo was paid to be here.', 'VOICE'),
            S('Regulars, not models.', 'SHORTER'),
            S('Thirty regulars, zero models.', 'NUMBER'),
          ],
        }),
        pin('ca-p-11', 'Joo Chiat streets', 'The street at eye level, people walking', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'Two minutes from the MRT.',
          feature: 'Joo Chiat Road',
          shots: storyboard('The street at eye level', 'People walking past', 'Our door'),
          sharper: [],
        }),
        pin('ca-p-12', 'Joo Chiat streets', 'Shophouse fronts in a row', {
          format: 'carousel',
          pillar: 'Vibe',
          hook: 'Find the orange door.',
          feature: 'Joo Chiat Road',
          shots: storyboard('The shophouse row', 'The orange door', 'The door opens'),
          sharper: [],
        }),
        pin('ca-p-13', 'Joo Chiat streets', 'Colour behind the subject', {
          format: 'carousel',
          pillar: 'Fun',
          hook: 'Our neighbours have good taste.',
          feature: 'Koon Seng Road',
          shots: storyboard('Colour behind Carlos', 'Carlos turns to camera', 'Back inside'),
          sharper: [],
        }),
        pin('ca-p-14', 'Joo Chiat streets', 'The whole row, wide', {
          format: 'reel',
          pillar: 'Vibe',
          hook: 'The walk to dinner.',
          feature: 'Joo Chiat Road',
          shots: storyboard('The whole row, wide', 'A couple walks in', 'The counter inside'),
          sharper: [],
        }),
      ],
    },
  ],
  moments: [
    {
      id: 'ca-m-f1',
      when: 'SUN 11 OCT',
      dayN: '11',
      title: 'F1 Singapore Grand Prix',
      near: '5.6 km',
      seed: {
        format: 'reel',
        pillar: 'Occasion',
        hook: 'Race night: pintxos and the big screen.',
        angle: 'Race on the counter TV, the room cheering, pintxos landing between laps.',
        feature: 'Race night at the counter',
        inspiration: ['ca-p-6', 'ca-p-3'],
        shots: storyboard('The screen', 'The room cheers', 'Pintxos between laps'),
        sharper: [
          S('No grandstand ticket? Counter seat.', 'ASK'),
          S('The race is on. So is the kitchen.', 'TIME'),
          S('Pit lane is Joo Chiat Road tonight.', 'PLACE'),
        ],
      },
    },
    {
      id: 'ca-m-bigbang',
      when: 'FRI 16 OCT',
      dayN: '16',
      title: 'BIGBANG world tour',
      near: 'Stadium · 3.1 km',
      seed: {
        format: 'reel',
        pillar: 'Occasion',
        hook: 'Pintxos for the pre-gig crowd.',
        angle: 'Friday, 6pm, pintxos by the stick, out the door by 7:15 for the stadium.',
        feature: 'Pintxos night',
        inspiration: ['ca-p-10', 'ca-p-5'],
        shots: storyboard('The counter at 6', 'Sticks counted', 'Out the door at 7:15'),
        sharper: [
          S('Doors at 8. Pintxos at 6.', 'TIME'),
          S('Pay by the stick, leave by 7:15.', 'NUMBER'),
          S('The pre-show plan: pintxos.', 'SHORTER'),
        ],
      },
    },
    {
      id: 'ca-m-halloween',
      when: 'SAT 31 OCT',
      dayN: '31',
      title: 'Halloween',
      near: 'Joo Chiat',
      seed: {
        format: 'carousel',
        pillar: 'Fun',
        hook: 'Bombas. Literally.',
        angle: 'The bomba as the Halloween prop: fuse, smoke, four frames, the bite at the end.',
        feature: 'Bombas',
        inspiration: ['ca-p-7', 'ca-p-13'],
        shots: storyboard('The fuse', 'The smoke', 'The bite'),
        sharper: [
          S('Light the fuse.', 'SHORTER'),
          S('Bombas with a fuse. Eat fast.', 'TIME'),
          S('The only bomb we serve.', 'VOICE'),
        ],
      },
    },
  ],
}

export const IDEAS_BY_BRAND: Record<BrandId, BrandIdeas> = {
  'casa-vostra': CASA_VOSTRA,
  temper: TEMPER,
  carlitos: CARLITOS,
}

/** Links the team pasted onto the moodboard this session, newest first, so an idea can keep them. */
const pasted: Partial<Record<BrandId, Reference[]>> = {}

export function pastedReferences(brandId: BrandId): Reference[] {
  return pasted[brandId] ?? []
}

export function pasteReference(brandId: BrandId, ref: Reference) {
  pasted[brandId] = [ref, ...pastedReferences(brandId)]
}

/** Every reference a brand has: pasted in, on the shelf, or on a board. */
export function referencesOf(brandId: BrandId): Reference[] {
  const b = IDEAS_BY_BRAND[brandId]
  return [...pastedReferences(brandId), ...b.references, ...b.boards.flatMap((board) => board.pins)]
}

export function referenceById(brandId: BrandId, id: string): Reference | undefined {
  return referencesOf(brandId).find((r) => r.id === id)
}

/** The posts an idea grew from, in the order they were picked. */
export function inspirationOf(brandId: BrandId, card: Pick<IdeaCard, 'inspiration'>): Reference[] {
  return card.inspiration.flatMap((id) => referenceById(brandId, id) ?? [])
}

/** An idea's cover: its own photo, else the first inspiration post that has one. */
export function coverOf(
  brandId: BrandId,
  card: Pick<IdeaCard, 'image' | 'inspiration'>,
): string | undefined {
  return card.image ?? inspirationOf(brandId, card).find((r) => r.image)?.image
}
