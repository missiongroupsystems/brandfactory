# Phase E — the list view

**Status:** complete, 2026-08-06. Written against `main` at **1.22.1** + Phases
A–D (1612 passed | 68 skipped before this phase; the skips are the live-Postgres
suites).

Executes Phase E of
[`docs/executing/key-dates-implementation-plan.md`](../executing/key-dates-implementation-plan.md),
following [A](key-dates-phase-a.md), [B](key-dates-phase-b.md),
[C](key-dates-phase-c.md) and [D](key-dates-phase-d.md).

**The half that earns the feature.** 0 files added, 3 modified, +9 tests. Still
no migration, no route, no wire type, no server code.

---

## 1. What was built

Two readings of the same dates, answering different questions:

**Day-heading suffixes** — `Today · ● National Day`. These annotate the days you
have **already planned into**. Cheap, and strictly additive: the heading exists
anyway. Single days only, because a season has no one day to hang off and the
grid's strip is where seasons live.

**The Key dates block**, at the head of `Upcoming` — the next six entries across
every enabled set, with dates, names, notes and set labels. This is the part
that earns the feature: suffixes only ever appear on days that already have
posts, so without this block a Deepavali nobody has planned for is invisible on
the one surface whose job is to say what is coming. `upcomingKeyDates` was
written and tested in Phase A and has had no caller until now.

## 2. The one deviation: chronological, not grouped by set

**The plan's E2 and the proposal's §6 both describe the block as grouped under a
per-set heading. It is one chronological list instead.**

The reason both documents give for grouping is explicit — *"so the colour is
never the only carrier"*. That requirement is real and is met: every row names
its set in words, at the end of the line, beside the swatch. Nothing about which
set a date belongs to is knowable only from a hue, which matters more here than
anywhere given Phase B measured rose and teal at ΔE 8.4 under simulated
protanopia.

What grouping costs is the axis the block exists on. With six entries over three
sets you get something like:

```
Global               9 Sep   9.9 sale
                    10 Oct   10.10 sale
Singapore holidays  25 Sep   Mid-Autumn Festival
Singapore events    21 Aug   Singapore Night Festival     ← the soonest, last
```

The block answers *what is coming*. Sorting by set puts the nearest date at the
bottom and makes the reader reassemble the timeline in their head. Chronological
with a named set per row satisfies the stated reason and keeps the stated
purpose:

```
● 5–9 Aug     Singapore Night Festival        Singapore events
● 20 Aug      Deepavali                       Singapore holidays
```

Flagged rather than done quietly because it contradicts the letter of two
approved documents. If the grouped form is wanted, it is a `reduce` over the
same array and no change anywhere else.

## 3. The bug a test caught, and it was the component's

The first draft laid the heading suffix out with flexbox `gap` and no literal
whitespace. It looked correct and it read as:

> Today·National Day

A heading's accessible name is its **text content**, and CSS spacing contributes
nothing to it — `gap-1` is invisible to the accessibility tree, and the middot
was `aria-hidden`, so the two words ran together with no separator at all.

The fix is a real `{' · '}` text node rather than a styled gap. The middot is no
longer `aria-hidden`: it is now the thing carrying the separation, and a screen
reader that pauses on it or skips it is right either way — what it must not do
is say "TodayNational Day".

Worth recording because it is the class of defect this whole surface is prone
to: everything here is decoration next to content, and jsdom's `textContent` is
one of the few instruments that can tell the difference.

## 4. Decisions the plan left to the implementation

### `Upcoming` opens for key dates alone

The section was gated on `upcoming.length > 0`. A brand whose posts are all in
the past still has a next Deepavali, and hiding it because nothing is scheduled
would be the same silence the block exists to break — so the condition is now
`upcoming.length > 0 || upcomingKeys.length > 0`.

**With `keyDates` empty the condition is exactly what it was**, which is why the
existing suite did not move.

### Past days get suffixes too

E1 says "day-heading suffix" without restricting to Upcoming, and `DayGroups`
renders both regions. A post that went out on Deepavali is worth knowing about
when you are reading back over what you did, so both regions get them. It costs
one shared prop rather than a second code path.

### The empty state is decided before anything key-date-shaped renders

