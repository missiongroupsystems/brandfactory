# Phase A — the dataset

**Status:** complete, 2026-08-06. Written against `main` at **1.22.1** (1482
passed | 68 skipped before this phase; the skips are the live-Postgres suites).

Executes Phase A of
[`docs/executing/key-dates-implementation-plan.md`](../executing/key-dates-implementation-plan.md),
which builds
[`docs/executing/key-dates-on-the-social-calendar.md`](../executing/key-dates-on-the-social-calendar.md).
The *why* is argued there and is not restated; this file records what was
written, where, what the curation pass resolved and what it dropped.

**No migration, no route, no wire type, no server code, no component.** Phase A
is data and the seven pure functions over it. 9 files added, 0 modified,
+78 tests. Nothing outside `lib/key-dates/` imports any of it — the phase is
genuinely dark, verified in §7.

---

## 1. What was built

92 curated entries across three sets — 71 single days and 21 seasons:

| Set | Entries | Seasons | Curated through |
| --- | --- | --- | --- |
| `global` | 45 | 5 | 2027-12-31 |
| `sg-holidays` | 33 | 4 | 2027-12-25 |
| `sg-events` | 14 | 12 | 2026-12-31 |

Plus `select.ts` — the seven selectors from A7, each carrying the doc comment
naming the thing it gets wrong if written naively.

The proposal estimated "~200 entries". It is 92, and the difference is not a
shortfall: the estimate double-counted the two years of a set that only has two
years, and six rows were dropped in curation (§2). The performance argument that
number was serving — *O(n) filters run once per render, no memoisation* — holds
with more room than it was claimed with.

## 2. A5 — the curation pass, and the six rows it dropped

The task the phase existed for. Every **‡** row in proposal §4 was taken to a
citable primary; six would not go, and per A5 they are **dropped rather than
guessed**, because a row whose dates are invented renders exactly like a row
whose dates are gazetted.

### The primary that did most of the work

**The Hong Kong Observatory's Gregorian-Lunar Calendar conversion table** —
[2026](https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2026e.txt),
[2027](https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt). A
government astronomical authority publishing a machine-readable table, which is
a different class of source from the festival blogs that carry these dates
otherwise. Every Chinese lunisolar row in the dataset is read off it: Chap Goh
Meh is the 15th day of the 1st lunar month, the Hungry Ghost month is the whole
7th, Mid-Autumn is the 15th day of the 8th, and Qingming is the solar term the
table prints as *Bright & Clear*.

The table was downloaded and parsed rather than eyeballed — the lunar month
boundaries are the rows reading `7th Lunar Month`, and walking them is what
turns "the seventh month" into two day keys.

### Resolved

| Row | Proposal | Resolved to | Primary |
| --- | --- | --- | --- |
| Ramadan 2026 | 19 Feb – 20 Mar | unchanged | MUIS — the Mufti's 1447H announcement |
| Thaipusam 2026 | 1 Feb | unchanged | Hindu Endowments Board |
| Chap Goh Meh 2026 | 3 Mar | unchanged | HKO |
| Chap Goh Meh 2027 | 20 Feb | unchanged | HKO |
| Qingming 2026 | 5 Apr | unchanged | HKO |
| Qingming 2027 | 5 Apr | unchanged | HKO |
| Hungry Ghost 2026 | 13 Aug – 10 Sep | unchanged | HKO |
| **Hungry Ghost 2027** | *"~Aug"* | **2 – 31 Aug** | HKO |
| Mid-Autumn 2026 | 25 Sep | unchanged | HKO |
| Mid-Autumn 2027 | 15 Sep | unchanged | HKO |

**The plan named Hungry Ghost 2027 and Chap Goh Meh 2027 as "the two likeliest
drops". Both resolved**, and from the same table — which is the argument for
finding the right primary before reaching for the drop rule.

### Dropped, with what brings each back

