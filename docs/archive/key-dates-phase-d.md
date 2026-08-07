# Phase D — the calendar view

**Status:** complete, 2026-08-06. Written against `main` at **1.22.1** + Phases
A–C (1588 passed | 68 skipped before this phase; the skips are the live-Postgres
suites).

Executes Phase D of
[`docs/executing/key-dates-implementation-plan.md`](../executing/key-dates-implementation-plan.md),
following [A](key-dates-phase-a.md), [B](key-dates-phase-b.md) and
[C](key-dates-phase-c.md).

**The first phase a user can see.** Three dark phases become one feature: the
data renders, in colour, switched by the menu, remembered per brand. Still no
migration, no route, no wire type, no server code. 2 files added, 4 modified,
+24 tests.

---

## 1. What was built

```
SocialCalendarPage    owns enabledSets, seeds it from storage, runs the selectors
      ↓
SocialCalendarView    mounts KeyDatesMenu in the header, threads the rest
      ↓
CalendarMonthGrid     splits by shape, mounts the strip, indexes the days
      ↓  ↓
KeyDateStrip          the seasons, as bands above the grid
DayCell               the single days, as markers in their cells
```

The split that carries the whole surface is **by shape, not by set**: a season
is a property of the month and goes above the grid; a single day is a property
of its day and goes in the cell. Painting a season into every covered cell would
put a marker on 29 of August's 31 days — the Hungry Ghost month and the Night
Festival overlap there — and bury the posts the grid exists to show.

## 2. D8 — the re-read, and why it is not a `useEffect`

The task names the bug: `useState(() => getEnabledSets(brandId))` initialises
**once**, so switching brands inside the app keeps the previous brand's sets
*and* writes them back under the new brand's key. A per-brand preference quietly
becomes a global one, and the symptom appears on the second brand you open.

The implementation is a render-phase reset rather than an effect:

```ts
const [enabledSets, setEnabled] = useState<KeyDateSet[]>(() => getEnabledSets(brandId))
const [seededFor, setSeededFor] = useState(brandId)
if (seededFor !== brandId) {
  setSeededFor(brandId)
  setEnabled(getEnabledSets(brandId))
}
```

An effect would work and would be more familiar, and it would also **paint one
frame of the previous brand's sets** before correcting itself — a visible flash
of the wrong calendar on every brand switch. React re-runs the component
immediately on a set-state during render, before touching the DOM, so this
variant never commits the stale value. It is the documented pattern for exactly
this case, and the comment says so rather than leaving it looking like a
mistake.

The test drives it through an actual `rerender` with a different `brandId` and
two different stored values, because a test that only mounted twice would pass
against the bug.

## 3. Decisions the plan left to the implementation

### `curatedThroughLabel` — an eighth selector

D5 needs *"Singapore events are curated through December 2026."* The month
string had to come from `CURATED_THROUGH`, and putting that formatting in the
component would have made it reachable only through a render.

It answers at **month precision**, not day. `sg-holidays` is curated through
25 December 2027 because that is the last gazetted holiday — writing
*"curated through 25 December 2027"* invites the reader to wonder what happens
on the 26th, when the honest answer is that there are no more rows. The sentence
is about a month you are looking at, so the answer is a month.

It reuses `monthLabel`, so this line and the grid's own `‹ August 2026 ›` header
cannot render a month two different ways.

### The markers are `aria-hidden`, and the button's name carries them

D4 puts the day's key dates in the cell button's `aria-label`. Leaving the
visible marker in the accessibility tree as well would have a screen reader
announce *Deepavali* twice — once inside *"New post on Sun 8 Nov — Deepavali"*
and once as loose text in the same cell.

So the visible label is decoration and the button's name is the record. That
also settles what happens to the **third** marker on a crowded day: it is not
drawn, and it is still named. `MAX_CELL_MARKERS = 2` is a named constant whose
comment says outright that two is the *drawn* cap and not the known one, and the
test asserts both halves — `Third` is absent from the DOM and present in the
label.

### The strip names its set for a screen reader only

Phase B measured rose and teal at ΔE 8.4 under simulated protanopia, so the hue
cannot be the only carrier. The band gets `<span class="sr-only">Singapore
events: </span>`. Visually hidden rather than rendered because the strip already
carries a name and a date range per band and can hold four of them across a
month — three more words each would wrap it — while the colour does the job for
everyone who can use it.

### The menu is both props or neither

`SocialCalendarView` mounts `KeyDatesMenu` only when it has `enabledSets` **and**
`onEnabledSetsChange`. A menu with a value and no handler is a control that
silently does nothing; the alternative — making both required — would have been
a breaking prop change to a component whose whole suite is meant to keep passing
untouched. There is a test for each half of the condition.

### The horizon line is one sentence per stale set

The plan shows one sentence. Past January 2028 all three sets are stale, and
naming them in one merged clause reads worse than three plain sentences. They
render inside one muted `<p>`, in `KEY_DATE_SETS` order because `staleSets`
returns them that way.

