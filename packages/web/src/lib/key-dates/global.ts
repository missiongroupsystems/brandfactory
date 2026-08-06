import type { KeyDate } from './types'

// ---------------------------------------------------------------------------
// Set A — the international commercial year
// ---------------------------------------------------------------------------
//
// Deliberately e-commerce and Western weighted. That is what this set is *for*;
// `sg-holidays.ts` is where the local religious calendar lives. A brand in any
// market can leave this one on without it being wrong, which is why it is the
// one on by default.
//
// Chronological within each year, which is the order a curator reads and the
// order that makes the last row visibly the horizon.
//
// Five rows here are also gazetted in `sg-holidays.ts` — New Year's Day,
// Chinese New Year, Good Friday, Labour Day, Christmas Day. That duplication is
// deliberate: each set has to stand alone for a brand that enables only one.
// The names must stay **spelled identically** across the two files or
// `keyDatesForSets` will stop collapsing them and show Christmas twice.

/** Hong Kong Observatory's Gregorian-Lunar conversion table — the lunar rows. */
const HKO_2026 = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt'
const HKO_2027 = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt'

/** Singapore's Ministry of Manpower — Good Friday's date, which moves. */
const MOM_2026 = 'https://www.mom.gov.sg/employment-practices/public-holidays'
const MOM_2027 = 'https://www.mom.gov.sg/newsroom/press-releases/2026/0618-public-holidays-for-2027'

/** The Mufti of Singapore's announcement of the start of Ramadan 1447H. */
const MUIS_RAMADAN_2026 =
  'https://www.muis.gov.sg/resources/media-releases/announcement-by-mufti-for-the-month-of-ramadan-1447h-2026-for-singapore/'