| Row | Why it would not resolve |
| --- | --- |
| **Ramadan 2027** | The *end* is fixed by the gazetted Hari Raya Puasa (10 Mar 2027), but a Ramadan is 29 or 30 days — so back-computing gives 9 **or** 10 February. MUIS announces the real answer on the moon sighting two days ahead. Returns with that announcement. |
| **Thaipusam 2027** | Sources split between **22 January** and **1 February**; HEB has not announced. The astronomy favours 22 Jan (the Thai-month full moon), which is exactly why the disagreement is not safe to resolve by picking the plausible one. Returns when HEB publishes. |
| **Pongal 2026** | Sources disagree on the boundaries — **13–17** versus **14–17 January**, because the Little India event programme and the four-day Tamil festival are different spans wearing one name. |
| **Pongal 2027** | Secondary aggregators only (15 Jan), no Singapore primary. |
| **Singapore Food Festival 2026** | `singaporefoodfestival.com` still reads *"Singapore Food Festival 2025 has come to an end"*. Every source carrying 4–24 September says "expected", and the range is derived from mirroring the 2025 edition. |
| **Christmas on A Great Street** | `christmas.orchardroad.org` is still on the 2025 edition. The proposal already flagged the start date as unconfirmed; it is still unconfirmed. |

Each drop is asserted **absent** in `data.test.ts`, so re-adding one is a
deliberate act with a test to update rather than a guess reappearing quietly.

**Pongal is the drop worth revisiting first.** Thai Pongal as a *single day* —
14 Jan 2026, 15 Jan 2027 — is undisputed across every source; only the
multi-day span is contested. Reshaping the row from a season to a day would
resolve it, but that is a change to what the approved proposal describes, so it
is offered here rather than taken.

### The cross-check nobody asked for

Before any research, all **108 weekday assertions** in proposal §4 were checked
against the calendar mechanically — every "Thu 1 Jan", "Sun 8 Nov" and the rest,
for both years and all three sets. All 108 agree, so the proposal's transcription
carried no slipped dates. Cheap, and it means the research was verifying
*sources* rather than also hunting typos.

The eleven gazetted public holiday days were separately re-read off MOM for both
years, and match the proposal exactly, including all four Sunday-substitution
Mondays.

## 3. Two deviations from the plan

### `ALL_KEY_DATES` is in `all.ts`, not `index.ts`

The plan's A6 puts the concatenation in the barrel. That arrangement is a
**runtime import cycle**: `index.ts` does `export * from './select'`, and
`select.ts` needs `ALL_KEY_DATES`, so the two reference each other.

It happens to resolve today — both cross-references are inside function bodies
or re-exports, so neither module reads the other's binding during evaluation —
but it resolves *by luck of where the references sit*, and the repo has already
paid for that lesson once: `visual-identity-and-the-library-phase-a` §2 moved a
schema for the same class of hazard and wrote down why.

So the edge runs one way, with no back edge anywhere:

```
global.ts ┐
sg-holidays.ts ├─► all.ts ─► select.ts ─► index.ts
sg-events.ts ┘
```

Nothing downstream can tell: `index.ts` re-exports `ALL_KEY_DATES`, and A6's
actual requirement — *no consumer imports a data file directly* — is met by the
barrel either way.

### `CURATED_THROUGH['sg-holidays']` is `2027-12-25`, not `2027-12-31`

The proposal's §3 code block says `2027-12-31`. The plan's own data test says
each set's horizon **equals the maximum `end ?? start` within it**, and the last
`sg-holidays` row is Christmas Day. The two cannot both be satisfied.

The test wins, because the property it is buying is the valuable one: with the
horizon pinned to the data, adding 2028 rows without moving the horizon fails,
and moving the horizon without adding rows fails too. A horizon set to a date no
row reaches is a number nothing checks.

