# The summaries lead the rail

**Status:** complete, 2026-08-04. Written against `main` at **1.21.0** (1376
passed | 64 skipped; the skips are the live-Postgres suites).

**The ask, verbatim:** *"The latest additions we made to the Brand Context (TLDR
and Overview) should be visually/hierarchically at the top and perhaps even
separated with a subtle line from the rest."* It arrived against a screenshot of
the Brand context card reading *3 written · 4 suggested*, with `TL;DR` at row
four and `Overview` at row five — below three written aspects, above two
unwritten ones.

**No migration, no new route, no new component, no wire change.** Three
functions in `@brandfactory/shared`, one component restructured, 16 tests.

---

## 1. The screenshot is a bug report, and it names its own cause

1.21.0 put `TL;DR` and `Overview` at the head of `SUGGESTED_SECTIONS` and said so
in its §5: *"The two summaries lead `SUGGESTED_SECTIONS`, which puts them first
in the rail's unwritten rows."* Every word of that is true, and the sentence
after it is the one that was missing: **first in the unwritten rows is not first
in the list.**

`BrandContextRail` rendered two adjacent `.map`s inside one `<ul>` — every
written section, then every unwritten suggestion. So the head-of-taxonomy
position only ever ordered the *unwritten tail*. A brand that had written
`Voice & tone`, `Target audience` and `Values & positioning` got:

```
Voice & tone          ← written
Target audience       ← written
Values & positioning  ← written
TL;DR              +  ← unwritten, and therefore fourth
Overview           +
Visual guidelines  +
Messaging frameworks +
```

That order was never chosen. It was the shape of the JSX: two arrays, two maps,
in the order someone happened to type them. Written-before-unwritten is a
perfectly reasonable default for five peer sections and produces exactly the
wrong answer for two that are not peers.

**And it degraded as the brand improved.** Each aspect written pushed the
summaries one row further down, so the TL;DR sank precisely as there came to be
more for it to summarise. That is the *same failure shape* 1.21.0 fixed one layer
below, where the "do not restate what belongs there" instruction grew stronger
the more sections a brand had written. §2 of that document called it "a bug that
reads as *the feature is broken*, not as *the brand is empty*", corrected the
prompt half, and shipped the ordering half with the bug intact. This is the other
half.

## 2. Why the top, and not merely higher

Three arguments, and they are independent — any one of them would carry it.

**The code already knows.** `SuggestedSectionKind` exists and says exactly the
needed thing: `synthesis` sections read *across* the other five rather than
describing a facet of the brand. `suggested-categories.ts` notes that "generators
branch on this and nothing else does" — but the reason a *generator* has to
branch is the reason a *reader* does. The rail was the surface holding a fact it
declined to act on.

**Reading order is hierarchy.** The card answers *what do we know about this
brand?* `TL;DR` and `Overview` answer *what is this?*, and the five aspects are
details of that answer. At row four they read as two more facets nobody has got
around to — the same rank as `Messaging frameworks`, offered with the same `+`.

**Where the TL;DR is going.** It is the one section with a machine consumer, a
400-character budget (`TLDR_TARGET_MAX_CHARS`) and a stated future as standing
context injected into every request — 1.21.0 §7, `brandTldrSection`, still with
no production caller. Row four of seven says *one of the facets*. The top of the
card, under its own rule, says *this is the line everything reads*.

## 3. Why a rule, and why it does not break the rail's one promise

Reordering alone would leave `TL;DR` looking like the first of seven peers, and
the card would be lying in a new way. The rail's stated design — in its own doc
comment, and asserted by a test — is that **written sections and unwritten
suggestions are one list, and that list is the meter**. A previous pass refused
to let the palette swatches into it for exactly that reason.

The rule does not break the promise, because it splits on a **different axis**.
Written/unwritten is *progress*; `aspect`/`synthesis` is *kind*. Both bands hold
written and unwritten rows, and the header still counts every one of them, so the
list is still the meter — drawn in two pieces. The doc comment now says this
explicitly rather than leaving the next reader to notice the two rules coexist.

The hairline is also the vocabulary the card already speaks: `border-t` is what
this component uses for "different kind of content", and both the `Palette` block
and the ways-to-find-out-more footer earn one. Reading top to bottom the card now
goes **identity → what this is → the details → the palette → ways to find out
more**, with a rule at each change of register.

**No visible heading, deliberately.** Two rows reading `TL;DR` and `Overview`
under a rule already say what the band is; a `Summary` label above them would be
a word introduced to explain a hierarchy the position and the rule already
convey, in a rail whose whole register is understatement.

