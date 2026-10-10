/**
 * The shoots: a date, a start and end time, a place, the people who come and the ideas shot on
 * the day. Static, like `demo.ts`. Each one is a "Shoot" event of a brand's calendar
 * (`demo.ts`, `brands.ts`) with its time added, as the team keeps it in its Lark calendar for
 * content shoots ("today 12:00 to 5:00 PM, a shoot at Petra").
 *
 * Names are invented, apart from the chefs the ideas already name.
 */

import type { BrandId } from './brands'

export interface CrewMember {
  name: string
  role: string
}

export interface Shoot {
  id: string
  /** What the calendar and the call sheet call it: the place in short, "Raffles City". */
  title: string
  /** The day of the demo's month, as the calendar prints it. */
  dayN: string
  /** "12:00" and "17:00", on the 24-hour clock the calendar uses. */
  start: string
  end: string
  /** Where to go, in full. */
  place: string
  crew: CrewMember[]
  /** The ideas shot on the day, in shot-list order. An idea is in one shoot at most. */
  ideaIds: string[]
}

/** A comment a guest left on a shared idea or shoot: a name and the words, no login. */
export interface GuestComment {
  id: string
  name: string
  text: string
  /** As printed: "Yesterday", "Just now". */
  when: string
}

/** The roles a person on a shoot can have, in the order the call sheet offers them. */
export const ROLES = ['Videographer', 'Photographer', 'Chef', 'Producer', 'Talent'] as const

/** Where a new shoot happens until someone changes it: the brand's own room. */
export const HOME: Record<BrandId, string> = {
  'casa-vostra': 'Casa Vostra, Raffles City #01-23',
  temper: 'Temper, 4 Duxton Hill',
  carlitos: 'Carlitos, 212 Joo Chiat Road',
}

/** Who a new shoot invites until someone changes it: the brand's usual crew. */
export const USUAL_CREW: Record<BrandId, CrewMember[]> = {
  'casa-vostra': [
    { name: 'Nat Lim', role: 'Producer' },
    { name: 'Jules Tan', role: 'Videographer' },
    { name: 'Chef Marco', role: 'Chef' },
  ],
  temper: [
    { name: 'Nat Lim', role: 'Producer' },
    { name: 'Jules Tan', role: 'Videographer' },
    { name: 'Lena Koh', role: 'Talent' },
  ],
  carlitos: [
    { name: 'Nat Lim', role: 'Producer' },
    { name: 'Jules Tan', role: 'Videographer' },
    { name: 'Carlos Ruiz', role: 'Chef' },
  ],
}

export const SHOOTS_BY_BRAND: Record<BrandId, Shoot[]> = {
  'casa-vostra': [
    {
      id: 'cv-shoot-raffles',
      title: 'Raffles City',
      dayN: '7',
      start: '12:00',
      end: '17:00',
      place: HOME['casa-vostra'],
      crew: [...USUAL_CREW['casa-vostra'], { name: 'Chef Dani', role: 'Chef' }],
      ideaIds: ['cv-dough', 'cv-carb-up'],
    },
    {
      id: 'cv-shoot-pasta',
      title: 'Pasta day',
      dayN: '21',
      start: '10:00',
      end: '13:00',
      place: HOME['casa-vostra'],
      crew: [
        { name: 'Jules Tan', role: 'Videographer' },
        { name: 'Chef Marco', role: 'Chef' },
      ],
      ideaIds: ['cv-five-pastas', 'cv-st-poll'],
    },
  ],
  temper: [
    {
      id: 'tp-shoot-duxton',
      title: 'Duxton',
      dayN: '6',
      start: '12:00',
      end: '17:00',
      place: HOME.temper,
      crew: USUAL_CREW.temper,
      ideaIds: ['tp-sommelier', 'tp-st-pour'],
    },
    {
      id: 'tp-shoot-wood-fire',
      title: 'Wood fire',
      dayN: '13',
      start: '14:00',
      end: '17:00',
      place: HOME.temper,
      crew: [
        { name: 'Jules Tan', role: 'Videographer' },
        { name: 'Lena Koh', role: 'Talent' },
      ],
      ideaIds: ['tp-one-sip', 'tp-counter'],
    },
    {
      id: 'tp-shoot-cellar',
      title: 'The cellar',
      dayN: '26',
      start: '15:00',
      end: '18:00',
      place: 'Temper cellar, 4 Duxton Hill (basement)',
      crew: USUAL_CREW.temper,
      ideaIds: ['tp-darkest-reds'],
    },
  ],
  carlitos: [
    {
      id: 'ca-shoot-joo-chiat',
      title: 'Joo Chiat',
      dayN: '6',
      start: '16:00',
      end: '19:00',
      place: HOME.carlitos,
      crew: USUAL_CREW.carlitos,
      ideaIds: ['ca-vermut', 'ca-st-street'],
    },
    {
      id: 'ca-shoot-bravas',
      title: 'Bravas',
      dayN: '19',
      start: '11:00',
      end: '14:00',
      place: HOME.carlitos,
      crew: [
        { name: 'Jules Tan', role: 'Videographer' },
        { name: 'Carlos Ruiz', role: 'Chef' },
      ],
      ideaIds: ['ca-under-30', 'ca-st-count'],
    },
  ],
}

/** What guests already said on a link, keyed `shoot:<id>` or `idea:<id>`. */
export const GUEST_COMMENTS: Record<string, GuestComment[]> = {
  'shoot:cv-shoot-raffles': [
    {
      id: 'seed-1',
      name: 'Jules (videographer)',
      text: 'Can we do the dough first, while the window light is soft? The ragù after 3.',
      when: 'Yesterday',
    },
  ],
}
