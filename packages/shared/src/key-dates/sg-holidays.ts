import type { KeyDate } from './types'

// ---------------------------------------------------------------------------
// Set B — Singapore's gazetted holidays and cultural observances
// ---------------------------------------------------------------------------
//
// Two kinds of row, one set, because a marketer does not sort them: what stops
// the country and what changes the mood are the same planning problem.
//
// **The gazetted holidays are announcements, not computations.** MOM gazettes
// them, moon-sighting moves the Hari Raya dates, and a holiday landing on a
// Sunday produces a gazetted Monday no rule predicts. Computing them would mean
// inventing an answer the government has already given.
//
// **The Sunday-substitution Mondays are their own entries** rather than a flag
// on the holiday. A long weekend is the fact a marketer actually plans around,
// and it is not derivable from the holiday row — Vesak 2026 falls on a Sunday
// and yields Monday 1 June; Deepavali 2026 does the same in November.
//
// **The cultural observances are not public holidays** and carry real
// commercial weight anyway. Thaipusam has not been a holiday since 1968 and is
// still one of the most visually distinctive days of the year; the Hungry Ghost
// month changes what a lot of brands are willing to launch.
//
// Ramadan lives in `global.ts` rather than being duplicated here — when both
// sets are on, the Hari Raya Puasa holiday and the Ramadan season read as one
// story.

/** Singapore's Ministry of Manpower — the gazette itself. */
const MOM_2026 = 'https://www.mom.gov.sg/employment-practices/public-holidays'
const MOM_2027 = 'https://www.mom.gov.sg/newsroom/press-releases/2026/0618-public-holidays-for-2027'

/**
 * Hong Kong Observatory's Gregorian-Lunar conversion table.
 *
 * The citable primary behind every Chinese lunisolar row here: Chap Goh Meh is
 * the 15th day of the 1st lunar month, the Hungry Ghost month is the whole 7th,
 * Mid-Autumn is the 15th day of the 8th, and Qingming is the solar term the
 * table prints as *Bright & Clear*. A government astronomical authority
 * publishing a machine-readable table beats a festival blog, and it is the same
 * table for both years.
 */
const HKO_2026 = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt'
const HKO_2027 = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt'

/** The Hindu Endowments Board's Thaipusam site. */
const HEB_THAIPUSAM = 'https://thaipusam.sg/'