## 4. Three functions in shared, because placement is a taxonomy question

The rail needed to ask two things it had no way to ask: *is this label a
summary?* and *which summary comes first?* Both are answers about the taxonomy,
so both live next to the rest of the label logic in
`packages/shared/src/brand/canonical-sections.ts` — the module 1.21.0 §4 created
to stop this class of decision being made a fourth time by hand.

**`sectionKindForLabel(label)`** — `suggestionForLabel(label)?.kind ?? 'aspect'`.
Two lines, and worth a name for the `?? 'aspect'`: it is the documented fallback
(a label the user invented is one facet of the brand, which is how every label
behaved before `kind` existed), and re-typing it at each call site is how one
site forgets, gets `undefined`, falls out of both branches and drops a row off
the screen entirely. Generators keep reaching for the whole suggestion because
they also want `description` and `targetMaxChars`; a surface deciding where to
draw a row wants only this.

**`isSynthesisLabel(label)`** — the predicate the rail actually calls. The
alternative is comparing against `TLDR_SECTION_LABEL` and
`OVERVIEW_SECTION_LABEL` at the call site, which is the third hand-rolled
comparison this module exists to prevent, and which would silently stop being
true the day a third synthesis section is added to the taxonomy.

**`suggestedSectionIndex(label)`** — position in `SUGGESTED_SECTIONS`, or
`Infinity`. This is 1.21.0 §5's hazard turned into a function. That section
recorded `buildResearchPrompt` holding `SUGGESTED_SECTIONS[3].label` and the
insertion of two entries silently re-pointing its rule at the wrong section,
"passing every type check, lint and test that reads the constant rather than the
string". A position *resolved from the label at comparison time* cannot drift
that way: insert, remove or reorder entries and every caller keeps meaning what
it said.

`Infinity` rather than `-1` so that a custom label sorts **last** under a plain
numeric comparator instead of jumping to the front — and since
`Array.prototype.sort` is stable, custom labels keep whatever relative order the
caller handed in, which for sections is the user's own `priority`.

All three inherit `normaliseSectionLabel`, so `TLDR` typed by hand is placed in
the summary band. That is not a nicety: `TLDR` is the spelling 1.21.0 §4 already
identified as the one people actually type, and putting *it* in the detail band
would have reproduced the original bug for the majority spelling.

## 5. The rail: one row type, two bands

`BrandContextRail.tsx` gained a small row model, and the restructure is what
makes the split expressible at all.

```ts
type RailRow =
  | { state: 'written';   key; label; section:    BrandGuidelineSection }
  | { state: 'suggested'; key; label; suggestion: SuggestedSection }
```

Two adjacent `.map`s over two arrays cannot interleave, and the summary band has
to: with only `Overview` written, the band must still draw `TL;DR` (unwritten)
above it. Normalising both shapes into one list is the enabling change, and it
makes `state` the axis it actually is — *has this been written?* — rather than a
position in the file.

`splitRailRows(sections, unwritten)` returns the two bands. **The asymmetry
between them is the decision:**

- **`summary` is sorted**, by `suggestedSectionIndex`, ignoring both `priority`
  and written-ness. `TL;DR` before `Overview` is a fact about the two sections —
  the short version precedes the long one — and it has to hold whichever a brand
  wrote first. Anything else means the pair swaps places based on an accident of
  authoring order.
- **`aspects` is not sorted.** It keeps the previous order exactly: the user's
  own `priority` for what they have written, then the taxonomy's order for what
  they have not. Nothing about the details was wrong, and re-sorting them would
  quietly overrule a drag the user performed in the editor. The summaries lead
  because of what they *are*; that is not a licence for the rail to hold opinions
  about the rest.

`renderRow` is a closure inside the component rather than a nested component,
because both bands draw the same two row types and the alternative is either
duplicated JSX or a component taking six props. Called as a function, never as
`<Row />` — a nested component would be a new type on every render and would
remount every row, taking the open section's TipTap instance with it.

**The band is never empty**, which is what makes the hairline unconditional in
practice: a label absent from `sections` is by construction present in
`unwritten`, so `TL;DR` and `Overview` each appear as one row or the other, and
the band always holds at least two. The `length > 0` guards are there so a
future change cannot produce a bordered empty `<ul>` — a stray hairline with
nothing under it.

