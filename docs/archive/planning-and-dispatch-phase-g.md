# Phase G — Brainstorm inside `New post`

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** with
Phases A, B, C, D, E and F landed (1914 passed | 78 skipped before this phase).

Executes Phase G of
[`docs/archive/planning-and-dispatch-implementation-plan.md`](planning-and-dispatch-implementation-plan.md),
which builds
[`docs/archive/planning-and-dispatch-on-the-social-calendar.md`](planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated.

**No migration.** 3 files added, 7 modified. **1967 passed | 78 skipped** —
+53 tests. This is the last of the three doors, and the thinnest: Phase E's
engine reached through a second opening, with no new route, no new schema and no
new prompt.

---

## 1. What landed

A `Brainstorm` toggle in the `New post` header. On, the dialog widens from
`sm:max-w-xl` to `sm:max-w-3xl` and grows a column on the left: three angles for
the day and platform in the form, and a `Use this` that writes the caption into
the `Copy` field the user was already looking at.

A sparkles button on every calendar cell opens the same dialog with the column
already showing. Without it the toggle would live inside a dialog nobody had a
reason to open, which is a feature that exists and cannot be found.

Off, the dialog is byte for byte the one Phase A shipped — same width, same
fields, same order, same strip. A test asserts exactly that, because "unchanged
when the flag is off" is the house rule for every prop in this folder and this
is the largest thing that rule has ever had to cover.

## 2. `taken` is empty, and it is the whole design decision

The planner's second rule — *never propose onto a day and platform that already
has a post* — is enforced twice: in the prompt, and again in `applyBoundaries`,
which drops on arrival whatever the model returned anyway. Door 3 sends the same
request to the same route, and if it sent the taken list with it, then
**brainstorming a day that already has an Instagram post would answer *no ideas*
every time.** The window is one day wide, so there is nowhere else for an idea to
land; every one of them would be dropped by the boundary filter, and the panel
would report the honest non-answer to the question it was asked most directly.

So `brainstormRequest` sends `taken: []`, and the reason is not an exemption from
the rule but the rule's own scope. It exists so a run the user asked about a
*month* does not double-book a day it was never asked about. Here the user is
standing on one day, with one platform chosen, asking for an angle for it — and
nothing about the answer is written. The caption fills a field in a form that
still has to be submitted, through the same `onCreate` every other post on this
surface goes through.

The plan did not name this. It is the one trap in Phase G, and it would have
shipped as *the brainstorm silently refuses to work on any busy day*.

## 3. The state sits with the fields, not with the page

`usePostPlanner` holds the planner's run because the page owns everything the
planner reads. This run is different: the question it asks is made of two fields
on the form — the date and the platform — and the answer lands in a third. So the
angles live in `PostEditorForm`, and only the two calls that spend money live in
`usePostBrainstorm` on the page.

That split is what makes the two rules below possible to state at all.

**The day is the field's, never the seed's.** `keyDatesOnDay` already follows
that rule for the context strip's chips, one paragraph up in the same function,
and for the same reason: a fact that has quietly stopped being one is worse than
no fact. Change the date and the angles are thrown away, because they were an
answer about a different day.

**Toggling the column off does not throw the angles away.** The form stays
mounted; only the column's rendering is conditional. Three angles somebody paid
for must survive a change of mind about the layout.

## 4. A platform is required, and the panel says so

The form leaves `platform` empty on purpose — *picking where a post goes is the
one decision the author must actually make, and a pre-selected Instagram is a
guess that ships as a fact*. Pass 2 writes per platform for the matching reason:
a LinkedIn caption is not an Instagram one.

Put together, a brainstorm with no platform is a brainstorm for nowhere. The run
button is disabled and the column states why, rather than sitting greyed out with
no explanation — the fix is one field away and the reason is the same reason pass
2 exists at all.

The day has no such requirement: an unscheduled post borrows today, which is the
judgment `handleNewPost` already makes when the header's `New post` seeds a date.

## 5. Provenance, and the one thing that can be lost

`createdBy: 'agent'` when the caption came out of an angle. **An edit afterwards
does not take that back** — D3 states the same rule as the reason `createdBy` is
not on the patch schema: an edit does not make a person the author of what the
agent wrote. So the flag is sticky through as much rewriting as the user wants to
do.

The one gesture that clears it is *Put my copy back*, and that is consistent
rather than an exception: at that point the agent's words are no longer the ones
being saved.

That undo exists because `Use this` is the only action in this whole feature that
destroys something a person typed. It is offered **only** when there was
something to destroy, and only for the first replacement — a second angle
overwrites the model's own words, which nobody would want back and which the
button would otherwise offer as if they were theirs.

## 6. A blank caption is a failure here, unlike in the planner

`writePostCopy` returns `body: ''` rather than dropping a row, and Phase F
commits it: the empty string is `social/post.ts`'s *slot claimed, copy pending*,
and the user had already agreed to that post.

There is no row and no slot here. An empty caption would be the entire visible
result of pressing the button — the `Copy` field emptied, with nothing to show
for it. So `usePostBrainstorm` treats a blank body as a failure, toasts it, and
answers `null`, which the form reads as *the page has already said what
happened* and leaves the field alone.

The same `null` covers a thrown call and a non-`ok` outcome from pass 2. Pass 1's
outcomes travel differently: `no-ideas` and `invalid-shape` are honest answers
rather than failures, so they arrive in the body and the column has a line for
each.

## 7. Deviations from the plan, each with its reason

**`PostBrainstormPanel.tsx` and `usePostBrainstorm.ts` are new.** The plan's file
list has four existing files and no place for either the column or the two calls.
`PostEditorDialog.tsx` was already 650 lines holding a form and an attachment
picker; putting a two-pass run and its rendering in the same file would have made
the dialog the largest component in the folder by a wide margin. The split is
`PostPlannerPanel` / `usePostPlanner`'s, one scale smaller.

**`brainstormRequest` lives in `social-plan.ts`** beside the planner's builders,
for that file's stated reason: it is planner-run arithmetic over the same two
arrays. It is also what keeps §2's decision in one readable place with the
argument attached, rather than as an empty array literal inside a hook.

**Its own pair of mutations, not the planner's.** They are `useMutation`s with no
key and no cache, so a second pair costs nothing and keeps two independent
`isPending` flags — a planner run in the panel must not grey out the button in
the dialog.

**Below `sm` the column sits under the form, not over it.** The plan says
*ideation left, the form right*, which it is at every width where two columns
fit. Stacked, the fields are what the user came for and the column is the help,
so `flex-col-reverse` keeps the help from pushing the form off the first screen.

**The cell's control is a small sparkles button in the hover row**, beside the
`+` that was already there and revealed by the same `group-hover` /
`group-focus-within` pair. It is `relative` and `pointer-events-auto` so it
paints above the cell's full-bleed add button and keeps its own click — the trick
the post chips in the same cell already use, for the same reason. It stays out of
the padding days, `addable`'s reason verbatim.

## 8. Files

```
packages/web/src/components/brand/PostBrainstormPanel.tsx      (new)
packages/web/src/components/brand/PostBrainstormPanel.test.tsx (new)
packages/web/src/components/brand/usePostBrainstorm.ts         (new)
packages/web/src/components/brand/PostEditorDialog.tsx
packages/web/src/components/brand/PostEditorDialog.test.tsx
packages/web/src/components/brand/CalendarMonthGrid.tsx
packages/web/src/components/brand/CalendarMonthGrid.test.tsx
packages/web/src/components/brand/SocialCalendarView.tsx
packages/web/src/components/brand/SocialCalendarView.test.tsx
packages/web/src/components/brand/SocialCalendarPage.tsx
packages/web/src/components/brand/SocialCalendarPage.test.tsx
packages/web/src/lib/social-plan.ts
packages/web/src/lib/social-plan.test.ts
```

## 9. Verified

The full gate: `typecheck` (10 packages), `lint`, `format:check`, `test`
(**1967 passed, 78 skipped**), `pnpm -F @brandfactory/web build`. 53 tests are
new — 6 on the request builder, 15 on the column, 15 on the dialog's toggle and
its run, 5 on the grid's button, 4 on the view's threading, and 8 on the two
calls through the page.

**Still not done, and it is now the whole feature's remaining gap: nothing in
Phases A through G has been run against a real model or in a real browser.**
Three specific things are waiting on that, unchanged from Phase F's note:

- **E3b's 90-second timeout is still a judgement, not a measurement.** Phase G
  does not close this — a three-idea, one-day run is the *small* case, and the
  number was chosen for pass 1's eighteen-object worst case.
- **F9's width check.** Now joined by this phase's: the split dialog at
  `sm:max-w-3xl` is 768px holding a 280px column and a form, and only a browser
  can say whether the `Copy` textarea and the attachment picker still read well
  beside it.
- **The cell's sparkles button at 130px.** It shares the hover row with the `+`,
  and jsdom lays out neither.

## 10. Deferred, with the reason

- **`social_posts.media_direction`** — Phase F §5's, unchanged. Pass 2 returns a
  media direction here too, and this surface discards it for the same reason.
- **Seeding the date from a picked angle.** The angle carries a `date`, and it is
  always the day the run was asked about, so writing it back into the field would
  change nothing. It becomes a real question only if the window ever widens past
  one day.
- **Brainstorming an existing post.** The toggle renders in edit mode as well,
  and `Use this` would overwrite the copy of a post that already exists. That is
  the same replace-with-undo it is in create mode, but the provenance rule stops
  short: `createdBy` is not on the patch schema, so an edited post keeps whoever
  wrote it first. Left as it is rather than given a second rule.
