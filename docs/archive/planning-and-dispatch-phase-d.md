# Phase D — provenance

**Status:** complete, 2026-08-10. Written against `main` at **1.25.0** with
Phases A, B and C landed (1777 passed | 75 skipped before this phase).

Executes Phase D of
[`docs/archive/planning-and-dispatch-implementation-plan.md`](planning-and-dispatch-implementation-plan.md),
which builds
[`docs/archive/planning-and-dispatch-on-the-social-calendar.md`](planning-and-dispatch-on-the-social-calendar.md).
The *why* is argued there and is not restated.

**Migration 0012.** 1 file added, 12 modified. **1787 passed | 78 skipped** —
+13 tests, three of which are live-DB and skip without `DATABASE_URL`.

---

## 1. Why this is the phase that could not wait

Every other question in this plan can be reopened after a month of real use.
This one destroys information at the moment of creation: a column added after
the planner ships starts empty, and nothing can ever fill it in for the rows the
planner already wrote. Phase F writes its first row into a table that now knows
who wrote it.

The phase is otherwise **dark**. One column, one enum, one field on the wire,
one marker in the list. Nothing produces `'agent'` yet.

## 2. The word is `agent`, not `planner`

`pgEnum('social_post_created_by', ['user', 'agent'])` — the third table to carry
exactly these two members, after `guideline_section_created_by` and
`canvas_block_created_by`.

The writer's product name is the Post Planner, and it does not appear anywhere in
this phase. CLAUDE.md's one-word-one-meaning rule outranks the local accuracy:
three tables answering *who wrote this* have to answer it in the same vocabulary,
or a future query across them needs a translation table.

## 3. The migration, read before it was trusted

```sql
CREATE TYPE "public"."social_post_created_by" AS ENUM('user', 'agent');
ALTER TABLE "social_posts" ADD COLUMN "created_by"
  "social_post_created_by" DEFAULT 'user' NOT NULL;
```

Generated, never hand-numbered, and then read — which is the whole of task D2.
The column arrives **with its default**, so every existing row backfills to
`'user'` in the same statement.

**That is true, not merely convenient.** Every row in this table today was typed
by a person into `PostEditorDialog`, because there has never been another writer.
A backfill that was a guess would be worse than no column.

Applied against real Postgres and inspected: `created_by | social_post_created_by
| not null | 'user'::social_post_created_by`.

## 4. `.default('user')` on the create input, and what it costs

`CreateSocialPostInputSchema` gains `createdBy: SocialPostCreatedBySchema
.default('user')` — the `UpdateBrandGuidelinesSectionInput` precedent, which puts
the same field on the same kind of input with the same default.

**The default belongs at the wire, not in the query layer.** An absent author has
exactly one honest meaning — *a person wrote this*, which is what every client
written before the planner existed meant — and deciding it in the schema means
the real query, the server's in-memory fake and the route do not each guess
separately. Both writers state it unconditionally rather than with a `??`, and a
comment in each says why: by the time a create reaches the data layer the key is
always present.

**The consequence is that TypeScript now requires the field at every construction
site**, because `CreateSocialPostInput` is the schema's *output* type. That is
the cost, and it is the right cost: a create path that can silently omit the
author is the path that produces an unattributable row. `PostEditorDialog` states
`createdBy: 'user'` explicitly, the `BrandGuidelinesEditor` precedent — the author
is named at every site that creates a row, so Phase F's `'agent'` will read as a
difference rather than as the only mention.

Eleven test fixtures gained the field. One local wrapper in
`social-posts.live.test.ts` keeps its eleven call sites stating only what each is
testing; the two provenance tests bypass the wrapper, and the one that proves the
default goes through `CreateSocialPostInputSchema.parse` — the only way to
exercise a default that TypeScript has already applied.

## 5. Not on the patch schema, and that is a decision

`UpdateSocialPostInputSchema` has no `createdBy` key. The mechanism is
`deletedAt`'s: the key is stripped, which leaves the patch empty, which the
existing refine rejects. A patch that names it alongside a real key has it
dropped rather than honoured, and a test asserts both halves.

**Provenance is a fact about creation.** Editing a post the planner wrote does
not make the editor its author — it makes them its **reviewer**, and
`status: 'ready'` is where that is recorded. A live test pins it: an agent-written
post edited by a person still reads `'agent'`.

## 6. A provenance label, not a security boundary

Said plainly in the doc comment, because the alternative reading is the dangerous
one. The client sets the field and nothing on the server checks that a row
claiming `'agent'` came from one.

The product is single-owner. A user who forges the field is lying only to
themselves. The alternative — deriving the value from the route that wrote the
row — would push the planner's identity into every create path that is not the
planner, to defend against an attack whose only victim is the attacker.

## 7. The marker, and why there is no fourth status

`SocialPostList` draws a small glyph beside the status pill on agent rows, named
*Written by the agent* on a `role="img"` span. A person's rows carry nothing —
the default is that a person wrote it, and a marker on every row would say
nothing on any of them.

**Beside the pill, never inside it.** The marketer's question is not *which of
these did I write?* out of curiosity. It is **which of next week's posts has a
human actually read?** — and neither field answers that alone:

> `createdBy === 'agent'` **and** `status === 'draft'` is the unreviewed pile,
> and it is the only pile that matters before something goes out under the
> brand's name.

An `Agent` status would destroy exactly that composition, because it could not
also be `Ready`. Marking a post `ready` then becomes a real act of approval
rather than a status that was always there. Two tests assert the composition
survives: an agent row still shows `Draft`, and an agent row a person approved
shows `Ready` **and** keeps its marker.

The name carries the fact, not the glyph — `KeyDateStrip`'s rule for colour,
applied to a shape.

## 8. Files

```
packages/db/drizzle/0012_clever_crystal.sql              (generated)
packages/db/src/schema/social_posts.ts
packages/db/src/mappers.ts
packages/db/src/mappers.test.ts
packages/db/src/queries/social-posts.ts
packages/db/src/social-posts.live.test.ts
packages/shared/src/social/post.ts
packages/shared/src/social/post.test.ts
packages/shared/src/social/create.ts
packages/shared/src/social/create.test.ts
packages/shared/src/social/update.test.ts
packages/server/src/test-helpers.ts
packages/web/src/components/brand/PostEditorDialog.tsx
packages/web/src/components/brand/SocialPostList.tsx
```

Plus `createdBy: 'user'` in eleven web test fixtures and two dialog assertions.

## 9. Verified

The full gate: `typecheck` (10 packages), `lint`, `format:check`, `test`
(**1787 passed, 78 skipped**), `pnpm -F @brandfactory/web build`.

Additionally, against real Postgres — which this phase requires:

```
docker compose -f docker/compose.yaml up -d
DATABASE_URL=… pnpm -F @brandfactory/db db:migrate
DATABASE_URL=… pnpm vitest run --project @brandfactory/db   # 112 passed
```

The column was inspected in `psql` after the migration ran.

**Still open, with Phases A, B and C: nothing has been run in a real browser.**
The marker is the only visible part of this phase, and it has been seen only in
jsdom.
