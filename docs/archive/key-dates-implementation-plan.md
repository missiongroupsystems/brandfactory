# Key dates — implementation plan

**Companion to [`key-dates-on-the-social-calendar.md`](key-dates-on-the-social-calendar.md),
which is the argument.** This file is the work: six phases, each independently
shippable, each landing its own note in `docs/completions/`.

Base: `main` at **1.22.1** — 1482 passed | 68 skipped, 136 files.

## Locked before the first line

Settled with the user; nothing below re-opens them.

| | |
| --- | --- |
| Sets | `global` · `sg-holidays` · `sg-events` |
| Labels | Global · Singapore holidays · Singapore events |
| Default | `global` on, both Singapore sets off |
| Set C scope | Consumer **and** trade — ATxSG and Fintech Festival stay |
| Great Singapore Sale | Dropped. No citable central window exists |
| Refresh | Manual curation pass. Agent-assisted is a later version |
| Colour | Three hues, on both calendar and list, plus non-colour signals |
| Persistence | `localStorage`, keyed by brand |
| Server | **Nothing.** No migration, no route, no wire type |

## Order, and why it is this order

```
A  Dataset ─────────┐
                    ├──► D  Calendar view ──► E  List view ──► F  Live pass
B  Colour tokens ───┤
C  Preference + menu┘
```

A, B and C are independent of each other and all three are **dark** — nothing
they add is reachable from the running app, so any of them can land alone
without a half-state on screen. D is the first phase a user can see, and it
needs all three: the data to render, the colours to render it in, and the menu
to switch it on. E is split from D because the list is the half most likely to
need a second look, and a plan that can defer it is better than one that cannot.

**Every new prop on an existing component is optional with an empty default.**
`keyDates = []` renders exactly what the component renders today, which is what
lets A–C land without touching a single existing test, and lets D's diff be
read as "what changed" rather than "what was rethreaded". It is also the house
rule already stated in `CalendarMonthGrid` and `SocialPostList`: *every
affordance renders only when its prop does.*

