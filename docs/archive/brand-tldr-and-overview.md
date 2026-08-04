# TL;DR and Overview — two sections that read across the rest

**Status:** shipped, **2026-08-03**. Written against `main` at **1.20.0** (test
baseline *1332 passed | 64 skipped*; the skips are the live-Postgres suites).
No migration. No new route. No new component.

**The ask, verbatim:** *"Brand Context is good as is. Let's add a TLDR
section/field as well as an Overview attached to each brand. It, like all other
context sections, can be edited manually or AI generated. The purposes of these,
btw, especially the TLDR field, will be as a perpetual system context/injection
prompt later on when we get to it."*

It arrived with a screenshot of the Brand context card — `Voice & tone`,
`Target audience` and `Values & positioning` written; `Visual guidelines` and
`Messaging frameworks` offered with a `+`; *3 written · 2 suggested* under the
heading. The two new sections belong in that list, not beside it.

---

## What was built

`TL;DR` and `Overview` are **guideline sections**, at the head of
`SUGGESTED_SECTIONS`. Everything that already works on a section works on them
the day they land — the rail row and its `+`, the editor row, drag-to-reorder,
the sparkle, capture-from-a-thread, research drafts, `createdBy` provenance,
the system prompt.

The work is not in adding them. It is in the four places where a section that
**summarises the others** behaves differently from one that describes an aspect
of the brand, and in one lookup that has to survive being typed `TLDR`.

| | |
| --- | --- |
| Files changed | 17 modified, 3 added |
| Migrations | none |
| Tests | 1332 → **1376** (+44, three of them from the review pass) |

---

## Decisions

### 1. Sections, not columns on the brand row

The ask says *field*, and a `brands.tldr` column was the obvious reading. It was
rejected because the sentence immediately after it — *"like all other context
sections, can be edited manually or AI generated"* — describes machinery that
already exists and is attached to `guideline_sections`, not to `brands`. A
column would have needed a migration, a wire type, a route, an editor control,
its own AI path, and its own answer to "what does the sparkle do here" — all to
arrive at a text field that the section list already is.

So: no migration, no new endpoint. The cost of this choice is that a brand can
delete its TL;DR, rename it, or have two — which §5 answers.

### 2. `kind: 'aspect' | 'synthesis'` — the change that makes the feature work

Both AI paths tell the model which sections the brand already has, and then:

> *The brand's guidelines already have sections for: Voice & tone, Target
> audience, Values & positioning. **Do not restate what belongs there.***

That is exactly right for an aspect, and exactly backwards for a summary. A
TL;DR forbidden from mentioning voice, audience or values has been asked to
summarise nothing — and the instruction gets *stronger the more the brand has
written*. Left unflagged, the sparkle would have failed hardest on the most
complete brands and returned `no-material` on the ones it should work best on:
a bug that reads as "the feature is broken", not as "the brand is empty".

So `SuggestedSection` gained a `kind`, and the same list is now introduced two
ways:

> *…This section sits above them and summarises across all of them — draw on
> that ground freely, but write it as one coherent whole rather than a list of
> the other sections.*

The flag reaches **three** generators, because there are three places that write
a section body and all of them had the same assumption baked in:

- `buildSectionShapePrompt` (Path R — the stored report, on the workspace's own
  model). Its **rule 2 also swaps**: *"Compress"* / *"the version someone reads
  in a sidebar"* aims a model at one passage, and rule 1 gives it a compliant
  way to return nothing when it cannot find that passage. A summary is told to
  compress the whole report instead, and that rule 1 applies only if the report
  is empty outright.
- `buildSectionSearchPrompt` (Path S — the pinned `sonar-pro` search).
- `buildShapePrompt` (the batch shaping pass on a finished deep run). It has no
  `existingLabels` to invert — its neighbours are its own output — so it gets
  rule 8 instead, naming the summary labels as reading across the whole report.

A custom label the user invents resolves to no `kind` and gets aspect behaviour,
which is what every label got before this existed.

### 3. `TLDR_TARGET_MAX_CHARS = 400`, because of where it is going

Every other section is capped at `DRAFT_TARGET_MAX_CHARS` (1200) — a comfortable
paragraph or two in a sidebar. The TL;DR is the one section written to be
*injected* rather than read, so its cost is paid on every request forever and
its job is to be the shortest true statement of the brand. 400 characters is
three or four sentences: long enough to name what the brand is, who it is for
and how it sounds; short enough that nobody has to decide whether to trim it.

A generator's ceiling, **not a schema bound** — a TL;DR typed by hand is as long
as its author wants. `Overview` is deliberately uncapped: it is the long version
of the same thing, and 1200 is right for it.

### 4. Ordering, and the positional reference it broke

