# Review hardening — planning and dispatch

**Status:** complete, 2026-08-10. Written against the seven landed phases of
[`docs/executing/planning-and-dispatch-implementation-plan.md`](../executing/planning-and-dispatch-implementation-plan.md)
at **1967 passed | 78 skipped**.

A pre-release review of Phases A–G. It changes no behaviour a user asked for and
adds no surface: one correctness defect, one missing rule, and three quality
faults, each argued below with the reason it was worth fixing rather than
noting.

**No migration. No new route, no new component, no new prop.** 4 source files
and 3 test files modified. **1973 passed | 78 skipped** — +6 tests. The live
database suite was run against real Postgres with migration 0012 applied:
**112 passed**, 0 skipped.

---

## 1. `takenSlots` sent the oldest 400 pairs and dropped the newest

**The one defect in the feature that could write a wrong row.**

`takenSlots` built the *never propose onto this* list for the paid request, then
truncated it to `IDEATE_MAX_TAKEN_SLOTS`:

```ts
return slots.slice(0, IDEATE_MAX_TAKEN_SLOTS)   // 400
```

Three facts turn that slice into a defect, and none of them is visible from the
function:

1. `listSocialPostsByBrand` is **unbounded** — it returns the brand's entire live
   history, not a window.
2. It orders `scheduledAt asc nulls first`, and `groupByDay` builds its `Map` in
   iteration order, which `postsByDayPlatform` and `takenSlots` both preserve.
3. The planning window is always **now or later** — `This month` clamps its start
   to today, and `The next four weeks` starts today by construction.

So the 400 pairs that survived were the **oldest** ones, which can never collide
with anything the run may propose, and the pairs inside the window — the only
ones that could — were the ones dropped. `applyBoundaries` then had nothing to
filter against, and the planner would propose onto a day that already had a post
and commit it. The failure would present as a model error and would in fact be
an arithmetic one, which is precisely the failure mode `postsByDayPlatform`'s
comment was written to prevent.

**It needed history, not bad luck.** 400 day+platform pairs is about sixteen
months for a brand posting three times a week to two platforms. That is inside
the life of a real customer, and the bug gets *more* likely the longer a brand
uses the product — the worst shape for a defect to have.

The original code carried an argument for not filtering:

> Every live scheduled post counts, not only the ones inside the window. A post
> outside it cannot collide with an idea inside it […] and filtering here would
> be a second window test to keep in step with the first for no gain.

The first sentence is true and the conclusion does not follow from it. *Cannot
collide* is exactly what makes an out-of-window pair worthless in a list that has
a ceiling: it consumes a slot that an in-window pair needed. The argument is
sound only for an unbounded list, and the list is bounded on the line below it.

**The fix is the window test the comment refused**, and it makes the ceiling into
the backstop it was always meant to be:

```ts
export function takenSlots(posts: SocialPost[], window: PlannerWindow) {
  …
  if (day < window.start || day > window.end) continue
```

A 31-day window across all eight platforms is 248 pairs, so the slice can no
longer fire on any window this product offers. `IDEATE_MAX_TAKEN_SLOTS` stays
because the validator enforces it and a client is not the place to decide that a
bound is unreachable.

**Verified by a test that fails against the old code**
(`social-plan.test.ts`): a brand with `IDEATE_MAX_TAKEN_SLOTS + 50` posts in 2024
and one post inside the window quotes exactly the in-window pair. The page-level
test in `SocialCalendarPage.test.tsx` was rewritten to assert the same property
end to end, with both dates built from the clock — a fixed date falls out of the
`This month` window as soon as the month advances past it, which is how the old
assertion came to be asserting nothing.

## 2. `applyBoundaries` enforced rule 2 against the table but not against itself

The function drops ideas that collide with an existing post. It did not drop
ideas that collide **with each other**: two ideas returned in one batch, both
dated 12 August on Instagram, both survived, and `commitPairs` wrote both.

`applyBoundaries` exists because of a principle its own docstring states —
*rule 2 in the prompt is an instruction, and an instruction is not a guarantee*.
That principle covers this case exactly, and arguably covers it harder: a model
producing eighteen ideas in one structured response cannot see its own output as
a finished set while it writes it, so a self-collision is a more natural failure
than a collision with a list it was handed explicitly.

One `Set` now serves both. It is seeded from the request's `taken` and every kept
idea adds to it, so the second of two colliding ideas is filtered by the same
line as a collision with a row in the table:

```ts
const claimed = new Set(input.taken.map((t) => `${t.day}\0${t.platform}`))
…
if (idea.date !== null) {
  for (const platform of platforms) claimed.add(`${idea.date}\0${platform}`)
}
```

Two details the tests pin:

- **Only surviving platforms are claimed.** An idea narrowed to LinkedIn because
  Instagram was taken must not then block Instagram for a later idea on a
  different day.
- **A dateless idea claims nothing.** The tray has no slots, so two tray ideas
  are two ordinary cards — the same reason the taken rule never applied to them.

The clamp test needed a change to keep measuring the clamp: it built nine ideas
from a helper whose default date is fixed, so under the new rule eight of them
collided and the assertion would have been passing for the wrong reason. Each
idea now gets its own day.

