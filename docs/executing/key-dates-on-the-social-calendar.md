# Key dates on the social calendar — proposal

**Status:** approved 2026-08-06, written against `main` at **1.22.1** (1482
passed | 68 skipped; the skips are the live-Postgres suites).

**The phased build sits in
[`key-dates-implementation-plan.md`](key-dates-implementation-plan.md).** This
file is the argument; that one is the work.

**The ask, verbatim intent:** the social calendar gets a toggle that shows or
hides three sets of dates a marketer plans around but does not own —

- **(A)** recurring global dates relevant to any marketer — Christmas,
  Halloween, Valentine's Day, Black Friday and the rest of the commercial year;
- **(B)** Singapore's cultural and civic calendar — National Day, Hari Raya,
  Deepavali, Chinese New Year, and the observances around them;
- **(C)** Singapore's 2026/27 non-cultural calendar — the F1 weekend, the
  festivals, the trade shows: not deeply cultural, year-to-year mutable,
  and still on every local marketer's radar.

Where the dates were not obvious they were researched; §4 lists every one
proposed, with sources.

**Decisions confirmed with the user before the implementation plan was
written:**

- **Default: `Global` on, both Singapore sets off.** The global set is never
  *wrong* for a brand in any market, so it makes the feature discoverable
  without the app assuming where the brand sells.
- **Set C covers trade and industry, not only consumer.** ATxSG and the
  Singapore Fintech Festival sit alongside F1 and the festivals; the set is
  "what a Singapore marketer keeps on their radar", which for a B2B brand is a
  conference.
- **The annual refresh stays a manual curation pass** — a PR against three data
  files. Agent-assisted curation is a later version, noted in §11.
- **The Great Singapore Sale is dropped.** The Singapore Retailers Association
  no longer sets central dates, each mall runs its own window, and sources
  disagree on 2026. A season whose boundaries are invented is worse than a
  season absent.
- **The three sets are colour-coded** on both the calendar and the list — §6.

---

## 1. What this is not

**No migration, no route, no wire change, no server code.** The whole feature is
a static dataset, a filter over it, three colour tokens and two render paths in
`components/brand/`. It is worth saying first because the calendar's own plan
(`social-calendar.md`) was a five-package vertical slice, and the instinct to
reach for `packages/shared` and a `key_dates` table is the wrong one here:

- These dates are **not brand data**. Deepavali is on 8 November 2026 for every
  brand in every workspace. A per-brand table would store the same 200 rows N
  times and hand every self-hoster a seeding problem.
- They are **not user data** either — nobody edits them. Editing your own
  important dates is a different feature, and a genuinely good one (§11).
- They never cross the wire, so they need no zod schema at a boundary that
  does not exist.

The one thing that *is* per-user is **which sets are switched on**, and that is
a UI preference — `sidebar-prefs.ts`'s precedent, not a column.

## 2. The data model

New `packages/web/src/lib/key-dates/types.ts`:

```ts
export type KeyDateSet = 'global' | 'sg-holidays' | 'sg-events'

export interface KeyDate {
  /** Stable slug, unique across all sets: `sg-holidays/2026-deepavali`. */
  id: string
  set: KeyDateSet
  name: string
  /** Local day key, `YYYY-MM-DD`. */
  start: string
  /** Inclusive last day. Absent = a single day. */
  end?: string
  /** One line of marketer-facing context. Optional; most single days need none. */
  note?: string
  /** Where the date came from. Required — see §3. */
  source: string
}
```

Three decisions carry the file.

**Day keys, never ISO instants.** `lib/calendar.ts` opens with the invariant
that wire timestamps are UTC and a calendar is local, and that no key is ever
derived from `toISOString().slice(0, 10)`. A key date is the other half of that
same problem and the reason to answer it differently: **a holiday has no time**.
Stored as `2026-11-08T00:00:00.000Z` it renders on 7 November for a reader in
Los Angeles — the exact bug `localDayKey` exists to prevent, reintroduced
through a different door. `YYYY-MM-DD` is what the grid already groups by, what
`dayKeyToDate` already parses, and what `formatDayHeading` already takes. The
dataset joins the existing arithmetic instead of bringing its own.

