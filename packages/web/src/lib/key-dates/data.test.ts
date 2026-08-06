import { describe, expect, it } from 'vitest'
import { dayKeyToDate, localDayKey } from '../calendar'
import {
  ALL_KEY_DATES,
  CURATED_THROUGH,
  GLOBAL_KEY_DATES,
  KEY_DATE_SETS,
  KEY_DATE_SET_DESCRIPTIONS,
  KEY_DATE_SET_LABELS,
  SG_EVENT_KEY_DATES,
  SG_HOLIDAY_KEY_DATES,
  type KeyDate,
  type KeyDateSet,
} from './index'

// ---------------------------------------------------------------------------
// The dataset's integrity — the tests that matter most in this feature
// ---------------------------------------------------------------------------
//
// A wrong date ships silently and looks like a feature working. Nothing here
// can catch a date that is simply *incorrect* — that is what the required
// `source` field and the drop-rather-than-guess curation rule are for — but
// everything that *is* mechanically checkable is checked here.
//
// **No assertion in this file reads the current date.** A test asserting the
// horizon is still in the future passes today and fails on an unrelated Tuesday
// in 2028, which trains people to ignore it. Staleness is surfaced in the UI,
// where a person can act on it; here the horizon is asserted against the data.

/** The per-set arrays, paired with the `set` every entry in them must carry. */
const FILES: ReadonlyArray<readonly [KeyDateSet, KeyDate[]]> = [
  ['global', GLOBAL_KEY_DATES],
  ['sg-holidays', SG_HOLIDAY_KEY_DATES],
  ['sg-events', SG_EVENT_KEY_DATES],
]

/** The last day an entry occupies — a season's `end`, a single day's `start`. */
const lastDay = (d: KeyDate) => d.end ?? d.start

describe('the dataset', () => {
  it('is not accidentally empty', () => {
    // Guards every `for … of` assertion below: a suite that iterates an empty
    // array passes loudly and proves nothing.
    expect(ALL_KEY_DATES.length).toBeGreaterThan(80)
    for (const [, entries] of FILES) expect(entries.length).toBeGreaterThan(0)
  })

  it('parses every start and every end as a real day key', () => {
    // `dayKeyToDate` round-trips the parts, so this also rejects `2026-02-30`
    // and `2027-13-01` — a normalised `Date` is not a valid date here.
    for (const entry of ALL_KEY_DATES) {
      expect(dayKeyToDate(entry.start), `${entry.id} start ${entry.start}`).not.toBeNull()
      if (entry.end !== undefined) {
        expect(dayKeyToDate(entry.end), `${entry.id} end ${entry.end}`).not.toBeNull()
      }
    }
  })

  it('carries an end only when it is strictly after the start', () => {
    // `end === start` would be a single day wearing a season's shape, and
    // `splitByShape` would put it in the strip instead of its own cell.
    for (const entry of ALL_KEY_DATES) {
      if (entry.end === undefined) continue
      expect(entry.end > entry.start, `${entry.id} ${entry.start}..${entry.end}`).toBe(true)
    }
  })

  it('gives every entry an id that is unique across all three sets', () => {
    // Ids are the React keys, and the same observance really does exist in two
    // sets — a collision would drop a row from the render rather than error.
    const ids = ALL_KEY_DATES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every entry a non-empty source', () => {
    for (const entry of ALL_KEY_DATES) {
      expect(entry.source.trim(), `${entry.id}`).not.toBe('')
    }
  })

  it('gives every entry a non-empty name', () => {
    // The name is half the dedupe key, so a blank one would silently collapse
    // every same-day entry across two sets into one.
    for (const entry of ALL_KEY_DATES) {
      expect(entry.name.trim(), `${entry.id}`).not.toBe('')
    }
  })

  it('labels every entry with the set of the file it came from', () => {
    for (const [set, entries] of FILES) {
      for (const entry of entries) {
        expect(entry.set, `${entry.id}`).toBe(set)
        expect(entry.id.startsWith(`${set}/`), `${entry.id}`).toBe(true)
      }
    }
  })

  it('accounts for every entry exactly once in ALL_KEY_DATES', () => {
    const flattened = FILES.reduce((n, [, entries]) => n + entries.length, 0)
    expect(ALL_KEY_DATES.length).toBe(flattened)
  })

  it('concatenates ALL_KEY_DATES in KEY_DATE_SETS order', () => {
    // Not cosmetic: `keyDatesForSets` keeps the first of a duplicated pair, so
    // this order *is* the precedence rule that makes `global` win Christmas.
    const order = ALL_KEY_DATES.map((e) => e.set)
    const firstAppearance = KEY_DATE_SETS.map((set) => order.indexOf(set))
    expect(firstAppearance).toEqual([...firstAppearance].sort((a, b) => a - b))
    // and no set is interleaved with another
    expect(order).toEqual(KEY_DATE_SETS.flatMap((set) => order.filter((s) => s === set)))
  })
})