## 3. Two source files were binary as far as git was concerned

`packages/web/src/lib/key-dates/select.ts` (from 1.23.0) and
`packages/agent/src/social/ideate.ts` (new in this feature) both used a **literal
NUL byte** as a composite-key separator, written directly into the source:

```ts
const identity = `${date.start}<0x00>${date.name}`
```

The technique is right — no name contains a NUL, so no two entries can collide by
having the separator inside one half. The **encoding** was the fault. `file(1)`
reports `select.ts` as `data`, and `git diff` renders it as
`Bin 9348 -> 10847 bytes`. A file nobody can read a diff of is a file nobody can
review, which is how a 305-line addition to the agent package reached a review
with two of its lines invisible.

Both now use the `\0` escape. The runtime string is identical — it is the same
character, spelled in ASCII — and both files are plain UTF-8 text again.

This is the one item here that predates the feature. It was fixed with it because
the second instance shows the idiom is spreading, and because the review that
found it was only possible after the bytes were removed.

## 4. Four bounds had two copies each, and the comments said otherwise

`content-pillars.ts` declared:

```ts
/** `IdeateThemesInputSchema`'s bound on the array, stated once for both. */
export const MAX_CONTENT_PILLARS = 12
```

while `IdeateThemesInputSchema` wrote `.max(12)` and `.max(80)` inline. The
comment described an arrangement that did not exist, which is worse than no
comment: it tells the next reader the drift is impossible.

The same pattern appeared in the agent, where the copy pass clamped what the
model returned:

```ts
body: copy.body.slice(0, 5000),
mediaDirection: copy.mediaDirection.slice(0, 400),
```

against `SocialPostBodySchema = z.string().max(5000)` and
`mediaDirection: z.string().max(400)`. The plan's E1b said *reuse
`SocialPostBodySchema` for the copy's max […] never a second literal*, and these
are the second literals. Both are clamp-and-schema pairs, which is the worst
shape for a duplicated bound: if the two ever disagree the clamp lets through
exactly what the schema then rejects, and a whole paid batch is lost to a
mismatch between two numbers that were supposed to be one.

Now single-sourced in the direction each fact belongs:

| Constant | Defined in | Imported by |
| --- | --- | --- |
| `MAX_CONTENT_PILLARS` | `brand/content-pillars.ts` | `IdeateThemesInputSchema` |
| `CONTENT_PILLAR_MAX_CHARS` | `brand/content-pillars.ts` | `PostIdeaSchema`, `IdeatePillarSchema`, the agent's `ThemesResponseSchema` |
| `SOCIAL_POST_BODY_MAX_CHARS` | `social/post.ts` | `SocialPostBodySchema`, the agent's copy clamp |
| `MEDIA_DIRECTION_MAX_CHARS` | `social/ideate.ts` | `PostCopySchema`, the agent's copy clamp |

The pillar bounds stay in `content-pillars.ts` because the bound is a fact about
content pillars, not about the one request that happens to carry them. No cycle:
`brand/*` imports nothing from `social/*`.

## 5. A local named `window`

`usePostPlanner` held `const window = plannerWindow(…)`, shadowing the DOM global
for the whole hook. Renamed to `planWindow`.

**The rename proved the risk rather than merely removing it.** The panel props
were built with the shorthand `{ window, … }`, which resolved to the local. Under
the rename that shorthand silently rebinds to `globalThis.window` — a valid
expression, a passing typecheck for a `PlannerWindow` prop only because nothing
narrows it at that site, and a panel rendering a `Window` object as its date
range. It was caught by grep during the rename, not by the compiler. A local with
that name is one rename away from a defect at all times.

## 6. What this did not fix

**No real model has ever run this feature.** Every test drives a fake composer.
`IDEATE_THEMES_TIMEOUT_MS = 90_000` is still the judgement its own comment admits
it is, against the largest `generateObject` call in the repo — up to eighteen
structured objects of seven fields. The plan asked Phase F to measure it and
record the reason; that measurement has not happened, and it needs an API call
against the workspace's own OpenRouter credit.

**Nothing has run in a browser.** Phase A's 800px dialog-height trap and Phase
F9's 1280/1440 panel-width check are both open, and both are checks no test in
this repo can make.

These two are why this note does not claim the feature is verified. It claims the
code is correct as written, which is a smaller thing.

## 7. Verified

The full gate, after the changes:

```
pnpm typecheck                    10 packages, clean
pnpm lint                         clean
pnpm format:check                 clean
pnpm test                         1973 passed | 78 skipped
pnpm -F @brandfactory/web build   built
```

And the live suite, which the standard gate skips:

```
docker compose -f docker/compose.yaml up -d
DATABASE_URL=… pnpm -F @brandfactory/db db:migrate     0012 applied
DATABASE_URL=… pnpm vitest run --project @brandfactory/db
                                  112 passed | 0 skipped
```

The +6 are four on `applyBoundaries`' self-collision rule and two on
`takenSlots`' window; one existing test in each of `social-plan.test.ts`,
`ideate.test.ts` and `SocialCalendarPage.test.tsx` was corrected, in the last two
cases because it had been asserting something other than what it named.