The trade-off is stated rather than hidden: these are **Singapore calendar
days**, and a viewer in London sees Deepavali on the cell marked 8 November
regardless of their own timezone. That is correct — the date is a fact about
Singapore, not about the reader.

**`start` + optional `end`, not a duration.** Ramadan, i Light, Hungry Ghost
and the Christmas light-up are ~4-week spans; the F1 weekend is three days.
Two day keys describe both, and an inclusive `end` means a single day is
`start` alone rather than `start === end`, which is one fewer thing every
consumer has to normalise.

**`source` is required.** Half of this data is a government gazette and half is
a festival organiser's announcement, and in twelve months somebody — plausibly
an agent — will need to re-verify each row without re-deriving where it came
from. A required field costs one line per entry and makes the annual refresh a
mechanical job rather than an archaeology one. It is the same instinct
`defaultLibraryFor`'s doc comment serves in naming its two callers.

## 3. Curated, not computed — and the horizon that follows

**Every date is a literal in a data file. Nothing is derived at runtime.**

The tempting alternative is a small rule engine: Valentine's Day is always
14 February, Black Friday is the day after the fourth Thursday of November,
Mother's Day is the second Sunday of May. Roughly a third of set A is
expressible that way. It is still the wrong shape:

- **It cannot reach the other two-thirds.** Chinese New Year, Hari Raya Puasa,
  Hari Raya Haji, Vesak, Deepavali, Qingming and Mid-Autumn are lunar or
  Islamic-calendar dates. Computing them needs a real calendar library, and
  `lib/calendar.ts` states plainly that no date library exists in this monorepo
  and a month grid did not earn one. A lunisolar ephemeris earns it far less.
- **The gazetted holidays are announcements, not computations.** Singapore's
  Ministry of Manpower gazettes them, moon-sighting can move the Hari Raya
  dates, and a holiday landing on a Sunday produces a gazetted Monday that no
  rule predicts. Computing them would mean inventing an answer the government
  has already given.
- Two mechanisms for one list means every reader has to know which half a date
  came from before trusting it. One mechanism, one file, greppable, reviewable
  in a diff.

The price is that the table **has a horizon and goes stale**, and the design
answers that rather than ignoring it:

```ts
/** Last day each set is curated through. Beyond it the calendar says so. */
export const CURATED_THROUGH: Record<KeyDateSet, string> = {
  global: '2027-12-31',
  'sg-holidays': '2027-12-31',
  'sg-events': '2026-12-31',
}
```

**The horizon is per set, not global**, and that is a finding from the research
rather than a guess: MOM gazetted 2027's holidays on 18 June 2026, so sets A
and B are solid two years out — while almost nothing in set C beyond
December 2026 has been announced yet. One shared horizon would either claim
2027 coverage the events data does not have, or throw away the year of holiday
data it does.

When the cursor passes an enabled set's horizon, one line under the month
header says so — *"Singapore events are curated through December 2026."*
An empty November 2027 that looks identical to a November with no events is
the dishonest empty state this repo has removed twice already.

**No time-dependent test.** A test asserting the horizon is still in the future
passes today and fails on an unrelated Tuesday in 2028, which trains people to
ignore it. The horizon is asserted against the data (§9); staleness is
surfaced in the UI, where a person can act on it.

## 4. The three sets, as proposed

Every date below is the proposal. Entries marked **‡** are lunisolar
observances taken from secondary sources and are to be re-checked against a
citable primary at curation time (Phase A); everything unmarked is gazetted or
announced by the organiser.

### A — Global (`global`)

