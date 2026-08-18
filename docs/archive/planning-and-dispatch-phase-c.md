# Phase C — the month's arithmetic

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** with
Phases A and B landed (1745 passed | 75 skipped before this phase).

Executes Phase C of
[`docs/archive/planning-and-dispatch-implementation-plan.md`](planning-and-dispatch-implementation-plan.md),
which builds
[`docs/archive/planning-and-dispatch-on-the-social-calendar.md`](planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated.

**No server change, no migration, no model, and no money spent.** 4 files added,
3 modified. **1777 passed | 75 skipped** — +32 tests.

---

## 1. The most useful sentence on the surface, and it is free

> **National Day (9 Aug) has no post.** 31 days · 4 posts planned · 3 key dates
> unclaimed.

Every term in that line was already on the page before this phase. The post list
is loaded for the grid; the key dates are computed for the cells and the season
strip. Nothing was fetched, nothing was persisted and no model was called — the
phase is one pure module and one paragraph that reads it.

That is why it lands before the engine. Phase F is the first phase that spends
anything, and it needs this arithmetic to write its brief. But the arithmetic is
worth having on its own, which is the test every phase in this plan had to pass.

## 2. `postsByDayPlatform` is the one definition of *taken*

`packages/web/src/lib/social-plan.ts`. Returns
`Map<dayKey, Set<SocialPlatform>>`.

**This is the phase's whole correctness risk, and the plan named it before a
line was written.** The map has two readers: the sentence above, and — from
Phase F — the body of the request that asks a model for ideas. If a second rule
for *taken* ever appears, the planner proposes into days the summary has already
called full, and the bug presents as a model failure when it is an arithmetic
one. One function, two readers, and a paragraph in the file saying so, because
the next person to need this number will not have read this note.

Three decisions inside it:

- **A set of platforms, not a boolean and not a count** (Q3). One Instagram post
  and one LinkedIn post on a Tuesday is a normal Tuesday. A day that went
  `taken = true` after the first would refuse the second, and a count would make
  the planner reason about *how full* a day is, which is not a question it was
  asked.
- **Every day key comes from `groupByDay`.** `calendar.ts` opens with the
  invariant that a wire timestamp is UTC and a calendar is local. A second
  `new Date(post.scheduledAt)` in this file would be a second answer to *which
  cell does this post belong to*, and the two disagree for every post after
  local 16:00 in Singapore. A test pins a 23:30 post to its local day for that
  reason: this map is what a paid request will be built from.
- **Days with nothing are absent, not present with an empty set.** That makes
  `taken.has(dayKey)` the whole of the question `unclaimedKeyDates` asks.

**Live posts only**, here and in all four other functions. A soft-deleted post
occupies no slot, claims no key date and is no evidence of a cadence — it is a
row somebody removed.

## 3. `unclaimedKeyDates` — two rules that look inconsistent and are not

**A season is never unclaimed.** *The Hungry Ghost month has no post* is not a
sentence a marketer can act on; *National Day has no post* is. A season has no
one day to hang a post off, which is the same reason `SocialPostList`'s heading
suffixes exclude seasons and the reason `splitByShape` exists at all.

**Claimed means any live post on the day, whatever its platform** — deliberately
looser than `postsByDayPlatform`'s per-platform rule, and the one place the two
definitions differ on purpose. The question this function asks is whether the
date has been *noticed*, and one Instagram post on National Day means it has.
Applying the per-platform rule here would put *National Day has no post* on
screen beside a National Day post, because the brand had not covered LinkedIn.
The looser rule is stated in the doc comment next to the stricter one, so the
difference reads as a decision rather than as drift.

Sorted by `start` rather than trusting the caller's order, so *the first
unclaimed key date* means the earliest one whatever array arrives.

## 4. `inferCadence` returns its own provenance

`{ perWeek, source: 'history' | 'suggested' }`, measured over the 28 days ending
today.

**The source is part of the answer, not a nicety.** An inference nobody can see
is a guess wearing the clothes of a fact, and this is the number the entire
planner batch will be sized from. Phase F's brief has to render it as
`3 posts/week (from your last 4 weeks)` or `3 posts/week (suggested)`, and it can
only do that because the function refuses to return the number alone.

**Never zero.** Under three posts in the window there is nothing to infer from —
`round(2 / 4)` answers `1` for a brand that posts twice a month and for a brand
that started last Tuesday, and it answers with the same confidence — so a thin
history returns the suggested 3 and says so. A brand with no history is exactly
the brand most likely to be opening a planner, and one that opened at
`0 posts/week` would propose nothing on the day it is most needed.

`now` is injected, the `upcomingKeyDates` precedent. It is the only function in
the file whose answer changes without any data changing, and **no assertion in
either test file reads the current date**.

## 5. `plannerBatchSize` — Q6 as one expression

`slots = ceil(weeks × perWeek)`, `count = clamp(round(slots × 1.5), 6, 18)`.

The surplus is what the reject-half mechanic runs on. Half again lets a third of
a batch be thrown away and still fill the month; twice over turns Monday's
planning session into a triage queue, which is the state a marketer opened the
planner to escape. The floor stops one week returning two ideas and calling it a
choice; the ceiling is where a review stage stops being a review.

Nothing calls it yet. It is here because it belongs beside the cadence it is
derived from, and because Phase F states its result — *12 ideas for 8 slots* —
before any money moves.

## 6. Where the sentence renders, and why it moved

The plan listed `SocialCalendarView.tsx` as the only file to modify. The
component renders one file lower, inside `CalendarMonthGrid`, through a new
optional `summary?: React.ReactNode` slot.

**A sentence reading "31 days · 4 posts planned" placed above the `‹ August 2026
›` control is a sentence about no particular month.** The grid already holds two
month-scoped context lines in exactly the position this one needs — the season
strip and the beyond-horizon note — both under the month's name and above the
cells. Following the plan's file list would have put the third one somewhere the
other two had already been rejected from.

**A slot, not the sentence itself.** `CalendarMonthGrid` keeps knowing only about
layout and callbacks; the arithmetic stays the view's. Absent, the grid renders
exactly what it rendered before — the house rule for every prop in that file, and
the reason its existing 40 tests needed no edit.

## 7. Two copy decisions

**The zero case is a word, not a digit.** `no key dates unclaimed`, never `0 key
dates unclaimed` — the same trap `brandContextState` documents for *0 of 0
sections written*: a zero as a fraction invites the reader to go looking for the
rows it is counting.

**With every set switched off the third clause is absent entirely.** *No key
dates unclaimed* on a calendar showing no key dates is a claim about an empty
set, and it reads as reassurance. `MonthPlanSummary` carries `keyDays` for this
one branch and nothing else.

The middots are real text nodes, not `gap`. A test asserts the whole sentence as
one string for that reason — the same margin-instead-of-text bug `SocialPostList`
and `CalendarMonthGrid` each document at length.

## 8. Files

```
packages/web/src/lib/social-plan.ts                          (new)
packages/web/src/lib/social-plan.test.ts                     (new)
packages/web/src/components/brand/MonthPlanSummary.tsx       (new)
packages/web/src/components/brand/MonthPlanSummary.test.tsx  (new)
packages/web/src/components/brand/CalendarMonthGrid.tsx      (+ summary slot)
packages/web/src/components/brand/SocialCalendarView.tsx     (mounts it)
packages/web/src/components/brand/SocialCalendarView.test.tsx
```

## 9. Verified

The full gate: `typecheck` (10 packages), `lint`, `format:check`, `test`
(**1777 passed, 75 skipped**), `pnpm -F @brandfactory/web build`. 32 tests are
new — 23 on the arithmetic, 6 on the sentence, 3 on the wiring.

**Still open, with Phases A and B: nothing has been run in a real browser.** The
sentence's placement under the month header is a layout claim, and layout claims
in this feature have not yet been checked at any viewport.
