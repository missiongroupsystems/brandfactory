# The brand description becomes the TL;DR

**Status:** complete, 2026-08-07. Written against `main` at **1.23.1**
(1637 passed | 68 skipped before this work; the skips are the live-Postgres
suites).

**No migration, no new route, no column added or dropped.** One wire field
(`BrandSummary.tldr`), one shared module, one file moved between packages, and
two render paths that stop reading `brand.description` directly. 3 files added,
17 modified. 1669 passed | 75 skipped after.

---

## 1. The ask, and what was actually wrong

The request came with a screenshot of the brand hub header: monogram, the name
*Casa Vostra*, the dotted-underline affordance **Add a description**, and the
website below it. The brand had a `TL;DR` section written. The header asked for
a description anyway.

> The optional description of each brand should automatically be the TLDR if
> the TLDR is populated.

Two fields had been answering the same question since 1.21.0 added `TL;DR` to
the section taxonomy:

- **`brands.description`** — a nullable column, edited only in `RenameDialog`,
  shipped in the very first schema.
- **The `TL;DR` section** — whose own `SUGGESTED_SECTIONS` description reads
  *"The whole brand in a few sentences — what it is, who it is for, how it
  sounds."*

`BrandIdentity`'s doc comment had already conceded the overlap in prose —
*"The description is the brand's TL;DR, so an empty one is offered as an action
rather than rendered as absence"* — while the code kept the two entirely apart.
That sentence was the specification; nothing implemented it. The result was the
screenshot: a brand that had said what it was, being asked to say it again, in a
second field, in a dialog named *Rename*.

## 2. The decision that was not mine to make

*If* the TL;DR feeds the description line, then a brand holding **both** has a
precedence question, and the two readings of the request produce materially
different products. It was put to the user before any code was written:

| | Brand with both | Casa Vostra (TL;DR only) |
| --- | --- | --- |
| **TL;DR wins** | shows the TL;DR | shows the TL;DR |
| Description wins, TL;DR fills the gap | shows the description | shows the TL;DR |

**The user chose TL;DR wins**, and also chose to extend the change to the
workspace-home brand cards rather than the hub header alone. Both answers are
implemented here as chosen.

### The cost of that order, stated plainly

A brand holding both keeps a `description` nobody sees, and editing it in the
rename dialog changes nothing on screen. That is a real trap and it is not
hidden anywhere in this implementation — it is written into the module header of
`description-line.ts` so the next reader meets it before the code.

> **Amended by the pre-release review (see 1.24.0 §5).** *"Nobody sees it"* was
> not true when this was written. `buildSystemPrompt` still pushed
> `brands.description` into the brand header while the section block rendered
> `### TL;DR` separately, so for a brand holding both, **the model** received two
> competing answers to *what is this brand* — and the losing one was invisible on
> every screen, so the user could neither see the conflict nor fix it. The
> header now defers to the TL;DR by the same rule every surface applies. The
> sentence above is accurate as of that fix.

What is **not** traded away is the text itself. Nothing in this change writes to
either field, converts one into the other, or drops a row. Clearing the TL;DR
brings the description straight back, which is what makes the precedence a
display rule rather than a migration.

The third option offered — retire `description` from the brand rename dialog
entirely, so the duplicate can never be written again — was not taken, and is
the honest follow-up if the invisible field turns out to bite. It touches the
dialog, the update route contract and existing rows, which is why it was not
smuggled in here.

## 3. `proseMirrorDocToPlainText` moves to `shared`

A section body is a ProseMirror doc. Rendering one as a line means flattening
it, and the flattener already existed — in `packages/agent/src/prompts/`, which
`packages/web` must not import (`architecture.md`: the agent package is
backend-consumed, server-side only, so API keys stay server-side).

It moved to `packages/shared/src/prose-mirror.ts`, unchanged except for its
import and a note explaining the move. Its two callers — `system-prompt.ts` and
`canvas-context.ts` — now import it from `@brandfactory/shared`; its test moved
with it.

It was written in `agent` because for as long as the only reason to flatten a
section body was to feed a model, that was the only place it belonged. The brand
hub flattens one for a person. Copying it into `web` would have left two
flatteners to keep in step, differing over which node types count as blocks —
so the pure walk over JSON went where pure walks over JSON go.

## 4. `shared/brand/description-line.ts` — one rule, four functions