The international *commercial* year. Deliberately e-commerce and Western
weighted — that is what the set is for, and set B is where the local religious
calendar lives. A brand in any market can leave it on without it being wrong,
which is why it is the one on by default.

| Name | 2026 | 2027 | Note |
| --- | --- | --- | --- |
| New Year's Day | Thu 1 Jan | Fri 1 Jan | |
| Chinese New Year | Tue 17 – Wed 18 Feb | Sat 6 – Sun 7 Feb | Global retail moment; also gazetted in B |
| Valentine's Day | Sat 14 Feb | Sun 14 Feb | |
| International Women's Day | Sun 8 Mar | Mon 8 Mar | |
| Ramadan | Thu 19 Feb – Fri 20 Mar ‡ | Tue 9 Feb – Tue 9 Mar ‡ | Season. Moon-dependent |
| Good Friday | Fri 3 Apr | Fri 26 Mar | |
| Easter Sunday | Sun 5 Apr | Sun 28 Mar | |
| Earth Day | Wed 22 Apr | Thu 22 Apr | |
| Labour Day | Fri 1 May | Sat 1 May | |
| Mother's Day | Sun 10 May | Sun 9 May | US/SG convention, 2nd Sunday |
| Pride Month | Mon 1 – Tue 30 Jun | Tue 1 – Wed 30 Jun | Season |
| Father's Day | Sun 21 Jun | Sun 20 Jun | 3rd Sunday |
| 9.9 sale | Wed 9 Sep | Thu 9 Sep | |
| 10.10 sale | Sat 10 Oct | Sun 10 Oct | |
| Halloween | Sat 31 Oct | Sun 31 Oct | |
| Singles' Day (11.11) | Wed 11 Nov | Thu 11 Nov | |
| Thanksgiving (US) | Thu 26 Nov | Thu 25 Nov | |
| Black Friday | Fri 27 Nov | Fri 26 Nov | |
| Cyber Monday | Mon 30 Nov | Mon 29 Nov | |
| 12.12 sale | Sat 12 Dec | Sun 12 Dec | |
| Christmas Day | Fri 25 Dec | Sat 25 Dec | |
| Boxing Day | Sat 26 Dec | Sun 26 Dec | |
| New Year's Eve | Thu 31 Dec | Fri 31 Dec | |

### B — Singapore holidays (`sg-holidays`)

**Gazetted public holidays** — all eleven, both years, from MOM. The
Sunday-substitution Mondays are their own entries: a long weekend is the fact a
marketer is actually planning around, and it is not derivable from the holiday
row.

| Holiday | 2026 | 2027 |
| --- | --- | --- |
| New Year's Day | Thu 1 Jan | Fri 1 Jan |
| Chinese New Year | Tue 17 – Wed 18 Feb | Sat 6 – Sun 7 Feb |
| — observed | — | Mon 8 Feb |
| Hari Raya Puasa | Sat 21 Mar | Wed 10 Mar |
| Good Friday | Fri 3 Apr | Fri 26 Mar |
| Labour Day | Fri 1 May | Sat 1 May |
| Hari Raya Haji | Wed 27 May | Mon 17 May |
| Vesak Day | Sun 31 May | Thu 20 May |
| — observed | Mon 1 Jun | — |
| National Day | Sun 9 Aug | Mon 9 Aug |
| — observed | Mon 10 Aug | — |
| Deepavali | Sun 8 Nov | Thu 28 Oct |
| — observed | Mon 9 Nov | — |
| Christmas Day | Fri 25 Dec | Sat 25 Dec |

**Cultural observances that are not public holidays** — the ones with real
commercial and creative weight in Singapore. Thaipusam has not been a public
holiday since 1968 and is still one of the most visually distinctive days in
the year; the Hungry Ghost month changes what a lot of brands are willing to
launch.