E3's requirement is that eight key dates and zero posts still reads as empty.
The existing early return already did that, and the implementation's only job
was **not to move it** — a Key dates block above that sentence would have made
the surface look populated while the sentence said it was not. The comment now
at the early return says so, so nobody helpfully reorders it later.

The consequence, stated plainly: with no posts at all, the block does not
render. That is intended.

### The block is a bordered card, the suffixes are inline

The block sits on `bg-card` with a border, like a `PostRow`; the suffixes are
plain text in an existing heading. They are different weights on purpose — the
block is a thing you read, the suffix is an annotation on something else.

### Seasons appear in the block but never in a suffix

`splitByShape(keyDates).days` feeds the suffixes; the unsplit list feeds the
block. So the Hungry Ghost month is listed in Upcoming and annotates no day
heading, which is the same shape/surface rule the grid uses — and the reason the
block includes seasons at all.

## 5. The files

| File | Change |
| --- | --- |
| `components/brand/SocialPostList.tsx` | `keyDates` prop, `KeyDatesBlock`, heading suffixes, the Upcoming condition |
| `components/brand/SocialCalendarView.tsx` | one line — `keyDates` threaded to the list |
| `components/brand/SocialPostList.test.tsx` | +9 tests, appended |

`SocialCalendarPage` needed **nothing**: it has computed `keyDates` since D7 and
the view was already receiving it for the grid.

## 6. What the 9 tests hold

**A day with a post gets the suffix; a day without one does not get a group.**
E4 in two assertions — and the second is paired with proof the date is still
visible in the block, which is what makes never creating a group safe.

**The block is in date order with sets named**, checked by reading two rows in
order rather than by asserting a set of strings — §2's decision, as an assertion.

**The cap is six and the past is excluded.** The fixture deliberately starts on
the 12th so none of the nine entries lands on a day that already has a post: the
first draft used the 10th, which is `soon`'s day, and the suffixed heading
matched the block's own row by text. The test was wrong, not the component, and
the fixture now says why in a comment.

**A season running right now survives** — `end ?? start`, so a ghost month you
are three days into is listed rather than treated as past.

**Upcoming opens for key dates with every post in the past.**

**Eight key dates and zero posts still reads "Nothing planned yet"**, and the
block renders nothing.

**Every assertion written before this phase runs with `keyDates` omitted**, which
is the real proof that the default is unchanged.

## 7. Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1621 passed | 68 skipped (142 files)
pnpm -F @brandfactory/web build   clean in 463ms
```

Repo-wide **1612 → 1621 (+9)**, 142 files unchanged (no new test file).

The acceptance criterion is that the existing `SocialPostList` suite passes
**unmodified**. Read off the diff rather than asserted:

```
git diff -- …/SocialPostList.test.tsx     | grep '^-'  → nothing
git diff -- …/SocialCalendarView.test.tsx | grep '^-'  → nothing
```

**Zero lines removed.** The suite was appended to and nothing else.

## 8. Carried forward

- **Phase F is all that remains**, and it is non-skippable. Every visual
  decision in D and E is unverified by eye.
- **§2 is the open question for the live pass.** If the chronological block
  reads worse than the grouped one at real width, the grouped form is a `reduce`
  and no other change.
- **The block's six-row cap is `UPCOMING_KEY_DATES_SHOWN`**, one constant, if
  the live pass wants a different number.
- **Nothing was added to `KEY_DATE_APPEARANCE`.** `label` and `dot` covered all
  seven surfaces across D and E, so Phase B's two-shape map was the right size.

## 9. Caveats

- **Nothing was run in a browser.** The block's column widths — a fixed `w-28`
  for the date against a truncating name — have never been seen against a real
  range like `18 Dec 2026 – 3 Jan 2027`. That string is the widest the formatter
  can produce and no row in the dataset generates it today, so the live pass
  should check the widest real one (`23 Jul – 16 Aug`) and trust the rest.
- **A day with several key dates gets several suffixes on one heading**, uncapped
  — unlike the grid's cells, which stop at two. A heading has a whole line to
  itself so the pressure is different, but 9 August 2026 with all sets on renders
  two, and nothing has rendered three.
- **The set label repeats on every row of the block.** Correct for
  accessibility and slightly redundant to the eye when all six rows are the same
  set. A grouped form would fix that and cost §2; worth a look in Phase F.