**Nothing observable changes.** `staleSets` compares the horizon against a
month's *first* day, so December 2027 is not stale under either value, and the
first stale month is January 2028 either way. The reasoning is recorded at the
constant so the next reader does not helpfully "fix" it back.

Worth noting the near-miss beside it: `sg-events` reads `2026-12-31` **because**
the Orchard Road light-up was dropped. Had that row survived, its 1 January 2027
end would have forced the events horizon into 2027 — a set claiming a year of
coverage on the strength of one unconfirmed row.

## 4. Decisions the plan left to the implementation

**`source` takes a URL *or* the rule that fixes the date.** Half the dataset has
a primary to link. The other half is Valentine's Day, and there is no document to
cite for 14 February. Writing `Fixed: 4th Thursday in November` tells a curator
to move on exactly as usefully as a link would, and it keeps the field required
— which was the point of the field.

**`keyDatesForSets` sorts its output by `start`.** The plan specifies filter and
dedupe only. Without a sort the result is set-major (all of `global`, then all of
`sg-holidays`), which would make the strip and the Upcoming block read in an
order nobody chose. The sort is stable, so same-day entries keep set order — the
holiday above the event on 9 August, not the reverse.

**`upcomingKeyDates` tests `end ?? start`, not `start`.** A four-week ghost month
you are three days into is the most relevant thing on the list, and testing
`start` would drop it the moment it began. For a single day this reduces to the
plan's "includes today, excludes yesterday".

**`staleSets` returns in `KEY_DATE_SETS` order**, not the caller's order, so the
sentence under the month header reads the same however the user toggled the menu.

**`formatKeyDateRange` has four shapes** — `8 Nov`, `5–28 Jun`, `23 Jul – 16 Aug`,
`18 Dec 2026 – 3 Jan 2027`. The last is unreachable from today's data and is
built anyway, because a range that silently dropped the year would be a lie the
moment a row crossed one. The tight dash within a month versus the spaced dash
across months is deliberate: an unspaced dash between two multi-word dates reads
as one mangled date.

**The dedupe separator is a space**, not a dash — no name contains the pair
`start` + space + `name` ambiguously, whereas several contain dashes.

## 5. The files

| File | |
| --- | --- |
| `lib/key-dates/types.ts` | `KEY_DATE_SETS` tuple, `KeyDateSet`, `KeyDate`, the two label maps, `CURATED_THROUGH`, `DEFAULT_ENABLED_SETS` |
| `lib/key-dates/global.ts` | Set A — 45 entries, both years |
| `lib/key-dates/sg-holidays.ts` | Set B — 33 entries: the gazetted table both years, four in-lieu Mondays, nine observances |
| `lib/key-dates/sg-events.ts` | Set C — 14 entries, 2026 only |
| `lib/key-dates/all.ts` | `ALL_KEY_DATES`, and the cycle note (§3) |
| `lib/key-dates/select.ts` | The seven selectors |
| `lib/key-dates/index.ts` | The barrel |
| `lib/key-dates/data.test.ts` | 46 tests |
| `lib/key-dates/select.test.ts` | 32 tests |

## 6. What the 78 tests actually hold

The plan budgeted ~18. The overage is `it.each` expanding the gazetted table
into 24 named cases rather than extra coverage invented to fill a row — the
distinct assertions number closer to 40.

Not coverage for its own sake; the ones pinned to a specific way this can go
wrong later:

**The horizon, from both directions.** Every entry is on or before its set's
`CURATED_THROUGH`, *and* each horizon equals the maximum `end ?? start` in its
set. Either alone permits drift; together the horizon cannot disagree with the
data in either direction.

**The concatenation order is asserted, not assumed.** `keyDatesForSets` keeps the
first of a duplicated pair, so `ALL_KEY_DATES` being set-major in `KEY_DATE_SETS`
order *is* the precedence rule that makes `global` win Christmas. A test walks
the flattened array and fails if the sets interleave or reorder.