describe('the curation horizon', () => {
  it('covers every entry in its set', () => {
    for (const entry of ALL_KEY_DATES) {
      expect(lastDay(entry) <= CURATED_THROUGH[entry.set], `${entry.id}`).toBe(true)
    }
  })

  it('equals the last day actually curated, for each set', () => {
    // The other direction, and the one that catches the real drift: a horizon
    // moved to 2028 without the data behind it would pass the test above and
    // fail here. Together they pin the horizon to the dataset exactly.
    for (const [set, entries] of FILES) {
      const max = entries.map(lastDay).reduce((a, b) => (a > b ? a : b))
      expect(CURATED_THROUGH[set], set).toBe(max)
    }
  })

  it('runs the events set a year shorter than the two holiday sets', () => {
    // The finding that made the horizon per-set rather than shared: MOM
    // gazetted 2027's holidays in June 2026, while almost no 2027 event has
    // been announced. One shared horizon would have to lie in one direction.
    expect(CURATED_THROUGH.global.slice(0, 4)).toBe('2027')
    expect(CURATED_THROUGH['sg-holidays'].slice(0, 4)).toBe('2027')
    expect(CURATED_THROUGH['sg-events'].slice(0, 4)).toBe('2026')
  })
})

describe('the set maps', () => {
  it('label and describe exactly the declared sets', () => {
    // `Record<KeyDateSet, …>` makes a missing key a type error; this catches
    // the other half — a stale key left behind after a set is renamed.
    expect(Object.keys(KEY_DATE_SET_LABELS).sort()).toEqual([...KEY_DATE_SETS].sort())
    expect(Object.keys(KEY_DATE_SET_DESCRIPTIONS).sort()).toEqual([...KEY_DATE_SETS].sort())
    expect(Object.keys(CURATED_THROUGH).sort()).toEqual([...KEY_DATE_SETS].sort())
  })

  it('gives every set a non-empty label and description', () => {
    for (const set of KEY_DATE_SETS) {
      expect(KEY_DATE_SET_LABELS[set].trim()).not.toBe('')
      expect(KEY_DATE_SET_DESCRIPTIONS[set].trim()).not.toBe('')
    }
  })
})

// ---------------------------------------------------------------------------
// The gazetted holidays, pinned directly
// ---------------------------------------------------------------------------
//
// The one table in this dataset with a single authoritative source — Singapore's
// Ministry of Manpower — so it is worth spelling out rather than deriving.
// Every date below was read off MOM's own pages, not computed from anything.
//
// Singapore gazettes **eleven public holiday days** a year; ten *named*
// holidays, because Chinese New Year spans two. The dataset carries Chinese New
// Year as one entry with an `end`, so ten rows here describe eleven days.

interface Gazetted {
  name: string
  start: string
  end?: string
}

const GAZETTED: readonly Gazetted[] = [
  // 2026
  { name: "New Year's Day", start: '2026-01-01' },
  { name: 'Chinese New Year', start: '2026-02-17', end: '2026-02-18' },
  { name: 'Hari Raya Puasa', start: '2026-03-21' },
  { name: 'Good Friday', start: '2026-04-03' },
  { name: 'Labour Day', start: '2026-05-01' },
  { name: 'Hari Raya Haji', start: '2026-05-27' },
  { name: 'Vesak Day', start: '2026-05-31' },
  { name: 'National Day', start: '2026-08-09' },
  { name: 'Deepavali', start: '2026-11-08' },
  { name: 'Christmas Day', start: '2026-12-25' },
  // 2027
  { name: "New Year's Day", start: '2027-01-01' },
  { name: 'Chinese New Year', start: '2027-02-06', end: '2027-02-07' },
  { name: 'Hari Raya Puasa', start: '2027-03-10' },
  { name: 'Good Friday', start: '2027-03-26' },
  { name: 'Labour Day', start: '2027-05-01' },
  { name: 'Hari Raya Haji', start: '2027-05-17' },
  { name: 'Vesak Day', start: '2027-05-20' },
  { name: 'National Day', start: '2027-08-09' },
  { name: 'Deepavali', start: '2027-10-28' },
  { name: 'Christmas Day', start: '2027-12-25' },
]