| Export | Answers |
| --- | --- |
| `sectionBodyToLine(body)` | this body as one line, or `null` if it has no words |
| `brandTldrLine(sections)` | this brand's TL;DR as one line, or `null` |
| `brandDescriptionLine({tldr, description})` | **the precedence** |
| `TLDR_SECTION_KEY` | `'tldr'` — for the SQL in §5 |

Three decisions inside it are worth recording, because each is a place the
obvious implementation is wrong.

### Collapsed to one line, not truncated

`proseMirrorDocToPlainText` joins blocks with a blank line. That is correct for
a prompt and wrong for a `<p>`: HTML folds the newlines but not the spacing
around them, so a two-paragraph TL;DR renders as one run with a stray gap in the
middle of it. Every whitespace run becomes a single space, which also makes a
bulleted TL;DR read as a sentence instead of a collapsed list.

Length is deliberately untouched. `TLDR_TARGET_MAX_CHARS` (400) binds what a
*generator* writes, not what a person types, so the ceiling belongs to the
surface that has to fit the text — see §6 — and not to a shared function that
would hand every caller the same lossy string with no way back to the original.

### An empty TL;DR is not a TL;DR

A guideline section row exists from the moment its label is typed, and the
rail's suggestion chips create labelled rows with empty bodies on purpose. If
the row's *existence* were the signal, clicking the `TL;DR` chip would blank a
working description instantly and before the user wrote a word. `brandTldrLine`
returns `null` for an empty body, so the description survives until the TL;DR
actually says something.

### The precedence takes two strings, not a brand

Its two callers hold different shapes: the hub has `BrandWithSections` and
resolves the TL;DR client-side; the grid has `BrandSummary` and gets it
pre-flattened from SQL. Passing the rule two resolved strings is what lets those
paths meet at one function instead of stating the precedence twice, once per
shape — which is the drift `canonical-sections.ts` was written to prevent.

## 5. Carrying the TL;DR to the workspace grid

`BrandSummary` had no sections and no route that would have given it any. The
card needs a two-line string, so a `tldr: string | null` field was added to
`BrandSummarySchema` — resolved, not raw. Shipping the TL;DR's ProseMirror doc
(let alone every section of every brand) to draw two clamped lines would have
traded away the one round trip `BrandSummary` exists to provide.

It is nullable and **not** defaulted: a missing field and an absent TL;DR must
not collapse to the same value at a wire boundary, because the first is a query
that forgot to select it and the second is most brands.

### The SQL is a prefilter; the mapper is the authority

`listBrandSummariesByWorkspace` already left-joins `guideline_sections` for its
count, so the TL;DR rides that join as a filtered aggregate — no extra scan, no
second round trip:

```sql
(jsonb_agg(
   jsonb_build_object('label', gs.label, 'body', gs.body) order by gs.priority
 ) filter (
   where lower(regexp_replace(gs.label, '[^[:alnum:]]', '', 'g')) = 'tldr'
 )) -> 0
```

The label rule lives in `normaliseSectionLabel`, and it cannot run inside
Postgres. Rather than let a regex in SQL quietly become a second definition of
*what counts as a TL;DR*, the two halves are split by responsibility:

- **The `where` clause narrows.** It duplicates only the character strip — the
  label itself arrives bound as `TLDR_SECTION_KEY`, so the query never spells
  `TL;DR` at all.
- **`rowToBrandSummary` decides.** It re-checks the returned label with
  `sameSectionLabel` before believing it.

The two can only disagree in the safe direction: POSIX `[:alnum:]` is at worst
*looser* than `\p{L}\p{N}`, so the SQL can hand back a row the shared rule
rejects, and never miss one the shared rule would accept. An over-fetched row is
discarded; a missed section is impossible. A test asserts exactly that
(`discards a row the shared label rule rejects`).

`jsonb_agg(… order by priority) -> 0` rather than `min` or a `limit`: nothing
stops a brand holding two rows labelled `TL;DR`, `brandTldrSection` documents
that the first by priority is *the* one, and this picks the same one. Returning
label and body as a single object keeps that pairing atomic — two scalar
aggregates could in principle answer from different rows.

The server needed **no change at all**: `deps.db.listBrandSummariesByWorkspace`
is a `typeof` pass-through in `db.ts`, so the field arrived at the route through
the type. The in-memory fake in `test-helpers.ts` was updated to resolve `tldr`
through the same `brandTldrLine` over the sections already in its state —
hard-coding `null` there would have made every route test blind to the field.

## 6. The two surfaces