**Duplicates survive.** Nothing in the schema stops a brand having two rows
labelled `TL;DR` — `findSectionByLabel`'s doc comment says so — and both belong
in the band. Filtering to the first would hide a section the user can see in the
editor and then cannot find here.

## 6. The two bands are labelled for assistive tech

`aria-label="Brand summary"` and `aria-label="Brand details"` on the two `<ul>`s.

The split is otherwise purely visual, and structurally a screen reader now hears
*"list, 2 items"* followed by *"list, 5 items"* with nothing saying why. An
unexplained division reads worse than a named one. The names describe what the
rows are without introducing vocabulary the card never shows visually — which is
also why they are `aria-label` and not a rendered heading (§3).

## 7. Scope: the rail hoists, the editor does not

Considered and rejected for `BrandGuidelinesEditor`, which is the other surface
rendering the same list.

The rail is a **reading** surface and hoisting there costs nothing. The editor is
not: its rows are drag-reorderable, and the drag writes `priority` on save
(`(i + 1) * 1000`). Hoisting the summaries there would override a gesture the
user made on purpose, and would fight them every time they dragged — the row
would spring back.

This does mean the two surfaces can order differently, which is precisely the
class of disagreement 1.21.0 §4 went and fixed between the rail and the editor.
The difference is that *that* disagreement was accidental — two hand-rolled label
comparisons that were supposed to match and did not — while this one is stated:
the rail presents an editorial hierarchy, the editor presents the user's own
order, and a user who drags their `TL;DR` to the bottom of the editor has changed
where it is *stored*, not what it *is*.

The editor's quick-add chips need no change: they already iterate
`SUGGESTED_SECTIONS` in order, so they already lead with the two summaries.
`BrandContextPane` is a pass-through wrapper and is untouched.

## 8. What was deliberately not changed

- **The header count.** `3 written · 4 suggested` still counts both bands
  together — the split is presentation, not a second aggregate, and the list is
  still the meter (§3).
- **`GuidelineMeter`.** Still seven dots against `SUGGESTED_SECTIONS.length`.
  The summaries are sections; a brand that has written them has written them.
- **The icons.** `Zap` and `BookOpen`, unchanged from 1.21.0 §6.
- **`buildSystemPrompt`.** The TL;DR still reaches the model as an ordinary
  `### TL;DR` in the section block. Hoisting it into standing context is the work
  1.21.0 §7 named and left for later, and this change does not touch it — a card
  drawing the row at the top is not the same claim as a request carrying it.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1392 passed | 64 skipped (134 files)
pnpm -F @brandfactory/web build   clean
```

Rendered markup confirmed by dumping the DOM from a throwaway render (since
deleted): `<ul aria-label="Brand summary">` with 2 `<li>`, then
`<ul aria-label="Brand details" class="… border-t">` with 5, then the footer's
own `border-t`.

**4 files modified, 0 added.** Tests 1376 → **1392** (+7 in
`canonical-sections.test.ts`, +9 in `BrandContextRail.test.tsx`).

| File | Change |
| --- | --- |
| `packages/shared/src/brand/canonical-sections.ts` | `sectionKindForLabel`, `isSynthesisLabel`, `suggestedSectionIndex` |
| `packages/shared/src/brand/canonical-sections.test.ts` | +7 |
| `packages/web/src/components/brand/BrandContextRail.tsx` | `RailRow`, `splitRailRows`, `renderRow`, two bands |
| `packages/web/src/components/brand/BrandContextRail.test.tsx` | +9 |

The new rail tests are genuinely coupled to the change: under the previous
ordering `screen.getByRole('list', { name: 'Brand summary' })` does not resolve
at all, and the document-order assertion returns
`['Voice & tone', 'Target audience']`.

### A number corrected on the way past

The `1.21.0` commit subject claims **1381 tests**; `docs/changelog.md` claims
**1376**. The pre-change baseline measured here is 1376 (1392 minus the 16 added),
so the changelog is right and the commit subject is wrong. Nothing to fix — noted
so the next person reconciling the two does not go looking for five missing tests.

## Caveats

- **Not seen in a browser.** The same caveat 1.21.0 shipped with, and still open
  for the rows this change moves. The structure is confirmed from the rendered
  DOM and the change is a reorder plus one `border-t`, but the thing to look at
  is **hairline density**: a brand with colours now draws four rules in one card
  (header, summary/details, palette, footer) where it drew three. If that reads
  as busy, the palette block's rule is the one to reconsider — it separates two
  bands that are already separated by a heading.
- **No changelog entry written.** This document is the record; the version bump
  and its `##` section are a separate call.