/** The Mondays MOM gazettes when a holiday lands on a Sunday. */
const IN_LIEU: readonly Gazetted[] = [
  { name: 'Vesak Day (observed)', start: '2026-06-01' },
  { name: 'National Day (observed)', start: '2026-08-10' },
  { name: 'Deepavali (observed)', start: '2026-11-09' },
  { name: 'Chinese New Year (observed)', start: '2027-02-08' },
]

describe('the gazetted Singapore public holidays', () => {
  const find = (name: string, start: string) =>
    SG_HOLIDAY_KEY_DATES.find((e) => e.name === name && e.start === start)

  it('gazettes ten named holidays a year, both years', () => {
    // Ten named, eleven *days*: Chinese New Year spans two, and the dataset
    // carries it as one entry with an `end`.
    expect(GAZETTED).toHaveLength(20)
  })

  it.each(GAZETTED)('gazettes $name on $start', ({ name, start, end }) => {
    const entry = find(name, start)
    expect(entry, `${name} ${start}`).toBeDefined()
    expect(entry?.end).toBe(end)
  })

  it.each(IN_LIEU)('gazettes $name on $start', ({ name, start }) => {
    // Their own entries rather than a flag on the holiday: a long weekend is
    // the fact a marketer plans around, and it is not derivable from the
    // holiday row.
    const entry = find(name, start)
    expect(entry, `${name} ${start}`).toBeDefined()
    expect(entry?.end).toBeUndefined()
  })

  it('carries no other holiday-in-lieu entries', () => {
    const observed = SG_HOLIDAY_KEY_DATES.filter((e) => e.name.includes('(observed)'))
    expect(observed.map((e) => e.start).sort()).toEqual(IN_LIEU.map((g) => g.start).sort())
  })

  it('spells the five shared observances the same way the global set does', () => {
    // The dedupe key is `start` + `name`, so these two files agreeing on the
    // spelling is a contract, not a style preference. A stray apostrophe here
    // shows Christmas twice on a calendar with both sets on.
    const shared = [
      "New Year's Day",
      'Chinese New Year',
      'Good Friday',
      'Labour Day',
      'Christmas Day',
    ]
    for (const name of shared) {
      const inGlobal = GLOBAL_KEY_DATES.filter((e) => e.name === name).map((e) => e.start)
      const inHolidays = SG_HOLIDAY_KEY_DATES.filter((e) => e.name === name).map((e) => e.start)
      expect(inGlobal.length, name).toBeGreaterThan(0)
      expect(inHolidays.length, name).toBeGreaterThan(0)
      // Every shared name that exists in both must overlap on at least one day,
      // or the "duplicate" is two unrelated rows wearing one name.
      expect(
        inGlobal.some((s) => inHolidays.includes(s)),
        name,
      ).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The rows whose source states a rule
// ---------------------------------------------------------------------------
//
// Most of this dataset is unfalsifiable from inside the repo — Deepavali is on
// 8 November 2026 because MOM says so, and no assertion here can know that.
// But twelve rows carry a `source` that is a **rule rather than a link**
// (`Fixed: 4th Thursday in November`), and a rule is checkable. Those twelve
// are the ones a curator hand-writes for a new year with nothing to look up,
// which makes them the likeliest place for a slipped date — and until now the
// file's opening claim to check "everything that *is* mechanically checkable"
// did not quite hold.
//
// This is deliberately **not** a rule engine creeping in through the tests. The
// data stays literal and hand-curated; this only asserts that the literal
// agrees with the rule its own `source` field claims for it.

/** The nth `weekday` of a month — `month` 1-based, `weekday` Sunday-0. */
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): string {
  let seen = 0
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month - 1, d)
    if (date.getMonth() !== month - 1) break
    if (date.getDay() !== weekday) continue
    if (++seen === n) return localDayKey(date)
  }
  throw new Error(`no ${n}th weekday ${weekday} in ${year}-${month}`)
}

/** A day key shifted by whole days, walking the local calendar. */
function addDays(dayKey: string, delta: number): string {
  const date = dayKeyToDate(dayKey)
  if (!date) throw new Error(`unparseable ${dayKey}`)
  return localDayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta))
}