**The five shared observances must be spelled identically across two files.** The
dedupe key is `start` + `name`, so a stray apostrophe in `sg-holidays.ts` shows
Christmas twice on a calendar with both sets on. The test proves every shared
name exists in both files *and* overlaps on at least one day — the second half
catching a "duplicate" that is really two unrelated rows wearing one name.

**The empty-dataset guard.** `expect(ALL_KEY_DATES.length).toBeGreaterThan(80)`,
because a suite whose every assertion is a `for … of` over an empty array passes
loudly and proves nothing.

**`seasonsInMonth` against a season that swallows the whole month.** Nothing in
the real dataset spans a full month, so the fixture is constructed — and it is
the case that fails if you test only whether `start` falls in the visible month.
Paired with the real Hungry Ghost month appearing in both August and September.

**The six drops, asserted absent** (§2), plus the Great Singapore Sale.

**No assertion reads the current date.** A test asserting the horizon is still in
the future passes today and fails on an unrelated Tuesday in 2028, which trains
people to ignore it. Where a `now` is needed it is injected, built from local
components the way `calendar.test.ts` builds its fixtures, so nothing here reads
differently in Auckland than in Los Angeles.

## 7. Verification

Every command run, not read off a prior phase:

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1560 passed | 68 skipped (138 files)
pnpm -F @brandfactory/web build   clean in 456ms
```

Repo-wide **1482 → 1560 (+78)**, 136 → 138 files. **No existing test changed** —
not an assertion, not a fixture. Phase A adds files and imports nothing, which is
what makes that true rather than lucky.

`DATABASE_URL` was not needed and the live suites are untouched, as the plan says.

### The phase is dark, checked rather than assumed

```
grep -rn 'key-dates' packages/web/src --include='*.tsx'          → nothing
grep -rl 'key-dates' packages/web/src --exclude-dir=key-dates    → nothing
```

The acceptance criterion asked only for the first. The second is stronger and is
the one that matters: no file anywhere in `web` outside the dataset's own folder
mentions it, so the two test files are the only consumers in the repo.

## 8. Carried forward

- **Phase B needs `appearance.ts`**, which is the one file in the proposal's §7
  listing that Phase A does not create — correctly, since it holds Tailwind class
  strings for tokens that do not exist yet.
- **Six rows are waiting on their sources** (§2). The two Singapore events —
  the Food Festival and the Orchard Road light-up — are the ones most likely to
  resolve soon, both being 2026 editions that simply had not published at
  curation time. Re-adding either means updating its "deliberately absent"
  assertion, which is the intended friction.
- **`sg-events` expires at the end of 2026.** Phase D's horizon line is what
  stands between a user and a calendar that looks broken; this phase supplies the
  data it reads (`staleSets`) but nothing renders it yet.
- **Nothing is memoised**, deliberately, and the entry count came in at half the
  estimate — so the "O(n) once per render" budget has more headroom than the
  proposal claimed. If Phase D's profiling ever disagrees, the selectors are pure
  and the fix is local.

## 9. Caveats

- **Nothing is user-visible and nothing was run in a browser.** Correct for this
  phase; Phase F is where that debt is paid.
- **No test can catch a date that is simply wrong.** That is the defect class the
  plan names as the one with no mechanical guard, and the answer is the required
  `source` field plus the drop-rather-than-guess rule — not the suite. What the
  suite guarantees is that every date *parses*, *is inside its horizon*, and is
  *attributed*.
- **The `Fixed: …` sources are unverifiable by construction.** `Fixed: 25
  December` cannot be checked against anything; it is a statement that there is
  nothing to check. A curator re-verifying the dataset should spend their time on
  the URL rows.
- **Hungry Ghost 2027 is the one row whose dates were derived rather than
  announced** — from HKO's lunar month boundaries rather than from a festival
  organiser. That is the correct primary for a lunar month, and it is worth
  knowing it is a different kind of fact from a gazetted holiday.