| Observance | 2026 | 2027 | Note |
| --- | --- | --- | --- |
| Pongal | Wed 14 – Sat 17 Jan ‡ | Fri 15 Jan ‡ | Tamil harvest festival, Little India |
| Thaipusam | Sun 1 Feb ‡ | Mon 1 Feb ‡ | Foot procession; road closures |
| Chap Goh Meh | Tue 3 Mar ‡ | Sat 20 Feb ‡ | 15th day of CNY — closes the season |
| Qingming | Sun 5 Apr ‡ | Mon 5 Apr ‡ | Tomb-sweeping |
| Hungry Ghost Festival | Thu 13 Aug – Thu 10 Sep ‡ | ~Aug ‡ | Season. Launch-sensitive |
| Mid-Autumn Festival | Fri 25 Sep ‡ | Wed 15 Sep ‡ | Mooncake season runs ~6 weeks before |

Ramadan appears in set A rather than being duplicated here; when both sets are
on, the Hari Raya Puasa holiday and the Ramadan season read as one story.

### C — Singapore events (`sg-events`)

Pop-cultural, commercial and trade — the year-to-year mutable half. This is the
set with the short horizon: everything below is 2026, because as of August 2026
the 2027 editions are largely unannounced.

| Event | 2026 | Note |
| --- | --- | --- |
| Singapore Art Week | Thu 22 – Sat 31 Jan | Season |
| Singapore Airshow | Tue 3 – Sun 8 Feb | Biennial — next edition 2028 |
| Chingay Parade | Fri 27 – Sat 28 Feb | Follows CNY |
| Asia Tech x Singapore (ATxSG) | Wed 20 – Fri 22 May | |
| i Light Singapore | Fri 5 – Sun 28 Jun | Season, Marina Bay |
| Sentosa GrillFest | Thu 23 Jul – Sun 16 Aug | Season |
| National Day Parade | Sun 9 Aug | National Stadium |
| Singapore Night Festival | Fri 21 Aug – Sat 5 Sep | Season, Bras Basah.Bugis |
| Singapore Food Festival | Fri 4 – Thu 24 Sep ‡ | Season |
| Grand Prix Season Singapore | Fri 2 – Sun 11 Oct | Season — concerts and fringe |
| **F1 Singapore Grand Prix** | Fri 9 – Sun 11 Oct | The race weekend itself |
| Singapore Writers Festival | Fri 13 – Sun 22 Nov | Season |
| Christmas on A Great Street | Nov – Fri 1 Jan 2027 ‡ | Orchard Road light-up. Start date to confirm |
| Singapore Fintech Festival | Wed 18 – Fri 20 Nov | |
| BYD Singapore International Marathon | Fri 4 – Sun 6 Dec | Retitled from Standard Chartered for 2026 |
| Marina Bay Singapore Countdown | Thu 31 Dec | |

**The Great Singapore Sale is deliberately absent.** It was a genuine anchor
when the Singapore Retailers Association set island-wide dates; it no longer
does, each mall now runs its own window, and the 2026 sources contradict each
other on whether it is a July retail festival or a May-to-July season. A row
whose dates are invented reads exactly like a row whose dates are gazetted, and
that is the confusion worth avoiding. If a citable central window reappears, it
comes back.

### Sources