export const SG_HOLIDAY_KEY_DATES: KeyDate[] = [
  // --- 2026 ------------------------------------------------------------------
  {
    id: 'sg-holidays/2026-new-years-day',
    set: 'sg-holidays',
    name: "New Year's Day",
    start: '2026-01-01',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-thaipusam',
    set: 'sg-holidays',
    name: 'Thaipusam',
    start: '2026-02-01',
    note: 'Foot procession through Little India; road closures',
    source: HEB_THAIPUSAM,
  },
  {
    id: 'sg-holidays/2026-chinese-new-year',
    set: 'sg-holidays',
    name: 'Chinese New Year',
    start: '2026-02-17',
    end: '2026-02-18',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-chap-goh-meh',
    set: 'sg-holidays',
    name: 'Chap Goh Meh',
    start: '2026-03-03',
    note: '15th day of Chinese New Year — closes the season',
    source: HKO_2026,
  },
  {
    id: 'sg-holidays/2026-hari-raya-puasa',
    set: 'sg-holidays',
    name: 'Hari Raya Puasa',
    start: '2026-03-21',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-good-friday',
    set: 'sg-holidays',
    name: 'Good Friday',
    start: '2026-04-03',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-qingming',
    set: 'sg-holidays',
    name: 'Qingming',
    start: '2026-04-05',
    note: 'Tomb-sweeping',
    source: HKO_2026,
  },
  {
    id: 'sg-holidays/2026-labour-day',
    set: 'sg-holidays',
    name: 'Labour Day',
    start: '2026-05-01',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-hari-raya-haji',
    set: 'sg-holidays',
    name: 'Hari Raya Haji',
    start: '2026-05-27',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-vesak-day',
    set: 'sg-holidays',
    name: 'Vesak Day',
    start: '2026-05-31',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-vesak-day-observed',
    set: 'sg-holidays',
    name: 'Vesak Day (observed)',
    start: '2026-06-01',
    note: 'Public holiday in lieu — long weekend',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-national-day',
    set: 'sg-holidays',
    name: 'National Day',
    start: '2026-08-09',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-national-day-observed',
    set: 'sg-holidays',
    name: 'National Day (observed)',
    start: '2026-08-10',
    note: 'Public holiday in lieu — long weekend',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-hungry-ghost',
    set: 'sg-holidays',
    name: 'Hungry Ghost Festival',
    start: '2026-08-13',
    end: '2026-09-10',
    note: 'Season — the 7th lunar month. Launch-sensitive',
    source: HKO_2026,
  },
  {
    id: 'sg-holidays/2026-mid-autumn',
    set: 'sg-holidays',
    name: 'Mid-Autumn Festival',
    start: '2026-09-25',
    note: 'Mooncake season runs roughly six weeks ahead of it',
    source: HKO_2026,
  },
  {
    id: 'sg-holidays/2026-deepavali',
    set: 'sg-holidays',
    name: 'Deepavali',
    start: '2026-11-08',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-deepavali-observed',
    set: 'sg-holidays',
    name: 'Deepavali (observed)',
    start: '2026-11-09',
    note: 'Public holiday in lieu — long weekend',
    source: MOM_2026,
  },
  {
    id: 'sg-holidays/2026-christmas-day',
    set: 'sg-holidays',
    name: 'Christmas Day',
    start: '2026-12-25',
    source: MOM_2026,
  },

  // --- 2027 ------------------------------------------------------------------
  //
  // Thaipusam 2027 is **deliberately absent**: sources disagree between
  // 22 January and 1 February, the Hindu Endowments Board has not announced it,
  // and a wrong date renders exactly like a right one. It returns when HEB does.
  {
    id: 'sg-holidays/2027-new-years-day',
    set: 'sg-holidays',
    name: "New Year's Day",
    start: '2027-01-01',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-chinese-new-year',
    set: 'sg-holidays',
    name: 'Chinese New Year',
    start: '2027-02-06',
    end: '2027-02-07',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-chinese-new-year-observed',
    set: 'sg-holidays',
    name: 'Chinese New Year (observed)',
    start: '2027-02-08',
    note: 'Public holiday in lieu — long weekend',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-chap-goh-meh',
    set: 'sg-holidays',
    name: 'Chap Goh Meh',
    start: '2027-02-20',
    note: '15th day of Chinese New Year — closes the season',
    source: HKO_2027,
  },
  {
    id: 'sg-holidays/2027-hari-raya-puasa',
    set: 'sg-holidays',
    name: 'Hari Raya Puasa',
    start: '2027-03-10',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-good-friday',
    set: 'sg-holidays',
    name: 'Good Friday',
    start: '2027-03-26',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-qingming',
    set: 'sg-holidays',
    name: 'Qingming',
    start: '2027-04-05',
    note: 'Tomb-sweeping',
    source: HKO_2027,
  },
  {
    id: 'sg-holidays/2027-labour-day',
    set: 'sg-holidays',
    name: 'Labour Day',
    start: '2027-05-01',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-hari-raya-haji',
    set: 'sg-holidays',
    name: 'Hari Raya Haji',
    start: '2027-05-17',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-vesak-day',
    set: 'sg-holidays',
    name: 'Vesak Day',
    start: '2027-05-20',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-hungry-ghost',
    set: 'sg-holidays',
    name: 'Hungry Ghost Festival',
    start: '2027-08-02',
    end: '2027-08-31',
    note: 'Season — the 7th lunar month. Launch-sensitive',
    source: HKO_2027,
  },
  {
    id: 'sg-holidays/2027-national-day',
    set: 'sg-holidays',
    name: 'National Day',
    start: '2027-08-09',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-mid-autumn',
    set: 'sg-holidays',
    name: 'Mid-Autumn Festival',
    start: '2027-09-15',
    note: 'Mooncake season runs roughly six weeks ahead of it',
    source: HKO_2027,
  },
  {
    id: 'sg-holidays/2027-deepavali',
    set: 'sg-holidays',
    name: 'Deepavali',
    start: '2027-10-28',
    source: MOM_2027,
  },
  {
    id: 'sg-holidays/2027-christmas-day',
    set: 'sg-holidays',
    name: 'Christmas Day',
    start: '2027-12-25',
    source: MOM_2027,
  },
]