`TL;DR` and `Overview` lead `SUGGESTED_SECTIONS`, which puts them first in the
rail's unwritten rows, first in the editor's quick-add chips, and first in the
deep report's headings. A brand's one-paragraph answer to *"what is this?"* is
what everything else is a detail of.

Putting them at the head is also what surfaced a live hazard.
`buildResearchPrompt` aimed its no-hex rule with `SUGGESTED_SECTIONS[3].label`,
and inserting two entries above index 3 re-points that rule from
`Visual guidelines` to `Voice & tone` — **silently**, passing every type check,
lint and test that reads the constant rather than the string. The label is a
named export now (`VISUAL_GUIDELINES_SECTION_LABEL`), and a test asserts the
rule names it.

The deep prompt also gained one line, because the headings' *position* and their
*material* disagree: they come first but are written last, from everything below
them.

### 5. `normaliseSectionLabel` — TL;DR is the label nobody types twice the same way

The canonical label is `TL;DR`. What people type is `TLDR`. Under the previous
comparison (`label.toLowerCase()`) those were two different sections, with three
consequences, all of them quiet:

- the row got no `description`, aspect rules and a 1200-character ceiling — the
  precise combination that produces a bad TL;DR;
- the rail offered to *add* a TL;DR to a brand that had one;
- the icon collapsed to the generic `FileText`.

`normaliseSectionLabel` lowercases and drops every character that is not a
letter or a digit, so `TL;DR`, `TLDR`, `tl;dr` and `TL-DR` are one section. It is
deliberately not clever: `Voice and tone` still does not equal `Voice & tone`,
because inventing that equivalence would merge two rows a user meant to keep
apart. The rule is *punctuation and case are noise; words are not*.

**The class is `\p{L}\p{N}`, not `a-z0-9`** — caught in review, and the
distinction is the rule rather than a detail. An ASCII class does not keep
letters, it keeps *English*: every character of a label written in Japanese,
Cyrillic, Greek, Arabic or Thai is stripped, the label normalises to the empty
string, and any two such labels compare equal. That inverts the sentence above —
for those scripts every word becomes noise — and it was already reachable, in
`autofill.ts`, where the `existingLabels` filter would drop *every* non-Latin
sibling and tell the model a populated brand had no other sections. The Unicode
classes leave every ASCII answer byte-identical and make the rest correct.

`packages/shared/src/brand/canonical-sections.ts` is the one place that decides
this, and it also carries the **named lookups** — `brandTldrSection`,
`brandOverviewSection`, `findSectionByLabel`. See §7 for why they exist before
anything calls them.

**This fixed a real disagreement on the way past.** `BrandContextRail`'s comment
claims its unwritten-suggestion filter matches "the same way the editor's
quick-add chips decide what to offer, so the rail and the dialog never disagree"
— and they did: the rail trimmed and lowercased, the editor compared
`s.label === sg.label` raw. A brand with `voice & tone` in lower case got no
rail suggestion *and* a quick-add chip that would append a second copy of a
section already on screen. Both call `sameSectionLabel` now, and the comment is
true.

### 6. Icons: a lightning bolt and an open book

`Zap` for `TL;DR`, `BookOpen` for `Overview` — the short version and the long
version of the same thing, reading as a pair in a rail whose other five glyphs
are all nouns. Keyword fallbacks were added for the labels people write instead:
`summary`, `in a nutshell` → `Zap`; `about`, `background` → `BookOpen`.

The exact map is now keyed on the **normalised** label, so `TLDR` finds its
glyph. The keyword pass deliberately stays on the plain lowercase string:
removing spaces first makes every word junction a possible match — `Custom
Erasure` normalises to `customerasure`, which contains `customer`. The cost is
that punctuated shorthand is listed in both spellings (`tl;dr` beside `tldr`).

`background` sits **below** the visual keywords rather than up with the other
`BookOpen` entries — a review note. It reads as an Overview synonym in `Company
background` and as a surface in `Background colour`, and ahead of `visual` and
`colour` it claimed both. Below them the compound cases resolve on their visual
word and the bare Overview sense still lands; `Background imagery` has no visual
keyword to catch it and stays a book, which is genuinely ambiguous and is only a
glyph.

### 7. The injection is **not** wired, and the seam is named anyway

The ask puts the perpetual-system-prompt role explicitly in the future
(*"later on when we get to it"*), so it is not built here. Two things are true
in the meantime:

- **The TL;DR already reaches the model**, as an ordinary `### TL;DR` inside
  `buildSystemPrompt`'s section block, because every section does. Written
  first, it leads that block.
- **What it does not have** is the standing-context role: hoisted above the
  guidelines, carried into surfaces that do not render the full section list,
  and priced as a fixed per-request cost.

`brandTldrSection` exists with no production caller for exactly that reason. Its
only consumer today is a test. When the injection is built it will not have to
re-decide what counts as a TL;DR, which is the fourth place that decision would
otherwise have been made by hand.