const RULED: ReadonlyArray<{ name: string; year: number; expected: () => string }> = [
  { name: "Mother's Day", year: 2026, expected: () => nthWeekdayOf(2026, 5, 0, 2) },
  { name: "Mother's Day", year: 2027, expected: () => nthWeekdayOf(2027, 5, 0, 2) },
  { name: "Father's Day", year: 2026, expected: () => nthWeekdayOf(2026, 6, 0, 3) },
  { name: "Father's Day", year: 2027, expected: () => nthWeekdayOf(2027, 6, 0, 3) },
  { name: 'Thanksgiving (US)', year: 2026, expected: () => nthWeekdayOf(2026, 11, 4, 4) },
  { name: 'Thanksgiving (US)', year: 2027, expected: () => nthWeekdayOf(2027, 11, 4, 4) },
  // Anchored to Thanksgiving rather than to the stored Thanksgiving row, so a
  // wrong Thanksgiving cannot drag its two dependants into agreeing with it.
  { name: 'Black Friday', year: 2026, expected: () => addDays(nthWeekdayOf(2026, 11, 4, 4), 1) },
  { name: 'Black Friday', year: 2027, expected: () => addDays(nthWeekdayOf(2027, 11, 4, 4), 1) },
  { name: 'Cyber Monday', year: 2026, expected: () => addDays(nthWeekdayOf(2026, 11, 4, 4), 4) },
  { name: 'Cyber Monday', year: 2027, expected: () => addDays(nthWeekdayOf(2027, 11, 4, 4), 4) },
]

describe('the rows whose source states a rule', () => {
  it.each(RULED)('puts $name $year where its rule puts it', ({ name, year, expected }) => {
    const entry = GLOBAL_KEY_DATES.find((e) => e.name === name && e.start.startsWith(String(year)))
    expect(entry, `${name} ${year}`).toBeDefined()
    expect(entry?.start).toBe(expected())
  })

  it('puts Easter Sunday two days after its own Good Friday, both years', () => {
    // The one pair whose rule relates two rows rather than a row to the
    // calendar: the computus is not reimplemented here, and Good Friday is
    // gazetted by MOM, so the checkable claim is the two-day gap.
    for (const year of [2026, 2027]) {
      const goodFriday = GLOBAL_KEY_DATES.find(
        (e) => e.name === 'Good Friday' && e.start.startsWith(String(year)),
      )
      const easter = GLOBAL_KEY_DATES.find(
        (e) => e.name === 'Easter Sunday' && e.start.startsWith(String(year)),
      )
      expect(goodFriday?.start, `Good Friday ${year}`).toBeDefined()
      expect(easter?.start).toBe(addDays(goodFriday!.start, 2))
    }
  })

  it('gives every fixed-date row the day its own source names', () => {
    // `Fixed: 14 February` is a claim the row can be held to directly. Parsing
    // the source rather than restating the date is what keeps this from being
    // a second copy of the dataset that has to be edited alongside the first.
    const fixed = ALL_KEY_DATES.filter((e) => /^Fixed: \d{1,2} [A-Z]/.test(e.source))
    expect(fixed.length).toBeGreaterThan(20)
    for (const entry of fixed) {
      const m = /^Fixed: (\d{1,2}) ([A-Za-z]+)/.exec(entry.source)
      const date = dayKeyToDate(entry.start)
      const month = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(date!)
      expect(Number(m![1]), `${entry.id} day`).toBe(date!.getDate())
      expect(month, `${entry.id} month`).toBe(m![2])
    }
  })
})

describe('the deliberate absences', () => {
  // Each of these is a row the proposal listed and curation dropped, because it
  // would not resolve to a citable primary. They are asserted absent so that
  // re-adding one is a deliberate act with a test to update, not a silent
  // reappearance of a guess.

  it('carries no Great Singapore Sale', () => {
    expect(ALL_KEY_DATES.some((e) => /great singapore sale/i.test(e.name))).toBe(false)
  })

  it('carries no 2027 Ramadan', () => {
    // The end is fixed by the gazetted Hari Raya Puasa, but a Ramadan is 29 or
    // 30 days — the start is 9 *or* 10 February and MUIS announces which.
    const ramadan = ALL_KEY_DATES.filter((e) => e.name === 'Ramadan')
    expect(ramadan).toHaveLength(1)
    expect(ramadan[0]?.start).toBe('2026-02-19')
  })

  it('carries no 2027 Thaipusam', () => {
    // Sources split between 22 January and 1 February 2027.
    const thaipusam = ALL_KEY_DATES.filter((e) => e.name === 'Thaipusam')
    expect(thaipusam).toHaveLength(1)
    expect(thaipusam[0]?.start).toBe('2026-02-01')
  })

  it('carries no Pongal', () => {
    // Sources disagree on the boundaries — 13–17 versus 14–17 January 2026.
    expect(ALL_KEY_DATES.some((e) => /pongal/i.test(e.name))).toBe(false)
  })

  it('carries no Singapore Food Festival or Orchard Road light-up', () => {
    // Neither 2026 edition had published dates at curation time.
    expect(ALL_KEY_DATES.some((e) => /food festival/i.test(e.name))).toBe(false)
    expect(ALL_KEY_DATES.some((e) => /great street/i.test(e.name))).toBe(false)
  })
})