MOM public holidays [2026](https://www.mom.gov.sg/employment-practices/public-holidays)
and [2027](https://www.mom.gov.sg/newsroom/press-releases/2026/0618-public-holidays-for-2027) ·
[Singapore GP](https://singaporegp.sg/en/) ·
[i Light Singapore](https://www.ilightsingapore.gov.sg/) ·
[Singapore Art Week](https://www.artweek.sg/) ·
[Chingay](https://www.chingay.gov.sg/) ·
[NDP](https://www.ndp.gov.sg/) ·
[Singapore Fintech Festival](https://www.fintechfestival.sg/) ·
[ATxSG](https://asiatechxsg.com/) ·
[Singapore Writers Festival](https://www.singaporewritersfestival.com/) ·
[Singapore International Marathon](https://singaporeinternationalmarathon.com/) ·
[Singapore Airshow](https://www.singaporeairshow.com/) ·
[Christmas on A Great Street](https://christmas.orchardroad.org/) ·
[VisitSingapore festivals](https://www.visitsingapore.com/whats-happening/)

Per-row `source` URLs are written at curation time; the list above is the set
of primaries the research resolved to.

## 5. Rendering — a day is not a season

The single most consequential decision in the plan. Set C alone contains a
24-day light festival, a 16-day night festival and a ~7-week light-up; set B
contains a 4-week ghost month. Painting a pill into every covered cell would
put a marker on 29 of August's 31 days and bury the posts the grid exists to
show.

So the surface splits by shape, not by set:

**Multi-day entries become a strip above the grid.** A new pure
`KeyDateStrip.tsx` renders, under the month's `‹ August 2026 ›` header, one
compact band per season overlapping the visible month — name plus range
(`i Light Singapore · 5–28 Jun`). A season is a property of the month; that is
where it goes.

**Single-day entries become a marker in their cell**, above the post chips: a
small tinted label, visually distinct from a chip so nobody reads Deepavali as
something they scheduled.

The alternative — render every multi-day event on its first day only, labelled
with the range — was rejected because the event then vanishes the moment you
land mid-season, and mid-season is when you are most likely to be planning
inside it.

**Markers are `pointer-events-none`.** The day cell already carries a
full-bleed add button under its contents (`DayCell`'s comment explains why),
so a click on a day marked *Deepavali* falls straight through to "new post on
8 November" — which is exactly what a marketer clicking that cell wants, with
no new interaction to build, learn or test. The cell's `aria-label` gains the
day's key dates (`New post on Sun 8 Nov — Deepavali`) so the fall-through is
announced rather than merely convenient. The cost is that a long name truncates
in a ~130px cell with no tooltip to recover it; the strip and the list both
carry full names, so nothing is only knowable from the cell.

**The list view gets both halves of the same fact:**

- Day headings gain a suffix — `Sun 8 Nov · Deepavali` — annotating the days
  you have already planned into. Cheap: `formatDayHeading` is already the one
  place that renders a heading.
- A **Key dates** block at the head of `Upcoming`, listing the next handful of
  entries across enabled sets with their dates. This is the part that earns the
  feature: day-heading suffixes only appear on days that already have posts, so
  without this block a Deepavali nobody has planned for is invisible on the one
  surface whose job is to say what is coming.

**Duplicates dedupe by day and name.** Christmas Day, New Year's Day, Good
Friday, Labour Day and Chinese New Year appear in both A and B by design —
each set has to stand alone for a brand that enables only that one. The sets
therefore use the *same string* for the same thing, and the selector collapses
entries sharing `start` + `name` into one, keeping the lowest-numbered set for
its colour and `note`. Where the names genuinely differ the entries genuinely
differ: Sunday 9 August 2026 shows both *National Day* (the holiday) and
*National Day Parade* (the event), which is two facts, not one repeated.

## 6. Colour — three hues, and the budget they cost

Each set carries a colour, used identically in the cell marker, the season
band, the list block, the day-heading suffix dot and the swatch beside its
checkbox in the menu. Consistency across those five surfaces is the whole
point: the colour is only useful if it is learnable, and it is only learnable
if the menu that switches a set on shows the same swatch the calendar paints.

**This costs real CI surface and the plan says so.** `index.css` is explicit
that tier 1 is the only place a raw hex may live, and that pointing shadcn's
`accent` at the brand green would *"blow the §4 accent budget"*. Three new hues
is the largest palette addition since the Mission Systems pass. Two cheaper
routes were considered and rejected:

- **Reuse the feedback tints** (`--fb-info-tint`, `--fb-success-tint`,
  `--fb-warning-tint`). They are currently unused by any component, so there is
  no visible collision *today* — but they mean error, warning, success and
  information, and a calendar that paints Deepavali in the success colour has
  spent a semantic token on a category. The first real warning state on this
  page would then be indistinguishable from a public holiday.
- **One colour, three shapes** — filled, outlined, dotted. Cheapest, and the
  ask was explicitly for colour.

So: **three new tier-1 primitives with tints, in both themes**, aliased at
tier 2 and exposed as utilities the same way `--fb-*` already is. Proposed
triad, chosen for maximum distance from the five hues already spoken for
(brand deep green, error brick, warning amber, success green, info slate):

| Set | Hue | Why |
| --- | --- | --- |
| `global` | Violet | The one clearly free region of the wheel |
| `sg-holidays` | Rose | Festive, and Singapore's own red without being the error brick |
| `sg-events` | Teal | Cyan-leaning, so it separates from both the brand green and the info blue |

Starting values, to be **contrast-verified in Phase B before anything renders
them** — label ink on its own tint at ≥ 4.5:1 in both themes, which is the bar
the existing `--color-feedback-error-on` comment already holds itself to:

```
light   violet #5b4a7a on #f0edf6   rose #8f3f63 on #fbeef3   teal #1f5f66 on #e9f3f3
dark    violet #a99ac9 on #282338   rose #d18aa6 on #38222c   teal #6fb3ba on #172e30
```

**Colour is never the only signal.** Three tinted labels are indistinguishable
to a reader with deuteranopia and invisible to a screen reader, so every
surface carries the set in text as well: the marker's accessible name includes
it, the list block groups under a named heading per set, and the menu row pairs
each swatch with its label. The colour is the fast path, not the only path.

## 7. Files

```
packages/web/src/lib/key-dates/
  types.ts        KeyDate, KeyDateSet, CURATED_THROUGH, labels + descriptions
  appearance.ts   Record<KeyDateSet, {...}> — the class strings, one place
  global.ts       set A data
  sg-holidays.ts  set B data
  sg-events.ts    set C data
  index.ts        ALL_KEY_DATES (concat) + re-exports
  select.ts       pure selectors — see below
packages/web/src/lib/key-dates-prefs.ts             localStorage, per brand
packages/web/src/components/brand/KeyDateStrip.tsx  seasons band (pure, new)
packages/web/src/components/brand/KeyDatesMenu.tsx  the toggle (pure, new)
```

`select.ts` is where every consumer's question is answered once:

- `keyDatesForSets(enabled)` — filter + dedupe (§5).
- `splitByShape(dates)` → `{ days, seasons }`.
- `keyDatesByDay(days)` → `Map<dayKey, KeyDate[]>`, mirroring `groupByDay`.
- `seasonsInMonth(seasons, year, month)` — any overlap with the visible range.
- `upcomingKeyDates(dates, now, limit)` — the list block's source.
- `staleSets(enabled, cursor)` — which enabled sets the cursor has outrun.

No memoisation: the whole dataset is ~200 entries and these are O(n) filters
run once per render, the same budget `groupByDay` already spends on every post
on the page.

Modified: `index.css` (§6's tokens), `CalendarMonthGrid.tsx` (a `keyDates`
prop, the strip, cell markers, the `aria-label` suffix), `SocialPostList.tsx`
(heading suffixes, the Upcoming block), `SocialCalendarView.tsx` (menu in the
header, threading), and `SocialCalendarPage.tsx` (the enabled-sets state, prefs
read/write, running the selectors).

## 8. The control and the preference

**A dropdown with three checkbox items**, in `PageHeader`'s action slot beside
the existing view toggle: `Key dates` as the trigger, with a count when any are
on. `DropdownMenuCheckboxItem` is already built and exported from
`components/ui/dropdown-menu.tsx` — this needs no new primitive and no new
dependency.

Each row is a swatch, a label and a one-line description:

| Label | Description |
| --- | --- |
| Global | Christmas, Valentine's, Black Friday |
| Singapore holidays | Public holidays and cultural observances |
| Singapore events | F1, festivals, conferences |

The names are the plainest pair available: *holidays* and *events* is a
distinction anyone reads correctly at a glance, where "cultural" and
"pop-cultural" is a distinction you have to be told. The second set carries
Thaipusam and the Hungry Ghost month, which are observances rather than
holidays — the description line is what carries that, not a longer label.

**Persisted in `localStorage`, keyed by brand** — new
`lib/key-dates-prefs.ts`, the shape and the swallowed failure of
`sidebar-prefs.ts` verbatim (private browsing gets the default, not a crash).
Keyed by brand id because an agency running a Singapore client and an
Australian one wants different answers per brand, and a global key would make
every switch a change to every calendar. A brand-level column is the better
long-term home and is noted in §11, not smuggled in here.

Note what is deliberately *not* persisted: the view toggle and the month cursor
are still local `useState`, per `SocialCalendarPage`'s existing comment. The
difference is that those cost one click to restore and this costs three, in a
menu the user has to remember exists.

## 9. Tests

The dataset tests matter more than the component tests here, because a wrong
date ships silently and looks like a feature working:

- **Every `start`/`end` parses.** `dayKeyToDate(...) !== null` for all entries —
  which also rejects `2026-02-30`, since that function already round-trips the
  parts to catch a normalised date.
- `end` is present only when it is strictly after `start`.
- **Ids are unique across all three sets**, and each entry's `set` matches the
  file it is exported from.
- **Every entry has a non-empty `source`.**
- **Every entry falls on or before its set's `CURATED_THROUGH`**, and each
  set's horizon equals the maximum `end ?? start` in it — so a horizon and its
  data cannot drift in either direction. No assertion involves the current date
  (§3).
- The eleven gazetted holidays are present for both years, by name and date —
  the one table in here with a single authoritative source, worth pinning
  directly.
- `appearance.ts` and the label maps are exhaustive `Record<KeyDateSet, …>`, so
  a fourth set fails the typecheck rather than rendering uncoloured.

Selectors: dedupe collapses Christmas across A and B and leaves 9 August 2026's
two differently-named entries alone; `seasonsInMonth` catches a season that
starts before and ends after the visible month; `upcomingKeyDates` respects the
limit and excludes today's past. Components: the strip and the markers with no
mocks (`AssetLibraryView.test.tsx` style), the menu's checkbox semantics, the
prefs module's private-browsing fallback, and the page with the view stubbed
(`SocialCalendarPage.test.tsx`'s existing model).

## 10. Verification, per phase

```
pnpm typecheck
pnpm lint / format:check
pnpm test
pnpm -F @brandfactory/web build
```

The db live suites are untouched by this work — there is no migration and no
query — so `DATABASE_URL` is not needed for any phase.

## 11. Noted, not done

- **User-owned key dates.** A brand's own recurring dates — founding
  anniversary, product launch windows, the client's fiscal calendar. This is
  the feature that *does* want a table, a wire type and a route, and it should
  reuse this render layer rather than invent a second one.
- **Agent-assisted curation.** The research pipeline (1.19.0) could propose
  next year's set C rows with sources for a human to accept. Confirmed as a
  later version; the manual pass ships first.
- **Brand-level default sets.** A column on `brands` so a Singapore brand opens
  with the Singapore sets lit on any device, with the localStorage preference
  as the per-viewer override.
- **More markets.** `KeyDateSet` is a string union in one file: adding
  `my-holidays` or `us-events` is members, a data file, a colour and a menu
  row. No market registry is built for one market.
- **Ideation from a key date** — "draft three posts for Deepavali" — needs the
  agent on this surface, which v1 of the calendar deliberately does not have.
- **Filtering the calendar to one set** (rather than showing all enabled) and
  week view, drag-and-drop, and the rest of `social-calendar.md` §9 remain
  where they were.
