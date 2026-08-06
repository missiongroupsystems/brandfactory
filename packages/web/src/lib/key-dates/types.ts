// ---------------------------------------------------------------------------
// key-dates — the dates a marketer plans around but does not own
// ---------------------------------------------------------------------------
//
// Three sets: the international commercial year, Singapore's gazetted holidays
// and cultural observances, and Singapore's mutable events calendar.
//
// **This is not brand data and not user data.** Deepavali is 8 November 2026
// for every brand in every workspace, and nobody edits these rows — so they are
// a static dataset in `web` rather than a table, a wire type or a route. A
// per-brand table would store the same rows N times and hand every self-hoster a
// seeding problem. The one genuinely per-user fact is *which sets are switched
// on*, and that is a `localStorage` preference (`key-dates-prefs.ts`), not a
// column.
//
// **Every date here is a hand-curated literal. Nothing is computed.** Roughly a
// third of the global set is expressible as a rule — Valentine's Day is always
// 14 February — and the other two-thirds are lunisolar or gazetted. Reaching
// those needs a real calendar library, and `calendar.ts` states plainly that no
// date library exists in this monorepo and a month grid did not earn one; a
// lunisolar ephemeris earns it far less. Two mechanisms for one list would also
// mean every reader has to know which half a row came from before trusting it.
// One mechanism, three files, greppable, reviewable in a diff.
//
// The price of curation is a horizon — see `CURATED_THROUGH`.

/**
 * The sets, in **precedence order**.
 *
 * One tuple behind two facts: the `KeyDateSet` union is derived from it, so the
 * members and their iteration order cannot drift apart the way a hand-written
 * union beside a hand-written array would.
 *
 * The order is load-bearing in exactly one place. Christmas Day, New Year's
 * Day, Good Friday, Labour Day and Chinese New Year appear in both `global` and
 * `sg-holidays` by design — each set has to stand alone for a brand that
 * enables only that one — and `keyDatesForSets` collapses the duplicate by
 * keeping whichever set appears **first here**. So `global` wins Christmas, and
 * this array is where that is decided.
 */
export const KEY_DATE_SETS = ['global', 'sg-holidays', 'sg-events'] as const

export type KeyDateSet = (typeof KEY_DATE_SETS)[number]

export interface KeyDate {
  /**
   * Stable slug, unique across all three sets: `sg-holidays/2026-deepavali`.
   *
   * Set-prefixed because the same observance genuinely exists in two sets, and
   * a React key that collided across them would drop a row from the render.
   */
  id: string
  set: KeyDateSet
  /**
   * The name as it is rendered, everywhere.
   *
   * Half of the dedupe key, which makes it a contract rather than copy: the two
   * sets must spell a shared observance **identically** or `keyDatesForSets`
   * will show Christmas twice. Where the names genuinely differ the entries
   * genuinely differ — 9 August 2026 carries both *National Day* and *National
   * Day Parade*, which is two facts, not one repeated.
   */
  name: string
  /**
   * Local day key, `YYYY-MM-DD` — **never an ISO instant**.
   *
   * `calendar.ts` opens with the invariant that wire timestamps are UTC and a
   * calendar is local. A key date is the other half of that problem and the
   * reason to answer it differently: *a holiday has no time*. Stored as
   * `2026-11-08T00:00:00.000Z` it renders on 7 November for a reader in Los
   * Angeles — precisely the bug `localDayKey` exists to prevent, reintroduced
   * through a different door.
   *
   * The trade-off, stated rather than hidden: these are **Singapore calendar
   * days**, so a viewer in London sees Deepavali on the cell marked 8 November
   * regardless of their own timezone. That is correct — the date is a fact
   * about Singapore, not about the reader.
   */
  start: string
  /**
   * Inclusive last day. **Absent means a single day**, not `end === start`.
   *
   * One fewer thing every consumer has to normalise, and the discriminator
   * `splitByShape` reads: a season goes in the strip above the grid, a day goes
   * in its own cell.
   */
  end?: string
  /** One line of marketer-facing context. Most single days need none. */
  note?: string
  /**
   * Where the date came from. **Required.**
   *
   * Half of this data is a government gazette and half is a festival
   * organiser's announcement, and in twelve months somebody — plausibly an
   * agent — has to re-verify each row without re-deriving where it came from. A
   * required field costs one line per entry and turns the annual refresh from
   * archaeology into a mechanical job.
   *
   * A URL wherever a primary exists. Where the date is fixed by definition and
   * there is nothing to check, the rule itself (`Fixed: 14 February`,
   * `Fixed: 4th Thursday in November`) — which tells a curator to move on just
   * as usefully as a link would.
   */
  source: string
}

/** The set names, as the menu and the list headings render them. */
export const KEY_DATE_SET_LABELS: Record<KeyDateSet, string> = {
  global: 'Global',
  'sg-holidays': 'Singapore holidays',
  'sg-events': 'Singapore events',
}

/**
 * The one-line description under each menu row.
 *
 * *Holidays* and *events* is a distinction anyone reads correctly at a glance,
 * where "cultural" and "pop-cultural" is one you have to be told. The second
 * set carries Thaipusam and the Hungry Ghost month, which are observances
 * rather than holidays — this line is what carries that, not a longer label.
 */
export const KEY_DATE_SET_DESCRIPTIONS: Record<KeyDateSet, string> = {
  global: "Christmas, Valentine's, Black Friday",
  'sg-holidays': 'Public holidays and cultural observances',
  'sg-events': 'F1, festivals, conferences',
}

/**
 * Last day each set is curated through. Beyond it, the calendar says so.
 *
 * **Per set, not global** — a research finding rather than a guess. MOM
 * gazetted 2027's public holidays on 18 June 2026, so the two Singapore
 * holiday years are solid; almost nothing in the events set beyond December
 * 2026 has been announced. One shared horizon would either claim 2027 coverage
 * the events data does not have, or throw away the year of holiday data it does.
 *
 * Each value is **exactly the maximum `end ?? start` in its set**, asserted in
 * `data.test.ts`, so a horizon and its data cannot drift in either direction:
 * adding 2028 rows without moving the horizon fails, and moving the horizon
 * without adding rows fails too.
 *
 * That makes `sg-holidays` end on Christmas Day rather than New Year's Eve —
 * 25 December 2027 is genuinely the last row, and `staleSets` compares against
 * a month's *first* day, so December 2027 does not nag about data it has.
 */
export const CURATED_THROUGH: Record<KeyDateSet, string> = {
  global: '2027-12-31',
  'sg-holidays': '2027-12-25',
  'sg-events': '2026-12-31',
}

/**
 * What a brand's calendar shows before anyone opens the menu.
 *
 * `global` alone: it is never *wrong* for a brand in any market, so it makes
 * the feature discoverable without the app assuming where the brand sells.
 * Switching the Singapore sets on is a deliberate act.
 */
export const DEFAULT_ENABLED_SETS: readonly KeyDateSet[] = ['global']
