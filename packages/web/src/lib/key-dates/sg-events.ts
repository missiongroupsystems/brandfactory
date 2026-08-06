import type { KeyDate } from './types'

// ---------------------------------------------------------------------------
// Set C — Singapore's events calendar
// ---------------------------------------------------------------------------
//
// Pop-cultural, commercial and trade: the year-to-year mutable half. Consumer
// *and* B2B by decision — ATxSG and the Fintech Festival sit beside F1 and the
// festivals, because the set is "what a Singapore marketer keeps on their
// radar", and for a B2B brand that is a conference.
//
// **This is the set with the short horizon.** Everything below is 2026: as of
// August 2026 the 2027 editions are largely unannounced, which is exactly why
// `CURATED_THROUGH` is per set rather than shared. When the cursor passes the
// horizon the calendar says so — that line is not decoration, it is this set's
// shelf life made visible.
//
// **The Great Singapore Sale is deliberately absent.** It was a genuine anchor
// when the Singapore Retailers Association set island-wide dates; it no longer
// does, each mall runs its own window, and the 2026 sources contradict each
// other on whether it is a July retail festival or a May-to-July season. A row
// whose dates are invented reads exactly like a row whose dates are gazetted,
// and that is the confusion worth avoiding. If a citable central window
// reappears, it comes back.
//
// Two more rows were dropped on the same rule at curation time — the Singapore
// Food Festival and the Orchard Road Christmas light-up. Both are named in the
// Phase A completion note with what would bring them back.

const ART_WEEK = 'https://www.artweek.sg/'
const AIRSHOW = 'https://www.singaporeairshow.com/'
const CHINGAY = 'https://www.chingay.gov.sg/'
const ATXSG = 'https://asiatechxsg.com/'
const I_LIGHT = 'https://www.ilightsingapore.gov.sg/'
const GRILLFEST = 'https://www.sentosa.gov.sg/resources/sentosa-grillfest-2026-returns/'
const NDP = 'https://www.ndp.gov.sg/'
const NIGHT_FESTIVAL = 'https://www.nightfestival.gov.sg/'
const SINGAPORE_GP = 'https://singaporegp.sg/en/'
const WRITERS_FESTIVAL = 'https://www.singaporewritersfestival.com/'
const FINTECH_FESTIVAL = 'https://www.fintechfestival.sg/'
const MARATHON = 'https://singaporeinternationalmarathon.com/'
const MARINA_BAY = 'https://www.marinabaysingapore.com/'

export const SG_EVENT_KEY_DATES: KeyDate[] = [
  {
    id: 'sg-events/2026-singapore-art-week',
    set: 'sg-events',
    name: 'Singapore Art Week',
    start: '2026-01-22',
    end: '2026-01-31',
    note: 'Season',
    source: ART_WEEK,
  },
  {
    id: 'sg-events/2026-singapore-airshow',
    set: 'sg-events',
    name: 'Singapore Airshow',
    start: '2026-02-03',
    end: '2026-02-08',
    note: 'Biennial — the next edition is 2028',
    source: AIRSHOW,
  },
  {
    id: 'sg-events/2026-chingay-parade',
    set: 'sg-events',
    name: 'Chingay Parade',
    start: '2026-02-27',
    end: '2026-02-28',
    note: 'Follows Chinese New Year',
    source: CHINGAY,
  },
  {
    id: 'sg-events/2026-atxsg',
    set: 'sg-events',
    name: 'Asia Tech x Singapore (ATxSG)',
    start: '2026-05-20',
    end: '2026-05-22',
    source: ATXSG,
  },
  {
    id: 'sg-events/2026-i-light',
    set: 'sg-events',
    name: 'i Light Singapore',
    start: '2026-06-05',
    end: '2026-06-28',
    note: 'Season, Marina Bay',
    source: I_LIGHT,
  },
  {
    id: 'sg-events/2026-sentosa-grillfest',
    set: 'sg-events',
    name: 'Sentosa GrillFest',
    start: '2026-07-23',
    end: '2026-08-16',
    note: 'Season',
    source: GRILLFEST,
  },
  {
    id: 'sg-events/2026-national-day-parade',
    set: 'sg-events',
    name: 'National Day Parade',
    start: '2026-08-09',
    note: 'National Stadium',
    source: NDP,
  },
  {
    id: 'sg-events/2026-singapore-night-festival',
    set: 'sg-events',
    name: 'Singapore Night Festival',
    start: '2026-08-21',
    end: '2026-09-05',
    note: 'Season, Bras Basah.Bugis',
    source: NIGHT_FESTIVAL,
  },
  {
    id: 'sg-events/2026-grand-prix-season',
    set: 'sg-events',
    name: 'Grand Prix Season Singapore',
    start: '2026-10-02',
    end: '2026-10-11',
    note: 'Season — concerts and fringe around the race',
    source: SINGAPORE_GP,
  },
  {
    id: 'sg-events/2026-f1-singapore-grand-prix',
    set: 'sg-events',
    name: 'F1 Singapore Grand Prix',
    start: '2026-10-09',
    end: '2026-10-11',
    note: 'The race weekend itself',
    source: SINGAPORE_GP,
  },
  {
    id: 'sg-events/2026-singapore-writers-festival',
    set: 'sg-events',
    name: 'Singapore Writers Festival',
    start: '2026-11-13',
    end: '2026-11-22',
    note: 'Season',
    source: WRITERS_FESTIVAL,
  },
  {
    id: 'sg-events/2026-singapore-fintech-festival',
    set: 'sg-events',
    name: 'Singapore Fintech Festival',
    start: '2026-11-18',
    end: '2026-11-20',
    source: FINTECH_FESTIVAL,
  },
  {
    id: 'sg-events/2026-singapore-international-marathon',
    set: 'sg-events',
    name: 'BYD Singapore International Marathon',
    start: '2026-12-04',
    end: '2026-12-06',
    note: 'Retitled from Standard Chartered for 2026',
    source: MARATHON,
  },
  {
    id: 'sg-events/2026-marina-bay-countdown',
    set: 'sg-events',
    name: 'Marina Bay Singapore Countdown',
    start: '2026-12-31',
    source: MARINA_BAY,
  },
]
