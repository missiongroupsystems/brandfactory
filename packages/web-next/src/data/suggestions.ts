/**
 * What each brand typed before, so a field can offer it again: the accounts it collaborated with
 * or tagged, the places it tags, its internal labels and its hashtags. Static and invented, like
 * `demo.ts`, apart from the names other files already use (the chefs and staff of `inbox.ts` and
 * `shoots.ts`, the creators of `insights.ts`). Each list is in the order a field offers it: the
 * most recent or most used first.
 */

import type { BrandId } from './brands'
import type { CrewMember } from './shoots'

/** An Instagram account the brand worked with: invited as a collaborator, tagged, or both. */
export interface Account {
  name: string
  handle: string
  /** The day of the last post they were a collaborator on, as printed: "12 Sep". */
  collab?: string
  /** How many posts tagged them. */
  tagged?: number
  /**
   * The profile picture. Instagram returns one only for a business or creator account (Business
   * Discovery, by username, on the brand's own token); a personal account has none, and shows
   * initials. In the demo, one of the brand's own photos stands in.
   */
  picture?: string
}

export const ACCOUNTS: Record<BrandId, Account[]> = {
  'casa-vostra': [
    { name: 'Daniel Ang', handle: '@danielfooddiary', collab: '27 Sep', picture: '/demo/dish.jpg' },
    {
      name: 'Antonio Ferri',
      handle: '@chefantonio',
      collab: '12 Sep',
      tagged: 3,
      picture: '/demo/casa-vostra/tagliatelle.jpg',
    },
    {
      name: 'Sfoglina Bologna',
      handle: '@sfoglina.bologna',
      collab: '2 Aug',
      picture: '/demo/pasta.jpg',
    },
    { name: 'Marco Rossi', handle: '@chefmarco.cv', tagged: 14 },
    { name: 'Giulia Conti', handle: '@giulia.conti', tagged: 6 },
    {
      name: 'Raffles City',
      handle: '@rafflescity',
      tagged: 5,
      picture: '/demo/casa-vostra/wine-night.jpg',
    },
    { name: 'Nat Lim', handle: '@natlim.films', tagged: 3 },
  ],
  temper: [
    {
      name: 'Clara Goh',
      handle: '@winewithclara',
      collab: '30 Sep',
      picture: '/demo/temper/glass.jpg',
    },
    {
      name: 'Maison Vauclair',
      handle: '@maison.vauclair',
      collab: '14 Sep',
      tagged: 2,
      picture: '/demo/temper/pour.jpg',
    },
    {
      name: 'Duxton Hill Collective',
      handle: '@duxtonhill',
      collab: '22 Aug',
      picture: '/demo/temper/room.jpg',
    },
    { name: 'Elise Moreau', handle: '@elise.pours', tagged: 11 },
    { name: 'Lena Koh', handle: '@lenakoh', tagged: 7 },
    { name: 'Sam Lee', handle: '@samlee.sg', tagged: 3 },
  ],
  carlitos: [
    {
      name: 'Farid Rahman',
      handle: '@faridfeeds',
      collab: '3 Oct',
      picture: '/demo/carlitos/croquetas.jpg',
    },
    {
      name: 'Flamenco SG',
      handle: '@flamenco.sg',
      collab: '19 Sep',
      tagged: 4,
      picture: '/demo/carlitos/pintxos.jpg',
    },
    {
      name: 'Carlos Ruiz',
      handle: '@chefcarlosruiz',
      collab: '28 Aug',
      tagged: 8,
      picture: '/demo/carlitos/jamon.jpg',
    },
    { name: 'Lucía Romero', handle: '@lucia.romero', tagged: 9 },
    { name: 'Javier Ortega', handle: '@javi.ortega', tagged: 4 },
  ],
}

/** The places a post was tagged at, after the venue itself (`VENUE` in `publish.ts`). */
export const PLACES: Record<BrandId, Array<{ place: string; posts: number }>> = {
  'casa-vostra': [
    { place: 'Raffles City Shopping Centre', posts: 9 },
    { place: 'Singapore', posts: 4 },
    { place: 'CHIJMES', posts: 2 },
  ],
  temper: [
    { place: 'Duxton Hill', posts: 6 },
    { place: 'Tanjong Pagar', posts: 3 },
    { place: 'Singapore', posts: 2 },
  ],
  carlitos: [
    { place: 'Joo Chiat Road', posts: 7 },
    { place: 'Katong', posts: 4 },
    { place: 'Singapore', posts: 2 },
  ],
}

/** The team's own labels on posts, kept for reports and never published. */
export const LABELS: Record<BrandId, Array<{ label: string; posts: number }>> = {
  'casa-vostra': [
    { label: 'CV_Pizza', posts: 14 },
    { label: 'CV_Pasta', posts: 9 },
    { label: 'F1 weekend', posts: 4 },
    { label: 'Paid boost', posts: 3 },
    { label: 'Creator repost', posts: 2 },
  ],
  temper: [
    { label: 'TMP_Wine', posts: 18 },
    { label: 'TMP_Events', posts: 6 },
    { label: 'F1 weekend', posts: 5 },
    { label: 'Paid boost', posts: 2 },
  ],
  carlitos: [
    { label: 'CAR_Tapas', posts: 12 },
    { label: 'Flamenco Fridays', posts: 7 },
    { label: 'Paid boost', posts: 3 },
    { label: 'F1 weekend', posts: 2 },
  ],
}

/** Hashtags the brand used, after the ones on every post (`HASHTAGS` in `publish.ts`). */
export const USED_HASHTAGS: Record<BrandId, Array<{ tag: string; posts: number }>> = {
  'casa-vostra': [
    { tag: '#rafflescity', posts: 22 },
    { tag: '#sgfood', posts: 15 },
    { tag: '#woodfired', posts: 9 },
    { tag: '#handmadepasta', posts: 7 },
    { tag: '#sgeats', posts: 6 },
  ],
  temper: [
    { tag: '#duxton', posts: 19 },
    { tag: '#naturalwine', posts: 16 },
    { tag: '#sgwine', posts: 8 },
    { tag: '#skincontact', posts: 5 },
    { tag: '#sgnightlife', posts: 4 },
  ],
  carlitos: [
    { tag: '#joochiat', posts: 21 },
    { tag: '#pintxos', posts: 13 },
    { tag: '#sgeats', posts: 9 },
    { tag: '#katong', posts: 6 },
    { tag: '#flamenco', posts: 4 },
  ],
}

/** People from shoots before this month, offered after the crew of this month's shoots. */
export const PAST_CREW: Record<BrandId, CrewMember[]> = {
  'casa-vostra': [
    { name: 'Ivy Chen', role: 'Photographer' },
    { name: 'Giulia Conti', role: 'Chef' },
  ],
  temper: [
    { name: 'Ivy Chen', role: 'Photographer' },
    { name: 'Elise Moreau', role: 'Talent' },
  ],
  carlitos: [
    { name: 'Ravi Menon', role: 'Photographer' },
    { name: 'Lucía Romero', role: 'Chef' },
  ],
}

/** Shoot addresses from before this month, offered after the brand's own room and this month's. */
export const PAST_PLACES: Record<BrandId, string[]> = {
  'casa-vostra': ['Raffles City, atrium (level 1)'],
  temper: ['Duxton Hill, the street outside'],
  carlitos: ['Joo Chiat Road, the shophouse row'],
}
