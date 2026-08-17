# Phase F — the Post Planner

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** with
Phases A, B, C, D and E landed (1853 passed | 78 skipped before this phase).

Executes Phase F of
[`docs/executing/planning-and-dispatch-implementation-plan.md`](../executing/planning-and-dispatch-implementation-plan.md),
which builds
[`docs/plans/planning-and-dispatch-on-the-social-calendar.md`](../plans/planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated.

**No migration.** 6 files added, 7 modified. **1914 passed | 78 skipped** —
+61 tests. This is the first phase that spends money, and the first that makes
Phase E's engine reachable from a screen.

---

## 1. What landed

A `Plan` button in the calendar header opens a 400px panel beside the grid.
The panel states what the model will read, runs pass 1, shows the ideas under
their pillars, and commits the accepted ones as `social_posts` rows through the
route that already creates them.

Three stages, in the order the money is spent:

1. **Brief** — the brand and its context state (Phase A), the key dates in the
   window and the posts already in it (Phase C), the platforms, and the cadence
   with its source. Below them: *18 ideas for 14 slots*. Nothing is spent
   until the button is pressed, and everything the run will send is on screen
   before it is.
2. **Ideas** — pass 1's batch grouped under its pillars, each card carrying its
   angle, its reason, its day and its platform chips.
3. **Commit** — pass 2 over the accepted (idea × platform) pairs, then one
   insert each, with progress. Rendered as a state of stage 2 rather than as a
   third screen: every decision is made by then, and the only new fact is how
   far it has got.

## 2. Two rules with no exception, and how each is made structural

**The planner never proposes onto a taken day+platform.** The request's `taken`
list is built by `takenSlots`, which reads `postsByDayPlatform` and nothing
else. That is C2's *one function, two readers* discharged: the sentence under
the month's header and the list handed to the model are the same arithmetic, so
the planner cannot propose into a day the summary has already called full. The
server then drops on arrival whatever the model returned anyway
(`applyBoundaries`), so the rule holds in two places and depends on the prompt
in neither.

**Every commit is an insert.** `usePostPlanner` holds `createPost` and no update
mutation at all. The rule is not remembered, it is unavailable: there is nothing
in the hook that could patch a row. A test asserts `update` is never called
after a commit, which is the same claim from the outside.

## 3. Every card starts accepted

Q6 sizes the batch at half again the slots *so that half of it can be thrown
away* — the proposal's own sentence is "open August, run the planner, reject
half, and watch the grid fill". A panel that opened with twelve cards each
needing a click to keep would turn that surplus from a convenience into a cost,
and a marketer reviewing eighteen ideas would spend the whole session clicking
*accept*.

So `initialSelections` accepts everything and rejecting is the gesture. A
rejected card greys out in place rather than leaving, because a rejection is
reversible and a card that vanishes takes its own undo with it.

**The commit button states the row count, which is the sum of the chips and not
of the cards** (Q8). Four cards naming two platforms each is eight rows, and
nobody should discover that after pressing the button.

## 4. Pass 2 is chunked, and the plan did not see this coming

`IdeateCopyInputSchema` caps one call at 24 items. `plannerBatchSize` caps a
batch at 18 ideas, and Q8 says one idea may name more than one platform — so
eighteen ideas on two platforms is **thirty-six rows**, which is an ordinary
plan and a 400 from the validator.

`chunkCopyPairs` splits the commit into calls of at most 24, run in order, and
the answers are concatenated by position. It costs part of what E's *one call,
not one per row* bought: the model sees one chunk rather than the whole set, so
it varies openings across twenty-four captions instead of thirty-six. That is a
far smaller loss than refusing the commit, and the alternative — one call per
row — throws the property away entirely.

**The copy pass degrades; the writes do not.** A chunk that fails, thrown or
answered off-schema, commits its rows with `body: ''` — which `social/post.ts`
already defines as *slot claimed, copy pending*. The user agreed to those posts;
losing them because a caption did not arrive would throw away the decision
rather than the words. A toast names how many landed without copy.

## 5. `mediaDirection` is paid for and discarded — the one real loss

Pass 2 returns a caption **and** a media direction, and `social_posts` has
nowhere to put the second one. There is no notes column, no brief field and no
attachment description; Phase D's migration was scoped to provenance and adding
a column here would be a second schema change made in passing.

The two alternatives were both worse. Appending it to `body` would put an
instruction to a photographer into the exact string `PostDispatchActions` copies
to the clipboard and a marketer pastes into Instagram — a caption that reads
perfectly right up until it is published. Dropping the field from the request
would mean editing Phase E's schema and prompt to make the client's storage
problem the engine's.

So it is discarded, deliberately and visibly. **The fix is a
`social_posts.media_direction` column** and a line in the post editor, which is
its own small piece of work with a migration in it. Recorded under *deferred*
below rather than smuggled in here.

## 6. `Content pillars`, read and written

E1a put the section in `SUGGESTED_SECTIONS`. This phase is what reads it.

`brandContentPillars` flattens the section body and takes **one line per
pillar** — bullets, numbered items and bare paragraphs all flatten to one block
each. Nothing splits on commas or full stops: a brand that writes four pillars
as one prose sentence gets one pillar, sees it in the panel, and fixes it by
pressing Return three times. Guessing where a sentence was meant to be a row
would be a rule nobody could predict from the section they typed.

An over-long line is **clamped to 80 characters, never dropped**. Dropping it
would have the run behave as if the brand had written nothing and then present
the model's own inventions beside a section the user had filled in — which is
precisely the incoherence Q2 exists to prevent.

`contentPillarsDoc` is the inverse, and the pair round-trips in a test. The save
action writes it into the brand as `createdBy: 'agent'`, because the agent is
who wrote it, and it is **the only guidelines write in this whole feature**. It
happens because the user pressed a button, never as a side effect of running the
planner, and the offer appears only when the run's pillars are marked `proposed`.

It lives in `packages/shared` beside `context-state.ts` for that file's stated
reason: a rule about a wire shape, wanted by a surface and by a prompt, belongs
to neither of them.

## 7. Deviations from the plan, each with its reason

**`packages/shared/src/brand/content-pillars.ts` is new** (§6). The plan's file
list has the panel reading pillars with no named place for the rule to live. Two
readers of one rich-text section would disagree the first time a brand wrote a
numbered list, and the disagreement would surface as the planner marking the
brand's own pillars `proposed`.

**`usePostPlanner.ts` is new.** The plan says the page owns every piece of
state, and it does — this is the page's state, factored out of it, the
`useDraftLanding` precedent. `SocialCalendarPage` already owns nine pieces of
state and eight handlers for the dialog, the list and the uploads; a run with
three stages and two paid calls would have doubled that file without sharing a
line with any of it.

**`social-plan.ts` gained the request builders** rather than a new module.
`plannerBatchSize` and `inferCadence` were already planner-run arithmetic rather
than month shape, so the window, the quotation, the taken list and the selection
maths join them there.

**`IDEATE_MAX_KEY_DATES` and `IDEATE_MAX_TAKEN_SLOTS` are now named** in
`shared/social/ideate.ts`. The client sizes its request against those bounds,
and a window that overran one would be a 400 on a request the user had already
been shown the brief for. Two literals, one name each.

**The `This month` window never starts in the past.** Opening the planner on the
29th and asking it to fill *this month* means the three days that are left, not
the twenty-eight that are gone: an idea dated last Tuesday is a card the user can
only reject, and `applyBoundaries` would have kept it because it *does* fall
inside the month. A month deliberately navigated to in the past is planned whole
— someone asking for July in August has said what they mean.

**The panel is a `<aside>` slot on `SocialCalendarView`**, not a set of props —
`CalendarMonthGrid`'s `summary` precedent from Phase C. The view decides where
the panel sits and how wide the page is around it, and learns nothing about what
planning involves.

## 8. Files

```
packages/shared/src/brand/content-pillars.ts        (new)
packages/shared/src/brand/content-pillars.test.ts   (new)
packages/shared/src/social/ideate.ts                (+ two named bounds)
packages/shared/src/index.ts
packages/web/src/api/queries/social-ideas.ts        (new)
packages/web/src/api/queries/social-ideas.test.tsx  (new)
packages/web/src/components/brand/PostPlannerPanel.tsx      (new)
packages/web/src/components/brand/PostPlannerPanel.test.tsx (new)
packages/web/src/components/brand/usePostPlanner.ts (new)
packages/web/src/components/brand/SocialCalendarView.tsx
packages/web/src/components/brand/SocialCalendarView.test.tsx
packages/web/src/components/brand/SocialCalendarPage.tsx
packages/web/src/components/brand/SocialCalendarPage.test.tsx
packages/web/src/lib/social-plan.ts
packages/web/src/lib/social-plan.test.ts
```

## 9. Verified

The full gate: `typecheck` (10 packages), `lint`, `format:check`, `test`
(**1914 passed, 78 skipped**), `pnpm -F @brandfactory/web build`. 61 tests are
new — 10 on the pillars rule, 22 on the planner's arithmetic, 17 on the panel, 3
on the query module, 4 on the view's header and layout, and 11 on the run and
the commit loop through the page.

**Not done: nothing has been run against a real model, and nothing has been run
in a real browser.** Both are the same gap Phases A through E left, and this is
the phase that closes them or does not:

- **E3b's 90-second timeout is still a judgement, not a measurement.** Pass 1
  asks for up to eighteen structured objects with seven fields each, and nothing
  in this repo has run a `generateObject` call that size. This phase is the
  first that can press the button; the number should be adjusted with the reason
  recorded once it has been.
- **F9's width check is not done.** The panel is 400px with the page's
  `max-w-6xl` dropped while it is open, and a fixed overlay below `lg`. A test
  asserts the cap comes off; only a browser at 1280 and 1440 can say whether the
  grid still reads well beside it.

## 10. Deferred, with the reason

- **`social_posts.media_direction`** (§5). One column, one field in the post
  editor, one migration. The planner already produces the value.
- **A re-run that reads the plan back.** D's column makes it possible; nothing
  reads provenance that way yet.
- **Pillars as a first-class brand fact** with a table. §6's guideline section is
  the cheap 90% of it and the expensive 10% still has no evidence behind it.
