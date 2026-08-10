# Phase E — the engine

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** with
Phases A, B, C and D landed (1787 passed | 78 skipped before this phase).

Executes Phase E of
[`docs/executing/planning-and-dispatch-implementation-plan.md`](../executing/planning-and-dispatch-implementation-plan.md),
which builds
[`docs/plans/planning-and-dispatch-on-the-social-calendar.md`](../plans/planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated.

**No migration.** 6 files added, 7 modified. **1853 passed | 78 skipped** —
+66 tests. Nothing in `packages/web` calls any of it.

---

## 1. What this is, and what it deliberately is not

Two `POST` routes under `/brands`. Give one a window of calendar and it returns
post ideas; give the other the accepted ideas and it returns copy. **It writes
no row, starts no job and stores no draft.**

That is the whole design. A run that changed the database would need a
lifecycle — a job table, a ticker, a reconciler, an in-flight index — which is
what the deep-research feature has and what makes it the most complicated thing
in this repo. The planner needs none of it because the client's *accept and
commit* is the write, through `POST /brands/:id/social-posts`, the only writer
this table has ever had. A route test asserts the property directly rather than
inferring it from the absence of a write in the handler.

It is also **stateless**: no project, no canvas, no message history. A planning
run is a question with an answer, not a conversation. The two things a
conversation would buy — memory and follow-up — the user gets by editing the
plan on the grid.

## 2. The brand header is `buildSystemPrompt`'s, and part 4 had to go

E2b says the system prompt is `buildSystemPrompt(brand)`'s output verbatim plus
a `## Planning brief`. Taken literally that ships a bug.

Part 4 of that prompt is the **surface contract**, and it has always had exactly
two forms: the canvas-awareness block, or the brand-context interview. The
canvas one tells the model that *a "CANVAS STATE" block will follow this
prompt* — none does — and that it should call `add_canvas_block` rather than put
content in its reply. The planner is a `generateObject` call with no tools, no
canvas and no conversation, and putting content in its reply is the only thing
it can do. Instructing it otherwise is not a harmless extra paragraph.

So `SystemPromptOptions` gains `surfaceContract?: boolean`, defaulting to
`true`. It is one branch in the file that already owns this decision and already
varies part 4 by template.

**The alternative was worse, which is the plan's actual point and it stands.** A
planner that assembled its own brand header would be the second answer to *what
does the model know about this brand*, and the first one to drift — the TL;DR
precedence rule, the section ordering and the empty-TL;DR trap all live in
`buildSystemPrompt` and none of them is worth reimplementing. Parts 1–3 are that
answer. Part 4 is about the surface, and a surface with no contract says so
rather than inheriting one that does not apply.

A test asserts the withheld form is a **prefix** of the default, which is what
"verbatim" has to mean if it is to mean anything.

## 3. The boundaries are enforced in code, not trusted to the prompt

`applyBoundaries` runs over every parsed idea and drops four things, in the
order a violation costs the most:

1. a date outside the window — a post in a month nobody is looking at;
2. **a (date, platform) pair already taken**;
3. a platform the request never asked for;
4. everything past `count`.

The prompt states all four as rules, because a model that understands them
produces better ideas. Then the code drops whatever ignored them anyway — the
`resolveCitedSources` precedent. **Rule 2 is the one that must be code**: an
instruction is not a guarantee, and a model that forgets it would otherwise
write a duplicate post onto a slot the user has already filled.

Rule 2 is per **pair**, not per day (Q3), and a test says so out loud: 3 August
taken on Instagram and open on LinkedIn keeps the LinkedIn half of the idea. A
planner that treated the day as full would refuse a normal Tuesday.

An idea whose every platform is filtered out is dropped with them. A card with
no platform commits no rows and is a card the user has to reject by hand for no
reason.

## 4. Two things the model is not allowed to decide

**Its own outcome.** The response schemas are not `IdeateThemesResultSchema` —
that carries `outcome`, which is this code's judgement about the answer rather
than part of it. A model asked to report its own outcome can claim `ok` over an
empty list. `no-ideas` is derived, and it covers both *the model returned
nothing* and *everything it returned was filtered out*: in schema and useless is
the same answer to the user as nothing at all.

**Whether a pillar is proposed.** When the brand has written its `Content
pillars`, the request names them and the answer is not the model's to make;
when it has not, every pillar in the answer is an invention and is labelled one.
Reading `proposed` off the model would let a run quietly present its own
inventions as the brand's — which is precisely the incoherence Q2 exists to
prevent.

## 5. Pass 2 is one call, and a missing index is not a lost post

All accepted (idea × platform) pairs ride in together and come back
index-keyed. It is cheaper, but the reason is that captions written together
stop three posts in one week from opening the same way — a set the model can see
is a set it can vary, and the prompt says so.

The answer is then rebuilt **by request position**, not by the order it arrived
in. Out-of-range indices are ignored, a repeated index keeps its first answer,
and a missing index commits as `body: ''` — which `social/post.ts` already
defines as *slot claimed, copy pending*. The user agreed to the post; dropping
the row would throw away the decision rather than the caption.

An over-long caption is clamped rather than rejected, the
`GUIDELINE_LABEL_MAX_CHARS` rule: 20 characters over the column bound is a
cosmetic loss the user can fix, and a rejected batch is the whole paid pass on
the floor.

## 6. Media is described in words, and it is rule 1 in both prompts

A brand asset carries a `label` and `alt` text a person typed while uploading,
and nothing a model can look at. Naming one would be reasoning from that label
and presenting it as if the model had seen the picture.

It leads both prompts because **its violation is invisible**: a caption naming a
photograph that does not exist reads perfectly. Every other rule fails loudly.

## 7. `IdeateKeyDate` is a quotation, not the dataset

`key-dates/types.ts` records that the 92 curated dates get no table, no route
and no wire type. That decision is about **storage** and it stands: nothing here
persists a key date, and `packages/shared` does not learn the dataset's members
— `set` is a display-name string, not the `KeyDateSet` union.

What crosses the wire is the handful of entries one request is about, shaped for
a prompt, exactly as the visible month and the chosen platform already do.

## 8. `Content pillars` is one array entry

Added to `SUGGESTED_SECTIONS` as an `aspect`, directly after `Target audience`:
who the brand talks to, then what it recurrently talks to them about.

That single row buys the rail's suggestion chip, the editor's quick-add and
guideline auto-fill's ability to write the section from a report the brand has
already paid for. Every future surface inherits it for free, which a field
living inside the planner never would. No table, no migration, no new taxonomy.

## 9. The seam, the timeouts and the money

`createThemeIdeator` / `createCopyWriter` are `createSectionShaper`'s shape
verbatim: two optional deps on `AppDeps`, each defaulting to its composition, so
a route test drives the whole handler chain — auth, access, validation, response
— with a `vi.fn()` and no model at all. *Which model* is resolved per workspace
**at call time**, and a seam test proves a settings change between two calls to
the same composed function takes effect.

`IDEATE_THEMES_TIMEOUT_MS` is 90 seconds against pass 2's 60.
`SHAPE_SECTION_TIMEOUT_MS`' argument — past the ceiling the spinner has become a
lie — with more room, because up to eighteen structured objects with seven
fields each is a different kind of output from one paragraph. **It is a
judgement and the file says so**: nothing in this repo has run a
`generateObject` call this large. Phase F is the first that will, and it should
adjust the number with the reason recorded.

**No spend cap, deliberately.** This runs on the workspace's own configured LLM
tokens, which `env.ts` already treats as ungated for chat and for guideline
shaping. `RESEARCH_*`'s caps exist because deep research is metered per click
against a vendor bill at roughly $0.38 a run. This is not that, and a cap
invented here would be a second policy answering one question.

## 10. Files

```
packages/shared/src/social/ideate.ts              (new)
packages/shared/src/social/ideate.test.ts         (new)
packages/shared/src/brand/suggested-categories.ts (+ Content pillars)
packages/shared/src/index.ts
packages/agent/src/social/ideate.ts               (new)
packages/agent/src/social/ideate.test.ts          (new)
packages/agent/src/prompts/system-prompt.ts       (+ surfaceContract)
packages/agent/src/prompts/system-prompt.test.ts
packages/agent/src/index.ts
packages/server/src/social/ideate.ts              (new)
packages/server/src/social/ideate.test.ts         (new)
packages/server/src/routes/social-ideate.ts       (new)
packages/server/src/routes/social-ideate.test.ts  (new)
packages/server/src/app.ts
packages/server/src/app.test.ts
packages/server/src/test-helpers.ts
packages/web/src/components/brand/BrandContextRail.test.tsx
```

The last one is the only web change in the phase: the rail enumerates
`SUGGESTED_SECTIONS` in order, so a new entry appears in its expectation. That
it appeared in the right place is the assertion.

## 11. Verified

The full gate: `typecheck` (10 packages), `lint`, `format:check`, `test`
(**1853 passed, 78 skipped**), `pnpm -F @brandfactory/web build`. 66 tests are
new — 17 on the wire schemas, 30 on the composer, 11 on the route, 5 on the
seam, 2 on the withheld contract, 1 on the router.

`app.test.ts` gains the router-degradation assertion E3d asks for: the planner's
routes match, the app still reports `RegExpRouter`, and the multi-segment blob
key still resolves.

**Not done: the route has not been run against a real model.** The plan's *done
when* asks for both a fake composer and a live one in development, and only the
first has happened — this needs a workspace with LLM settings and a key. Phase F
is the first phase with a reason to press the button, and it is where the 90
second timeout gets its first real measurement.

**Still open, with Phases A through D: nothing has been run in a real browser.**
Nothing in this phase is visible, so it adds nothing to that list.