export const GLOBAL_KEY_DATES: KeyDate[] = [
  // --- 2026 ------------------------------------------------------------------
  {
    id: 'global/2026-new-years-day',
    set: 'global',
    name: "New Year's Day",
    start: '2026-01-01',
    source: 'Fixed: 1 January',
  },
  {
    id: 'global/2026-valentines-day',
    set: 'global',
    name: "Valentine's Day",
    start: '2026-02-14',
    source: 'Fixed: 14 February',
  },
  {
    id: 'global/2026-chinese-new-year',
    set: 'global',
    name: 'Chinese New Year',
    start: '2026-02-17',
    end: '2026-02-18',
    note: 'Global retail moment; also gazetted in Singapore holidays',
    source: HKO_2026,
  },
  {
    id: 'global/2026-ramadan',
    set: 'global',
    name: 'Ramadan',
    start: '2026-02-19',
    end: '2026-03-20',
    note: 'Season. Begins and ends on the moon sighting',
    source: MUIS_RAMADAN_2026,
  },
  {
    id: 'global/2026-international-womens-day',
    set: 'global',
    name: "International Women's Day",
    start: '2026-03-08',
    source: 'Fixed: 8 March',
  },
  {
    id: 'global/2026-good-friday',
    set: 'global',
    name: 'Good Friday',
    start: '2026-04-03',
    source: MOM_2026,
  },
  {
    id: 'global/2026-easter-sunday',
    set: 'global',
    name: 'Easter Sunday',
    start: '2026-04-05',
    source: 'Western computus; Good Friday + 2 days',
  },
  {
    id: 'global/2026-earth-day',
    set: 'global',
    name: 'Earth Day',
    start: '2026-04-22',
    source: 'Fixed: 22 April',
  },
  {
    id: 'global/2026-labour-day',
    set: 'global',
    name: 'Labour Day',
    start: '2026-05-01',
    source: 'Fixed: 1 May',
  },
  {
    id: 'global/2026-mothers-day',
    set: 'global',
    name: "Mother's Day",
    start: '2026-05-10',
    note: 'US and Singapore convention',
    source: 'Fixed: 2nd Sunday in May',
  },
  {
    id: 'global/2026-pride-month',
    set: 'global',
    name: 'Pride Month',
    start: '2026-06-01',
    end: '2026-06-30',
    note: 'Season',
    source: 'Fixed: the month of June',
  },
  {
    id: 'global/2026-fathers-day',
    set: 'global',
    name: "Father's Day",
    start: '2026-06-21',
    source: 'Fixed: 3rd Sunday in June',
  },
  {
    id: 'global/2026-9-9-sale',
    set: 'global',
    name: '9.9 sale',
    start: '2026-09-09',
    source: 'Fixed: 9 September',
  },
  {
    id: 'global/2026-10-10-sale',
    set: 'global',
    name: '10.10 sale',
    start: '2026-10-10',
    source: 'Fixed: 10 October',
  },
  {
    id: 'global/2026-halloween',
    set: 'global',
    name: 'Halloween',
    start: '2026-10-31',
    source: 'Fixed: 31 October',
  },
  {
    id: 'global/2026-singles-day',
    set: 'global',
    name: "Singles' Day (11.11)",
    start: '2026-11-11',
    source: 'Fixed: 11 November',
  },
  {
    id: 'global/2026-thanksgiving',
    set: 'global',
    name: 'Thanksgiving (US)',
    start: '2026-11-26',
    source: 'Fixed: 4th Thursday in November',
  },
  {
    id: 'global/2026-black-friday',
    set: 'global',
    name: 'Black Friday',
    start: '2026-11-27',
    source: 'Fixed: the day after US Thanksgiving',
  },
  {
    id: 'global/2026-cyber-monday',
    set: 'global',
    name: 'Cyber Monday',
    start: '2026-11-30',
    source: 'Fixed: the Monday after US Thanksgiving',
  },
  {
    id: 'global/2026-12-12-sale',
    set: 'global',
    name: '12.12 sale',
    start: '2026-12-12',
    source: 'Fixed: 12 December',
  },
  {
    id: 'global/2026-christmas-day',
    set: 'global',
    name: 'Christmas Day',
    start: '2026-12-25',
    source: 'Fixed: 25 December',
  },
  {
    id: 'global/2026-boxing-day',
    set: 'global',
    name: 'Boxing Day',
    start: '2026-12-26',
    source: 'Fixed: 26 December',
  },
  {
    id: 'global/2026-new-years-eve',
    set: 'global',
    name: "New Year's Eve",
    start: '2026-12-31',
    source: 'Fixed: 31 December',
  },

  // --- 2027 ------------------------------------------------------------------
  //
  // Ramadan 2027 is **deliberately absent**. Its end is fixed by the gazetted
  // Hari Raya Puasa (10 March 2027), but a Ramadan is 29 or 30 days, so
  // back-computing the start gives 9 *or* 10 February — and MUIS announces the
  // real answer on the moon sighting two days ahead. A guessed start renders
  // exactly like a gazetted one, so the row waits for the announcement.
  {
    id: 'global/2027-new-years-day',
    set: 'global',
    name: "New Year's Day",
    start: '2027-01-01',
    source: 'Fixed: 1 January',
  },
  {
    id: 'global/2027-chinese-new-year',
    set: 'global',
    name: 'Chinese New Year',
    start: '2027-02-06',
    end: '2027-02-07',
    note: 'Global retail moment; also gazetted in Singapore holidays',
    source: HKO_2027,
  },
  {
    id: 'global/2027-valentines-day',
    set: 'global',
    name: "Valentine's Day",
    start: '2027-02-14',
    source: 'Fixed: 14 February',
  },
  {
    id: 'global/2027-international-womens-day',
    set: 'global',
    name: "International Women's Day",
    start: '2027-03-08',
    source: 'Fixed: 8 March',
  },
  {
    id: 'global/2027-good-friday',
    set: 'global',
    name: 'Good Friday',
    start: '2027-03-26',
    source: MOM_2027,
  },
  {
    id: 'global/2027-easter-sunday',
    set: 'global',
    name: 'Easter Sunday',
    start: '2027-03-28',
    source: 'Western computus; Good Friday + 2 days',
  },
  {
    id: 'global/2027-earth-day',
    set: 'global',
    name: 'Earth Day',
    start: '2027-04-22',
    source: 'Fixed: 22 April',
  },
  {
    id: 'global/2027-labour-day',
    set: 'global',
    name: 'Labour Day',
    start: '2027-05-01',
    source: 'Fixed: 1 May',
  },
  {
    id: 'global/2027-mothers-day',
    set: 'global',
    name: "Mother's Day",
    start: '2027-05-09',
    note: 'US and Singapore convention',
    source: 'Fixed: 2nd Sunday in May',
  },
  {
    id: 'global/2027-pride-month',
    set: 'global',
    name: 'Pride Month',
    start: '2027-06-01',
    end: '2027-06-30',
    note: 'Season',
    source: 'Fixed: the month of June',
  },
  {
    id: 'global/2027-fathers-day',
    set: 'global',
    name: "Father's Day",
    start: '2027-06-20',
    source: 'Fixed: 3rd Sunday in June',
  },
  {
    id: 'global/2027-9-9-sale',
    set: 'global',
    name: '9.9 sale',
    start: '2027-09-09',
    source: 'Fixed: 9 September',
  },
  {
    id: 'global/2027-10-10-sale',
    set: 'global',
    name: '10.10 sale',
    start: '2027-10-10',
    source: 'Fixed: 10 October',
  },
  {
    id: 'global/2027-halloween',
    set: 'global',
    name: 'Halloween',
    start: '2027-10-31',
    source: 'Fixed: 31 October',
  },
  {
    id: 'global/2027-singles-day',
    set: 'global',
    name: "Singles' Day (11.11)",
    start: '2027-11-11',
    source: 'Fixed: 11 November',
  },
  {
    id: 'global/2027-thanksgiving',
    set: 'global',
    name: 'Thanksgiving (US)',
    start: '2027-11-25',
    source: 'Fixed: 4th Thursday in November',
  },
  {
    id: 'global/2027-black-friday',
    set: 'global',
    name: 'Black Friday',
    start: '2027-11-26',
    source: 'Fixed: the day after US Thanksgiving',
  },
  {
    id: 'global/2027-cyber-monday',
    set: 'global',
    name: 'Cyber Monday',
    start: '2027-11-29',
    source: 'Fixed: the Monday after US Thanksgiving',
  },
  {
    id: 'global/2027-12-12-sale',
    set: 'global',
    name: '12.12 sale',
    start: '2027-12-12',
    source: 'Fixed: 12 December',
  },
  {
    id: 'global/2027-christmas-day',
    set: 'global',
    name: 'Christmas Day',
    start: '2027-12-25',
    source: 'Fixed: 25 December',
  },
  {
    id: 'global/2027-boxing-day',
    set: 'global',
    name: 'Boxing Day',
    start: '2027-12-26',
    source: 'Fixed: 26 December',
  },
  {
    id: 'global/2027-new-years-eve',
    set: 'global',
    name: "New Year's Eve",
    start: '2027-12-31',
    source: 'Fixed: 31 December',
  },
]
