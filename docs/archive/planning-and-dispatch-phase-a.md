# Phase A — the honest dialog

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** (1688
passed | 75 skipped before this phase; the skips are the live-Postgres suites).

Executes Phase A of
[`docs/archive/planning-and-dispatch-implementation-plan.md`](planning-and-dispatch-implementation-plan.md),
which builds
[`docs/archive/planning-and-dispatch-on-the-social-calendar.md`](planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated. This file records what was
written, where, and the four judgments that were made while writing it.

**No migration, no route, no server change, no model.** 4 files added, 6
modified. **1713 passed | 75 skipped** — +25 tests.

---

## 1. What was missing, in one sentence each

**The dialog would not say what it was writing for.** `<DialogTitle>{post ?
'Edit post' : 'New post'}</DialogTitle>` was the whole header. A modal that
covers the page takes away the brand rail's answer to *which brand is this?* and
put nothing in its place.

**Both facts were already on the page.** `SocialCalendarPage` calls
`useBrand(brandId)` — which returns `BrandWithSections`, every guideline section
included — and used the result *only as a loading gate*. It also computes
`keyDatesForSets(enabledSets)` and passes it to the grid and to the list. Neither
reached the dialog. This was never a data problem; it was a dialog written before
either fact was available and never revisited.

So the phase is two pure functions, one component, and four props.

## 2. `brandContextState` — the number, and why it is computed

`packages/shared/src/brand/context-state.ts`. Returns
`{ written, total, unwritten }` over anything shaped `{ label, body }`.

**A section counts as written when `sectionBodyToLine(body) !== null`** — the
exact test `brandTldrLine` already applies when it refuses to let an empty
`TL;DR` blank a typed description. That is the load-bearing decision in the whole
phase. The rail's suggestion chips create labelled rows with **empty bodies** on
purpose, so *the row exists* and *the section says something* are two different
facts, and a `● Brand context loaded` dot that lit up for the first would be lit
on precisely the brand that needs the warning. One rule for *does this hold
words*, two readers, so the hub's description line and this indicator cannot
disagree about the same section.

**It is in `shared`, not in `web`.** Two reasons, one of them future: it is a
rule about a wire shape, and Phase F's brief has to put the same number in front
of the user that Phase E's prompt is built from. A brief reading *2 of 8 sections
written* beside a header assembled from a different count would be two answers to
one question.

`unwritten` is returned in the order given — a surface listing the gaps follows
the user's own section ordering rather than inventing one. Nothing reads it yet;
it costs one array and it is the field a "what is missing" line will want.

## 3. `keyDatesOnDay` — and the function it deliberately does not reuse

`packages/web/src/lib/key-dates/select.ts`. Returns `{ days, seasons }`: days
match `start === dayKey`, seasons match `start <= dayKey && (end ?? start) >=
dayKey`.

**Split rather than concatenated**, because they are different claims. *Today is
National Day* and *today is inside the Hungry Ghost month* are not one sentence,
and a caller that wants to render them alike can concatenate what it gets back —
which is exactly what the form does, days first.

**Not `seasonsInMonth` with a one-day range.** That function answers a
month-shaped question and returns `true` for a season that ended three weeks
before the day being asked about. Containment and overlap coincide only when the
window is one day long, and expressing it that way would leave the next caller to
work out which of the two they were given.

An empty `dayKey` matches nothing, which is what an empty date field must show:
no chips, rather than every season in the set. Day keys compare as strings — the
invariant the whole file already rests on.

## 4. `BrandContextStrip` — two rows, and one link with a cost

`packages/web/src/components/brand/BrandContextStrip.tsx`. Pure, no query, no
router context needed to test it.

**Row 1** is the brand mark, the name, and one of three lines:

| State | Line |
| --- | --- |
| `written === total`, `total > 0` | `Brand context loaded — 7 sections` |
| `0 < written < total` | `Brand context is thin — 1 of 8 sections written` |
| `written === 0`, or `total === 0` | `No brand context yet` |

The trap the plan named is the third row: a brand with no sections at all is
`written === 0, total === 0`, and rendering that as `0 of 0 sections written`
invites the reader to go looking for rows that do not exist. Both zero states
collapse to the same honest sentence. The singular is handled too — `1 section`,
not `1 sections`.

**Row 2** is one chip per key date on the day, coloured through
`KEY_DATE_APPEARANCE[set].label` and dated through `formatKeyDateRange`, with the
set name in an `sr-only` span — `KeyDateStrip`'s idiom verbatim, including its
reason: under simulated protanopia the rose and teal inks sit at ΔE 8.4, so
colour is the fast path and never the only path. A day with nothing on it renders
no `<ul>` at all rather than an empty container.

**Two judgments worth stating.**

**It renders `<BrandMark>` rather than calling `brandInitials`.** The plan asked
for `brandInitials` imported rather than reimplemented; using the whole component
imports it transitively *and* keeps the hue rule, the code-point-safe split and
the `aria-hidden` decision, all of which a bare initials call would have dropped
on the floor. Same rule, more of it reused.

**The link out of the dialog costs whatever is half-typed behind it.** `Add brand
context` navigates to `/brands/$brandId/context`, and nothing preserves the form.
This is accepted rather than overlooked: the link only appears when context is
thin or absent, which is the state a user reads *before* they start typing, and
the alternative is naming a problem with no way to act on it. If real use says
otherwise, the cheap fix is to drop the link and leave the sentence. It is a
compiler-checked `<Link to=… params=…>`, so the path is checked against the route
tree rather than being a string.

## 5. Where the strip renders, and what it reads

Inside `PostEditorForm`, as its first element — under the dialog title, above
`Platform`. Outside the `<form>`, because it is not a field.

**Row 2 reads the form's own `date` state, never `seedDayKey`.** The seed is what
the dialog opened on; the field is what the post is *for*, and the two part
company the instant anyone touches the date picker. A chip that kept announcing
the day you opened on would be a fact that had quietly stopped being one. This is
asserted: change the date from 9 August to 14 February and `National Day` leaves,
`Valentine's Day` arrives, and the Hungry Ghost season goes with the August date.

The threading is `SocialCalendarPage` → `SocialCalendarView` → `PostEditorDialog`
→ `PostEditorForm`. **Both new props are optional with empty defaults**, the
plan's house rule: with no `brand`, the dialog renders exactly what it rendered
before this phase, which is asserted as its own test.

The view passes its `keyDates` array **whole** and the form narrows it. One
selection, at the point that knows which day it is about.

## 6. The dialog now scrolls

`DialogContent` is `fixed top-[50%] translate-y-[-50%]` with no height cap and no
overflow rule, so a tall dialog clips against the viewport instead of scrolling.
This was already reachable at 800px with the attachment picker open; two more
rows reach it one row sooner.

**Capped on this dialog, not in the primitive**: `max-h-[calc(100dvh-4rem)]
overflow-y-auto`. Every other dialog in the app is short, and widening the blast
radius to fix one form is how a shared component acquires a rule it does not
need. The cost is that the footer and the close button scroll with the content
rather than pinning — a grid-template split that kept them fixed would have to
know how many rows the fragment renders, which changes with the strip's presence.

## 7. Files

**Added**

```
packages/shared/src/brand/context-state.ts
packages/shared/src/brand/context-state.test.ts
packages/web/src/components/brand/BrandContextStrip.tsx
packages/web/src/components/brand/BrandContextStrip.test.tsx
```

**Modified**

```
packages/shared/src/index.ts                              export
packages/web/src/lib/key-dates/select.ts                  + keyDatesOnDay
packages/web/src/lib/key-dates/select.test.ts             + 5 tests
packages/web/src/components/brand/PostEditorDialog.tsx    strip, 2 props, scroll cap
packages/web/src/components/brand/PostEditorDialog.test.tsx + 5 tests
packages/web/src/components/brand/SocialCalendarView.tsx  brand + keyDates through
packages/web/src/components/brand/SocialCalendarPage.tsx  brand through
```

## 8. Verified

The full gate: `pnpm typecheck` (10 packages), `pnpm lint`, `pnpm format:check`,
`pnpm test` — **1713 passed | 75 skipped** — and `pnpm -F @brandfactory/web
build`.

The 25 new tests, by claim:

- `context-state.test.ts` (6) — an empty-bodied section is unwritten; a
  whitespace-only body is unwritten; `total` counts rows and not labels; a brand
  with no sections is `0/0`; the mixed case names what is missing, in order.
- `select.test.ts` (5) — a season matches on its first, a middle and its last
  day, and not on the day after or the day before; a single day matches only its
  own key; a day inside a season returns both, separately; an empty key matches
  nothing.
- `BrandContextStrip.test.tsx` (9) — each of the three lines; the singular; the
  link appears only when there is something to fix and points at the right
  brand; the chips carry their set name in text; no chips renders no second row.
- `PostEditorDialog.test.tsx` (5) — the strip names the brand and its state; the
  seeded day's dates show, in another year's do not; **changing the date field
  changes the chips**; clearing the date clears them and leaves row 1; with no
  `brand` prop the dialog is unchanged.

## 9. Caveats

- **Not run in a real browser.** The plan's trap — *check the dialog at 800px
  viewport height* — is unverified: Docker was not running, so the dev stack
  (Postgres → migrate → seed → `pnpm dev`) could not be brought up. The scroll
  cap is reasoned, not observed. It is the one thing in this phase a test cannot
  answer, since jsdom does not lay out.
- **`unwritten` has no reader.** It is returned and asserted and nothing renders
  it. Deliberate — see §2.
- **The strip does not appear in Door 3's split dialog yet.** Phase G's §G4 says
  it stays exactly where it is and both halves of the split sit under it. Nothing
  in this phase prevents that; nothing in it arranges for it either.
- **`brandContextState` counts sections, not quality.** Eight sections holding
  one word each read as `loaded`. The number is honest about what it measures and
  the plan's own risk list already names *a brand with no written sections gets a
  confident planner* as deliberate.

## 10. Carried forward

- **Phase F's brief reuses `brandContextState`** — that is why it landed in
  `shared` rather than beside the component.
- **Phase E's prompt wants the same number.** One call, one rule; a planner
  header assembling its own count would be the second answer to one question.
- **The dialog's scroll cap is the first height rule on any dialog in this app.**
  If a second dialog needs it, that is the point at which it belongs in the
  primitive rather than at the call site.