---

## What changed, by package

**`@brandfactory/shared`**

- `suggested-categories.ts` — `SuggestedSectionKind`; `kind` and optional
  `targetMaxChars` on `SuggestedSection`; the two new entries at the head;
  `TLDR_SECTION_LABEL`, `OVERVIEW_SECTION_LABEL`,
  `VISUAL_GUIDELINES_SECTION_LABEL`, `TLDR_TARGET_MAX_CHARS`.
  The array is now **type-annotated rather than `as const satisfies`** — under
  `as const` an *optional* property is simply absent from the six entries that
  omit it, so `SUGGESTED_SECTIONS.map((s) => s.targetMaxChars)` does not
  compile, which is the only way a consumer wants to read it. Nothing was using
  the literal types; the labels that needed one have named constants.
- `canonical-sections.ts` *(new)* — `normaliseSectionLabel`, `sameSectionLabel`,
  `suggestionForLabel`, `findSectionByLabel`, `brandTldrSection`,
  `brandOverviewSection`. **+12 tests.**

**`@brandfactory/adapter-research`**

- `port.ts` — `SectionSearchRequest` gains optional `kind` and `maxChars`.
- `prompt.ts` — the inversion in `buildSectionSearchPrompt`; the ceiling;
  `buildResearchPrompt`'s named label and summary line.
- `prompt.test.ts` *(new)* — the prompts read as text, which nothing did before:
  `perplexity.test.ts` asserts that the *builders* reach the wire, and the
  builders' content was unpinned. **+11 tests.**

**`@brandfactory/agent`**

- `shapeSection.ts` — `kind`/`maxChars` on the input; the inverted neighbours
  line; the swapped rule 2. **+5 tests.**
- `shape.ts` — rule 8 and the per-section cap in rule 2. **+2 tests.**

**`@brandfactory/server`**

- `research/autofill.ts` — one `suggestionForLabel` call replaces the
  `toLowerCase()` description lookup and now yields three facts; `existingLabels`
  excludes the filled row through `sameSectionLabel`; both paths carry `kind`
  and `maxChars`. **+4 tests.**
- `research/shape.ts` — `ShapeSectionFn` and `createSectionShaper` thread the
  two fields through.

**`@brandfactory/web`**

- `guidelineIcons.ts` — the two glyphs, the normalised exact map, six keywords.
  **+2 tests.**
- `BrandContextRail.tsx` / `BrandGuidelinesEditor.tsx` — both label filters onto
  `sameSectionLabel`. **+1 / +4 tests.**

No change was needed in `GuidelineMeter` (it reads `SUGGESTED_SECTIONS.length`
and now draws seven dots), in the routes that pass `onAutofill`, or in any
test that was written against the constant rather than against `5`.

---

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint / format:check          clean (whole repo)
pnpm test                         1376 passed | 64 skipped (134 files)
pnpm -F @brandfactory/web build   clean
```

## Caveats

- **Nothing here has been seen in a browser**, and the same two questions the
  1.20.0 note raised apply: seven rows in the rail instead of five, and whether
  `TL;DR` reads as a label or as an abbreviation someone forgot to expand. Both
  are one look away.
- **No live AI pass on either path.** The inversion is asserted at the prompt
  string, not at a model's response — nobody has yet clicked the sparkle on a
  real `TL;DR` row and read what came back. It is the cheap end of the feature
  (Path R is cents of the workspace's own tokens; Path S is ~$0.01), and it is
  the only way to find out whether 400 characters is the right ceiling.
- **The deep report now asks for seven headings instead of five**, on a run that
  costs ~$0.38 and has not been re-run since. The two extra headings are cheap
  for the finder and their absence is already handled — `omit a heading entirely
  rather than guess` is unchanged — but the first paid run after this is the
  first evidence.
- **The quick-add chip appends**, so the ordering §4 establishes governs only
  where the *suggestion* is offered. A TL;DR added to a brand that already has
  sections lands last in the editor, last among the rail's written rows, and —
  because `priority` is `(i + 1) * 1000` by array index and `buildSystemPrompt`
  sorts ascending — **last in the system prompt's section block**, which is the
  opposite of the order §4 puts it in and qualifies §7's "written first, it leads
  that block". Drag-to-reorder recovers it. Found in review, left unfixed:
  inserting a `synthesis` suggestion at the head instead of appending is a small
  change, and it wants the browser pass first.
- **A brand can still delete, rename or duplicate its TL;DR**, which is the
  price of §1. `brandTldrSection` returns the first match and `undefined` when
  there is none; the future injection has to be honest about a brand that has
  not written one rather than manufacture a substitute.
- Deliberately unchanged: `buildSystemPrompt`, which renders the TL;DR as an
  ordinary section in priority order. See §7.