## The gate, run at the end of every phase

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -F @brandfactory/web build
```

No `DATABASE_URL` needed at any point — the live suites are untouched. Each
phase records its passing test count in its completion note; the delta is what
the changelog entry quotes.

---

# Phase A — The dataset

**Goal:** every date in the proposal exists as typed, sourced, tested data that
nothing imports yet.

**Files (all new):**

```
packages/web/src/lib/key-dates/types.ts
packages/web/src/lib/key-dates/global.ts
packages/web/src/lib/key-dates/sg-holidays.ts
packages/web/src/lib/key-dates/sg-events.ts
packages/web/src/lib/key-dates/index.ts
packages/web/src/lib/key-dates/select.ts
packages/web/src/lib/key-dates/data.test.ts
packages/web/src/lib/key-dates/select.test.ts
```

### Tasks

- [ ] **A1** `types.ts` — `KEY_DATE_SETS` as a `const` tuple with `KeyDateSet`
      derived from it (so the union and the iteration order are one fact), the
      `KeyDate` interface from proposal §2, `KEY_DATE_SET_LABELS`,
      `KEY_DATE_SET_DESCRIPTIONS`, `CURATED_THROUGH` and
      `DEFAULT_ENABLED_SETS = ['global']`. Every map an exhaustive
      `Record<KeyDateSet, …>`.
- [ ] **A2** `global.ts` — proposal §4A, both years. 23 names × 2 = ~46 entries.
- [ ] **A3** `sg-holidays.ts` — the eleven gazetted holidays × 2 years, the four
      Sunday-substitution Mondays as their own entries, and the six cultural
      observances × 2 years.
- [ ] **A4** `sg-events.ts` — proposal §4C, 2026 only. **No GSS row.**
- [ ] **A5** Resolve every **‡** row to a citable primary and write its `source`.
      A row that will not resolve is **dropped, and the drop is named in the
      completion note** — not softened with a note field, not guessed. The
      lunisolar observances (Pongal, Thaipusam, Chap Goh Meh, Qingming, Hungry
      Ghost, Mid-Autumn) and Christmas on A Great Street's start date are the
      ones this task exists for. Hungry Ghost 2027 and Chap Goh Meh 2027 are
      the two likeliest drops.
- [ ] **A6** `index.ts` — `ALL_KEY_DATES` as the concatenation in
      `KEY_DATE_SETS` order, plus re-exports so no consumer imports a data file
      directly.
- [ ] **A7** `select.ts` — the seven selectors below, each with the doc comment
      this repo expects (what it answers, and the one thing it gets wrong if
      written naively).

```ts
keyDatesForSets(enabled: readonly KeyDateSet[]): KeyDate[]
splitByShape(dates: KeyDate[]): { days: KeyDate[]; seasons: KeyDate[] }
keyDatesByDay(days: KeyDate[]): Map<string, KeyDate[]>
seasonsInMonth(seasons: KeyDate[], year: number, month: number): KeyDate[]
upcomingKeyDates(dates: KeyDate[], now: Date, limit: number): KeyDate[]
staleSets(enabled: readonly KeyDateSet[], year: number, month: number): KeyDateSet[]
formatKeyDateRange(date: KeyDate): string
```

Three of them have a trap worth naming in the code:

- **`keyDatesForSets` dedupes on `start` + `name`**, keeping the entry whose
  set comes first in `KEY_DATE_SETS` — that ordering *is* the precedence rule,
  so `global` wins Christmas and the comment says so.
- **`seasonsInMonth` compares day-key strings, not `Date`s.** `YYYY-MM-DD`
  sorts lexicographically the way it sorts chronologically — the same property
  `SocialPostList` already relies on for its Upcoming/Past split. A season
  overlaps when `start <= lastDayOfMonth && (end ?? start) >= firstDayOfMonth`;
  testing only `start`'s month misses every season you are standing in the
  middle of.
- **`staleSets` compares the horizon against the month's *first* day.** Against
  the last day, a half-covered December would nag about data it has.

### Tests — `data.test.ts`

- [ ] Every `start` and every `end` returns non-null from `dayKeyToDate`
      (which already rejects `2026-02-30` by round-tripping the parts).
- [ ] `end`, when present, is strictly greater than `start`.
- [ ] Ids are unique across all three sets.
- [ ] Every entry's `set` matches the file it came from.
- [ ] Every entry has a non-empty `source`.
- [ ] Every entry's `end ?? start` is `<= CURATED_THROUGH[set]`, **and** each
      set's horizon equals the maximum `end ?? start` within it — drift is
      impossible in either direction.
- [ ] The eleven gazetted holidays are asserted by name and date for 2026 and
      2027, spelled out rather than derived. One authoritative source, one
      table, pinned directly.
- [ ] **No assertion reads the current date.**

### Tests — `select.test.ts`

- [ ] Christmas Day collapses to one entry with A+B on, and stays `global`.
- [ ] 9 Aug 2026 keeps both *National Day* and *National Day Parade*.
- [ ] `splitByShape` puts a single day in `days` and an `end`-bearing entry in
      `seasons`.
- [ ] `seasonsInMonth` catches a season starting before and ending after the
      visible month (i Light does not do this; construct a fixture that does).
- [ ] `upcomingKeyDates` honours `limit`, excludes yesterday, includes today.
- [ ] `staleSets` returns `['sg-events']` for Nov 2027 with all three on, and
      `[]` for Dec 2026.

**Acceptance:** gate green. `grep -r 'key-dates' packages/web/src --include='*.tsx'`
returns nothing — the phase is genuinely dark.

---

# Phase B — Colour tokens and the appearance map

**Goal:** three set colours exist as CI tokens in both themes, with their
contrast measured rather than assumed.

**Files:** `packages/web/src/index.css` (modified),
`packages/web/src/lib/key-dates/appearance.ts` +
`appearance.test.ts` (new).

### Tasks

- [ ] **B1** Tier 1 primitives in `:root`, beside the existing `--c-*` block —
      light `--c-violet-600/-50`, `--c-rose-600/-50`, `--c-teal-600/-50`, and
      dark `--c-dark-violet-*`, `--c-dark-rose-*`, `--c-dark-teal-*`. Tier 1 is
      the only place a raw hex may live and this is the whole hex budget.
      Starting values in proposal §6.
- [ ] **B2** Tier 2 aliases: `--color-dateset-global` / `-tint`,
      `--color-dateset-sg-holidays` / `-tint`, `--color-dateset-sg-events` /
      `-tint`, declared in `:root` and re-pointed in `.dark`.
- [ ] **B3** Indirection inside `@layer base :root` — `--ds-global`,
      `--ds-global-tint`, … pointing at the tier-2 names. This hop is not
      optional: Tailwind owns the `--color-*` namespace, and the existing
      `--fb-*` block carries the comment explaining exactly this.
- [ ] **B4** `@theme inline` exposure — `--color-keydate-global: var(--ds-global)`
      and its five siblings, giving use-site utilities `text-keydate-global`
      and `bg-keydate-global-tint`. The tier-2 and `@theme` names must differ
      or the entry is self-referential; `--fb-*` → `--color-status-*` is the
      precedent.
- [ ] **B5** Measure contrast for all six pairs — label ink on its own tint,
      light and dark. **≥ 4.5:1**, the bar `--color-feedback-error-on`'s
      comment already sets. Adjust the tier-1 values until they clear it and
      **record the six ratios in the completion note**, because a number
      nobody wrote down is a number nobody checked.
- [ ] **B6** `appearance.ts` — one exhaustive
      `Record<KeyDateSet, { label: string; dot: string }>` of **complete class
      strings**. Never `bg-keydate-${set}-tint`: Tailwind scans source text, a
      composed class name produces no CSS, and the failure is a silent
      colourless pill rather than a build error. The comment says so at the map.

### Tests

- [ ] `appearance.test.ts` — the map's keys are exactly `KEY_DATE_SETS`, and
      every value's class strings are non-empty and mention the set's own token
      name (the cheap guard against a copy-paste that leaves two sets sharing a
      hue).

**Acceptance:** gate green, plus the six ratios recorded. Nothing renders these
yet — a `grep` for `keydate-` in `components/` returns nothing.

**Risk:** the triad is the most subjective decision in the build and the one
Phase F is most likely to send back. Keeping every hex in tier 1 means a
re-tune is six lines, not a component sweep.

---

# Phase C — The preference and the menu

**Goal:** the control exists and remembers, mounted nowhere.

**Files:** `packages/web/src/lib/key-dates-prefs.ts` + test,
`packages/web/src/components/brand/KeyDatesMenu.tsx` + test (all new).

### Tasks

- [ ] **C1** `key-dates-prefs.ts` — `getEnabledSets(brandId)` /
      `setEnabledSets(brandId, sets)` over key `bf_key_dates_${brandId}`,
      storing a comma-joined list. `sidebar-prefs.ts`'s shape verbatim,
      including its swallowed failure and the comment explaining it: private
      browsing gets the default, never a crash.
- [ ] **C2** Reading is **validating, not casting.** Unknown members are
      dropped, so a stored `sg-culture` from a renamed set — or a hand-edited
      key — degrades to a smaller list rather than colouring nothing with a
      `Record` lookup that misses. A missing key returns
      `DEFAULT_ENABLED_SETS`; a key holding an empty string returns `[]`, which
      is a user who switched everything off and must not be handed the default
      back.
- [ ] **C3** `KeyDatesMenu.tsx` — pure. Props: `enabled: KeyDateSet[]`,
      `onChange(sets)`. `DropdownMenu` + three `DropdownMenuCheckboxItem`s,
      already exported from `components/ui/dropdown-menu.tsx` — no new
      primitive, no new dependency. Each row: the set's swatch (`dot` from
      `appearance.ts`), its label, its description underneath.
- [ ] **C4** Trigger reads `Key dates` with a count when any are on. Sentence
      case, CI tokens, no raw values.

### Tests

- [ ] Prefs: default on a missing key; round-trip; `[]` survives as `[]`;
      an unknown member is dropped; a throwing `localStorage` returns the
      default instead of propagating.
- [ ] Menu: three items with the right labels; toggling one calls `onChange`
      with the set added or removed and **leaves the other two alone**;
      `aria-checked` tracks `enabled`; the trigger's count matches.

**Acceptance:** gate green. `KeyDatesMenu` is imported by its test and nothing
else.

---

# Phase D — The calendar view

**Goal:** the first phase a user can see. Key dates render on the month grid,
in colour, switched by the menu, remembered per brand.

**Files:** `KeyDateStrip.tsx` + test (new); `CalendarMonthGrid.tsx`,
`SocialCalendarView.tsx`, `SocialCalendarPage.tsx` and their tests (modified).

### Tasks

- [ ] **D1** `KeyDateStrip.tsx` — pure. Takes `seasons: KeyDate[]`, renders one
      band each: swatch, name, `formatKeyDateRange`. Renders `null` for an
      empty array, so a month with no seasons is unchanged rather than carrying
      an empty container.
- [ ] **D2** `CalendarMonthGrid` — new optional props `keyDates: KeyDate[] = []`
      and `staleSets: KeyDateSet[] = []`. Split with `splitByShape`, mount the
      strip under the month header, index the days with `keyDatesByDay`, pass
      each cell its own list.
- [ ] **D3** `DayCell` markers — above the chips, below the date number,
      `pointer-events-none` so the cell's existing full-bleed add button keeps
      the click. Tinted label per `appearance.ts`, truncating. Two or more on
      one day stack; three would crowd a 130px cell, so cap the rendered
      markers at two and let the strip and the list carry the rest — **and say
      so in the code**, per the no-silent-caps habit.
- [ ] **D4** The cell button's `aria-label` gains the day's key dates —
      `New post on Sun 8 Nov — Deepavali`. This is what makes the click-through
      announced rather than merely convenient, and it carries the full name a
      truncated marker loses.
- [ ] **D5** The beyond-horizon line — one sentence under the month header when
      `staleSets` is non-empty: *"Singapore events are curated through
      December 2026."* Muted, not a warning colour: the data running out is a
      fact, not a fault.
- [ ] **D6** `SocialCalendarView` — mount `KeyDatesMenu` in `PageHeader`'s
      action slot, left of the view toggle; thread `keyDates`, `staleSets`,
      `enabledSets`, `onEnabledSetsChange`. Still pure.
- [ ] **D7** `SocialCalendarPage` — `enabledSets` state seeded from
      `getEnabledSets(brandId)`, written back on change, and the selectors run
      here (`keyDatesForSets`, then `staleSets` against the cursor). No
      `useMemo`: ~200 entries filtered once per render is the budget
      `groupByDay` already spends on every post.
- [ ] **D8** The seed must **re-read when `brandId` changes** — switching brands
      inside the app must not carry the previous brand's sets. A bare
      `useState(() => getEnabledSets(brandId))` initialises once and quietly
      does the wrong thing on the second brand.

### Tests

- [ ] `KeyDateStrip` — one band per season, `null` on empty, range formatting.
- [ ] Grid, no mocks: a single-day entry lands in its own cell; a season lands
      in the strip and in **no** cell; a marked cell's add button still fires
      `onNewPost` with the right day key; the `aria-label` carries the name;
      the third marker on one day is dropped; the horizon line appears only
      with a stale set.
- [ ] Grid with `keyDates` omitted renders exactly as before — the existing
      suite is the assertion, and it must pass **unmodified**.
- [ ] `SocialCalendarPage` with the view stubbed: default sets on first open;
      a toggle writes through to storage; a `brandId` change re-reads.

**Acceptance:** gate green. The existing `CalendarMonthGrid`,
`SocialCalendarView` and `SocialCalendarPage` suites pass with no assertion
changed — only additions.

---

# Phase E — The list view

**Goal:** the reading that answers "what is coming that I have not planned
for" — the part that earns the feature.

**Files:** `SocialPostList.tsx` + test (modified).

### Tasks

- [ ] **E1** Day-heading suffix — `Sun 8 Nov · Deepavali`, with the set's dot.
      Built beside `formatDayHeading`'s output rather than inside it:
      `formatDayHeading` is a pure string function used in two places and one
      of them is an `aria-label`.
- [ ] **E2** The **Key dates** block at the head of `Upcoming` —
      `upcomingKeyDates(dates, now, 6)`, each row a swatch, a date, a name and
      its `note`. Grouped under the set's name so the colour is never the only
      carrier.
- [ ] **E3** The block renders only when the list has key dates to show, and
      the empty-state copy (*"Nothing planned yet…"*) is unchanged — a calendar
      with no posts but eight key dates must still read as empty of **your**
      work, which is what that sentence is about.
- [ ] **E4** A day heading only gains a suffix when the day already has posts.
      Key dates never create a day group — the list is a plan of your posts,
      and 40 empty groups would bury it. E2 is why that is safe.

### Tests

- [ ] Suffix appears on a day with both a post and a key date, and not on a day
      with only a key date.
- [ ] The Upcoming block lists the next six, respects the limit, and is absent
      when no sets are on.
- [ ] The empty-state sentence still renders with zero posts and eight key
      dates.
- [ ] The existing `SocialPostList` suite passes **unmodified**.

**Acceptance:** gate green; existing suite untouched.

---

# Phase F — Live pass

**Non-skippable**, per 1.22.0 §7. This phase moves colour onto a surface that
had none, and colour is the one thing a test cannot check.

Run at 1440×1000, **both themes**, on a seeded brand with posts in the months
below.

### The list

- [ ] **August 2026, all three sets on** — the worst case by construction: the
      Hungry Ghost month and Singapore Night Festival overlap as two
      simultaneous seasons, National Day and its observed Monday are two
      adjacent single days, and NDP shares 9 August with National Day. Both
      themes.
- [ ] A cell carrying a marker **and** three post chips — does the cell still
      read as a day's plan, or as a label with posts under it?
- [ ] A three-marker day, confirming the cap drops the third and the strip or
      list still carries it.
- [ ] Click-through: a marked cell opens the editor seeded to **that** day.
- [ ] Keyboard: tab to the menu, toggle all three with the keyboard alone,
      confirm the grid updates and focus is not dropped when the menu closes.
      (`deferUntilMenuClosed` exists for the toast case; this is a plainer one,
      but the same focus scope.)
- [ ] Reload — the sets survive. Switch brands — they do not follow.
- [ ] November 2027 with `sg-events` on: the horizon line, and no phantom
      markers.
- [ ] A month boundary where a season starts before the 1st (Hungry Ghost in
      September 2026) — the band shows the true range, not a clipped one.
- [ ] The three hues are distinguishable side by side in **both** themes, and
      each label is readable on its own tint. If either fails, the fix is six
      lines in tier 1 (Phase B's risk note).

### Rules for the pass

- [ ] Any code changed during the pass is listed in the completion note. 1.22.0
      Phase G changed none and said so; that is the standard.
- [ ] **No fixtures left in the dev database.** 1.22.0 Phase G's demo rows broke
      `queries.live.test.ts` for the next person. Whatever is seeded is removed.

**Acceptance:** every box ticked, the note written, and the changelog entry
drafted with the final test count and its delta from 1482.

---

## Test-count expectations

Rough, for spotting a phase that quietly skipped its coverage:

| Phase | New tests |
| --- | --- |
| A | ~18 (7 data integrity, ~8 selector, gazetted-holiday table) |
| B | ~2 |
| C | ~10 |
| D | ~14 |
| E | ~6 |
| F | 0 |

**~1482 → ~1532.** A phase landing well under its row is worth a second look
before the gate is called green.

## Where this can go wrong

- **A wrong date ships silently and looks like a feature working.** It is the
  only defect class here with no test that can catch it, which is what A5's
  drop-rather-than-guess rule and the required `source` field are for.
- **The colour triad is subjective** and Phase F is the first honest read of it.
  Tier 1 keeps a re-tune cheap.
- **Set C expires.** By late 2027 the events set is empty and the horizon line
  is the only thing standing between a user and a calendar that looks broken.
  That line is not decoration; it is the feature's shelf life, made visible.