**`BrandIdentity`** (hub header) resolves both halves locally, since
`BrandWithSections` already carries the sections, and gained a `line-clamp-3` it
never had. The hand-typed description never needed one; a TL;DR does. A
generated one reaches 400 characters and a hand-written one has no ceiling at
all, which at `max-w-prose` is roughly six lines — turning a band whose entire
job is *whose page is this* into the tallest thing above the fold.

Clamping is safe **here specifically** because nothing is hidden: the full text
is the rail's own `TL;DR` row, one card to the right on the same page. It would
not be safe on a surface with nowhere to send the reader.

**`BrandCard`** (workspace home) reads `brand.tldr` from §5 through the same
`brandDescriptionLine` and keeps its existing `line-clamp-2`. The grid and the
page it links to must not disagree about what a brand says it is.

The `Add a description` affordance is unchanged and still routes to `onRename`,
because `RenameDialog` owns `description` — which remains the field it can
actually write. It now appears only when there is genuinely neither.

## 7. Tests

+32 over the previous count. The precedence is asserted at all three levels it
passes through — shared unit, hub component, card component — which is
deliberate: a rule stated once and wired twice can be wired backwards once.

| File | Covers |
| --- | --- |
| `shared/brand/description-line.test.ts` (16) | the rule itself: precedence, blank-string handling on both sides, empty-body TL;DR, punctuation tolerance, no truncation |
| `web/…/BrandIdentity.test.tsx` (+7) | the band is wired to it, plus the multi-paragraph collapse and the clamp |
| `web/…/BrandCard.test.tsx` (+4) | the card agrees with the band |
| `db/mappers.test.ts` (+5) | the mapper's re-check, including a row the SQL let through and the rule rejects |
| `db/brand-tldr.live.test.ts` (7, live) | **the SQL, executed** |

### Why the live file is not optional coverage

The aggregate in §5 is a raw string. No type checks it, no lint reads it, and no
unit test executes it. `mappers.test.ts` covers the TypeScript half by handing
`rowToBrandSummary` a row it made up — so a typo in the aggregate, a `->` where
`->>` belonged, or a bracket expression Postgres rejects would have left the
whole suite green and every workspace grid returning a 500.

It was run against real Postgres (compose up, migrate, seed), not merely
written: **7 passed**, and the full `db` project ran 108 passed with zero skips.

### Mutation checks

Every new guard was confirmed to fail on the defect it exists to catch, rather
than assumed to:

| Mutation | Result |
| --- | --- |
| Flip the precedence to description-first | 3 failures — one per level (shared, hub, card) |
| Drop the `filter (where …)` clause | all 7 live tests fail |
| `order by priority` → `desc` | the two-TL;DR test fails, alone |

## 8. The live pass

The hub header change is a CSS line clamp, and jsdom has no layout — the
component test can assert the class is present but not that it clamps anything.
So it was checked in the running app (Playwright, seeded DB, `Acme Coffee` given
both a typed description and a deliberately long two-paragraph TL;DR):

- The header renders the **TL;DR**, not the typed description.
- The two paragraphs arrive as one run separated by a single space.
- The clamp bites at three lines, ending `…It never…`, with the full text
  legible in the rail's `TL;DR` row beside it.
- On the workspace home, `Acme Coffee` (both) shows its TL;DR and
  `Northwind Studio` (description, no TL;DR) keeps its description — the grid
  and the hub agree.

Teardown: no `.env`, no container, no volume, no untracked file left behind.

## 9. The gate

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint / format:check          clean (whole repo)
pnpm test                         1669 passed | 75 skipped (144 files)
pnpm test  (DATABASE_URL set)     1744 passed | 0 skipped (144 files)
pnpm -F @brandfactory/web build   clean
```

1637 → 1669 (**+32**). The skip count moved 68 → 75 for the seven new live
tests, which is the expected shape.

The review pass added five more in `agent/…/system-prompt.test.ts`, taking the
release to **1674 passed | 75 skipped**. See 1.24.0 §5 and §7.

## 10. Follow-ups, not done here

- **Retire `description` from the brand rename dialog.** §2's third option. The
  case for it is that an invisible editable field is a trap; the case against
  doing it now is that it changes the update contract and strands existing rows.
- **The `TL;DR` still has no standing-context wiring.** `brandTldrSection`'s own
  comment says the seam exists and the role does not. This change is the second
  real caller of that seam, not the delivery of the role.
- **`BrandSwitcher`, `BrandRail` and `WorkspaceNavPanel`** all take
  `BrandSummary` and now receive `tldr` without reading it. They show names, not
  descriptions; nothing was changed there beyond their test fixtures.