Muted, not a warning colour: data running out is a fact, not a fault.

### Padding days show markers but are not announced

A cell from the neighbouring month renders its key-date markers, exactly as it
already renders that day's post chips. It has no add button — creating there
would write into a month nobody is looking at — so it also has no `aria-label`,
and its key dates are visible without being announced.

This is inherited behaviour rather than a new gap: the same is already true of a
padding day's posts, whose chips carry their own names but whose cell has no
name of its own. Noted so Phase F reads it as intended rather than as a bug.

## 4. The files

| File | Change |
| --- | --- |
| `components/brand/KeyDateStrip.tsx` | **new** — the season bands |
| `components/brand/KeyDateStrip.test.tsx` | **new** — 4 tests |
| `components/brand/CalendarMonthGrid.tsx` | `keyDates` + `staleSets` props, the strip, the horizon line, cell markers, the `aria-label` |
| `components/brand/SocialCalendarView.tsx` | the menu in `PageHeader`'s action slot, four props threaded |
| `components/brand/SocialCalendarPage.tsx` | `enabledSets` state, the brand re-seed, the storage write, the selectors |
| `lib/key-dates/select.ts` | `curatedThroughLabel` |

## 5. What the 24 tests hold

**The grid with `keyDates` omitted is the existing suite**, unmodified, and it
is the proof that the default renders exactly what the grid rendered before.
Everything below is additive.

**A season lands in the strip and in no cell**, asserted by counting: exactly one
element in the document says `i Light`. The single most consequential decision in
the plan, as a single assertion.

**A marked cell's add button still fires with the right day key**, and the marker
carries `pointer-events-none` — the click-through the whole design rests on.

**A season starting before the visible month shows its true range**, `13 Jul –
10 Aug` rather than a range clipped to the 1st.

**The horizon line appears only with a stale set**, and names the right month.

**The page test drives a real `brandId` change** through `rerender` with two
different stored values (§2).

**A brand that switched everything off stays off** — the empty-string case from
Phase C, now proven end to end through the page rather than only at the storage
boundary.

**Staleness is measured against the cursor, not against today**: the test walks
the month cursor forward fourteen times and watches `sg-events` become stale,
which is the behaviour that makes the line about the month you are looking at.

## 6. Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1612 passed | 68 skipped (142 files)
pnpm -F @brandfactory/web build   clean in 452ms
```

Repo-wide **1588 → 1612 (+24)**, 141 → 142 files.

### The existing suites, checked properly

The acceptance criterion is that `CalendarMonthGrid`, `SocialCalendarView` and
`SocialCalendarPage` pass **with no assertion changed — only additions**. Read
off the diff rather than asserted:

```
git diff -- …/CalendarMonthGrid.test.tsx  | grep '^-'   → nothing
git diff -- …/SocialCalendarView.test.tsx | grep '^-'   → nothing
git diff -- …/SocialCalendarPage.test.tsx | grep '^-'   → one line
```

That one line is `renderPage`'s signature, which gained a defaulted parameter:

```diff
-const renderPage = () => render(<SocialCalendarPage brandId="b-1" app={APP} />)
+const renderPage = (brandId = 'b-1') => render(<SocialCalendarPage brandId={brandId} app={APP} />)
```

Every existing `renderPage()` call behaves identically. The page suite's stub
also gained four props, three spans and a button, and its `beforeEach` gained an
in-memory `localStorage` — all additive. **No assertion in any of the three
changed.**

## 7. Carried forward

- **Phase E is the list view**, and it is the half that earns the feature: day
  headings only gain a suffix on days that already have posts, so a Deepavali
  nobody has planned for is currently invisible on the surface whose job is to
  say what is coming. `upcomingKeyDates` has been written and tested since Phase
  A and still has no caller.
- **Phase F is now genuinely necessary rather than procedural.** Everything in
  this phase is visual and none of it has been looked at.
- **`KEY_DATE_APPEARANCE` still has only `label` and `dot`.** The strip, the
  markers and the menu all fit those two shapes, so the map did not need a third
  after all.

## 8. Caveats

- **Nothing was run in a browser.** jsdom does not lay out a grid, so *"does a
  cell carrying a marker and three chips still read as a day's plan"* — the plan's
  own Phase F question — is untested and untestable here.
- **The marker truncates with no tooltip.** Deliberate, and the cost is stated
  in the proposal: the strip and the list both carry full names, and the cell's
  `aria-label` carries them too, so nothing is knowable *only* from the cell.
  Whether a 130px cell truncates *Chinese New Year (observed)* into something
  useless is a Phase F judgement.
- **Two markers plus three chips has never been rendered at real size.** The cap
  is reasoned, not observed; it is on Phase F's list.
- **The horizon line past January 2028 renders three sentences in one paragraph.**
  Correct, and wordier than anything a user will see before 2028.
