# Brand Profile — integration plan

`docs/completions/brand-profile-next.md` §10 lists four steps and this plan executes them, plus
two the user asked for on top: the page moves into the sidebar's **Registry** section, and the
profile becomes **editable** rather than read-only.

The page was built in 1.34.x-era work against `features/brand-profile/fixtures.ts` with one
declared seam — `useBrandProfile(brandId)` — and a view model (`types.ts`) already flattened for
exactly this moment. Everything below is arranged so that the components do not move.

---

## 0. What was decided, and by whom

Asked and answered before any code:

| Question | Answer |
|---|---|
| Read-only, or read **and** write? | **Read and write.** The profile gains editing. |
| Real logo asset, or the monogram? | **Monogram.** No blob read-URL mechanism in this package yet. |
| Assets — `active` only, or `proposed` too? | **Neither: skip assets entirely for now.** |

The third answer came with a premise worth correcting on the record: *"leave Brand Pillars empty
… we haven't implemented that on BE yet"*. **Brand pillars are implemented.** The band reads the
`Values & positioning` guideline section, which is one of the eight rows in `SUGGESTED_SECTIONS`,
stored in `guideline_sections` like every other. Wiring the sections therefore wires the pillars,
and no special case is added for them. A brand that has not written that section sees the band's
empty state — which is the placeholder the answer asked for, arrived at by rendering the truth
rather than by pretending.

**Skipping assets means `colours: []` and `typefaces: []`.** `VisualIdentityBand` already renders
nothing when both are empty and `ProfileIdentity`'s palette strip already hides itself, so the
page loses two bands and gains no empty state. It is one function — `GET /brands/:id/assets` plus
a filter — whenever it is wanted.

---

## 1. Phase 1 — the nav move

`Brand profile` moves out of the first unlabelled group (where it sat above Dashboard) and into
**Registry**, above Outlets.

The catch is the invariant 1.34.1 §1 finally wrote a test for: the order lives in **two** places
in `components/layout/nav.ts` — `NAV_ITEMS` declares it, `NAV_GROUPS` renders it — and grouping
does not reorder. So the move is made twice or it is made wrong, and `nav.test.ts` fails if it is
made once.

- `NAV_ITEMS` — the `Brand profile` entry moves **below** Dashboard, so the declared order matches
  the grouped one.
- `NAV_GROUPS` — `/brand` leaves group 1 and becomes the first `href` of `Registry`.
- Both comments are rewritten rather than carried. The current one justifies a position ("First,
  above the Dashboard, because…") that will no longer exist, and a comment defending an adjacency
  the file does not have is worse than no comment.

Dashboard is then alone in the unlabelled group, which is what that group's own docstring says it
is for: *"Dashboard is the home, not a section."*

---

## 2. Phase 2 — the read wiring

### 2.1 The transport

`features/brand-profile/api.ts`, new, and the only file in the feature that names a route:

```ts
brandProfileService.get(brandId)       // GET /brands/:id        -> BrandWithSections
brandProfileService.research(brandId)  // GET /brands/:id/research -> {enabled, maxMinutes, job}
```

Both through `bf` (`hc<AppType>`), so a renamed segment is a type error here rather than a 404 in
a browser. Two calls and not one because they are two aggregates on the server and the second is
allowed to fail without taking the page with it — a deployment with no research provider answers
`enabled: false` and the footer simply says nothing.

### 2.2 The ProseMirror walk — `blocks.ts`

The one piece of new logic, and the reason `types.ts` recorded two rules for it.

`proseMirrorDocToPlainText` in `@brandfactory/shared` **cannot be reused**: it flattens every
block type to a string and joins with blank lines, so a bullet list and four paragraphs come out
identical. Rule 1 of `types.ts` — *a `list` block is a real list in the document, not a paragraph
starting with a dash* — is precisely the distinction it throws away, and the pillar band depends
on it.

So `docToBlocks(doc): ProfileBlock[]`, in the feature, with tests:

- `paragraph` / `heading` / `blockquote` / `codeBlock` → one `paragraph` block.
- `bulletList` / `orderedList` → one `list` block, one item per `listItem`.
- A list nested inside a `listItem` flattens into the enclosing list block, in document order.
  The view model has no nesting; the alternative is dropping the items, which loses content.
- Empty blocks are dropped, so an empty document maps to `[]` — which is rule 2's *labelled and
  says nothing*, and what `isWritten` already reads.
- Marks are dropped, as `types.ts` says. **Nothing is lost by this**, because the editor in
  Phase 3 works on the stored document and never on these blocks.

It stays in the feature rather than moving to `shared` for the reason `prose-mirror.ts` gives for
having moved *out* of `agent`: one consumer is not the threshold. Promote it when a second appears.

### 2.3 The mapper — `map.ts`

`toBrandProfile(brand: BrandWithSections, job: ResearchJobSummary | null): BrandProfile`.

- `updatedAt` and each section's `updatedAt` are **truncated to a business date** (`YYYY-MM-DD`),
  which is what `types.ts` specifies and what makes `formatDate` correct west of Greenwich.
- `kind` comes from `shared`'s `sectionKindForLabel` — the taxonomy stays in one place.
- `research` is non-null only for a **completed** run carrying a `completedAt`. A failed or
  in-flight job is not a research date, and the footer must not print one.
- `colours` / `typefaces`: `[]`. See §0.
- `description` is added to `BrandProfile`, nullable — see 2.5.

### 2.4 The hook

`useBrandProfile` keeps its signature and its two rules (*the route wins, the preference is the
fallback*; an unknown id falls back to the active brand). Inside, `sampleProfileFor` and the
fixture import are replaced by two `useSWR` calls and the mapper. New scopes in `lib/api/cache.ts`:
`bfBrand` and `bfResearch`.

`isLoading` covers the brand read only. The research read is allowed to be late: a footer line
that appears a beat after the page is not a loading state anybody needs to see.

### 2.5 What the page gains, loses and stops claiming

- **`Sample content` badge** — gone. **Footer note** — rewritten: it may no longer say the page
  renders samples, and it may no longer promise that editing is coming, because Phase 3 lands it.
- **`Sample` tag in the nav** — gone. `NavItem.tag`'s docstring names Brand profile as one of its
  two examples and is edited with it.
- **The `brandName` prop** — gone. It existed because the identity was real and the content was
  not; both are real now, so `profile.name` is the name and a second source is a second answer.
- **`description`** — rendered under the name **only when the TL;DR is unwritten**. That is
  `brandDescriptionLine`'s precedence exactly (the TL;DR wins; the description is the older,
  weaker copy of the same sentence), applied here without duplicating the hero band's text.
- `fixtures.ts` and `sampleProfileFor` are deleted in the same commit, per §10's fourth step.
  `components/brand-profile.test.tsx` is rewritten against a mocked profile rather than a fixture.

---

## 3. Phase 3 — editing

### 3.1 The shape of the write

There is exactly one write for guidelines: `PATCH /brands/:id/guidelines`, and it takes the
brand's **complete section list**. Omitted rows are deleted. That single fact drives every
decision below.

- **Per-section editing, not a whole-list modal.** The page is a document with a card per section;
  an edit affordance on the card is where a reader's hand already is. `packages/web`'s
  `BrandGuidelinesEditor` is a 665-line list editor with drag-reorder and an autofill sparkle; it
  is not ported. Reordering is not offered here at all — `priority` round-trips untouched.
- **The payload is built from a fresh read.** Before the PATCH the service re-fetches
  `GET /brands/:id`, merges the edited section into *that* list, and sends the result. SWR's
  cached copy may be minutes old, and sending it would delete a section added meanwhile in another
  tab. This narrows the window rather than closing it; a real close needs an `expected_version`
  the route does not have, and that is recorded as a limit rather than papered over.
- **`createdBy` round-trips.** Editing an agent-drafted section does not flip it to `user` — the
  field records who produced the section, which is what keeps "these five came from research"
  legible after the prose has been tidied. Same rule as the Vite editor.

### 3.2 TipTap, and why plain text was refused

The body is a ProseMirror document and **two apps write these rows**. A textarea-based editor
would round-trip our own view model perfectly and destroy every mark, link and heading the Vite
app's editor stored — a silent data loss on save, visible to nobody until somebody opened the
other app.

So `@tiptap/core`, `@tiptap/react` and `@tiptap/starter-kit` join `packages/web-next`, and
`src/editor/extensions.ts` mirrors `packages/web/src/editor/proseMirrorSchema.ts` — the same
`StarterKit` with the same heading levels, because a section body must mean the same thing in both
apps. `useEditor` runs with `immediatelyRender: false`, which is what a server-rendered editor
needs to avoid a hydration mismatch.

### 3.3 The three surfaces

1. **`SectionEditorSheet`** — label + body, save, delete. Opened from a section card, from the
   TL;DR band, and from the pillar band, so every band the page renders is editable from where it
   is read.
2. **Add a section** — chips for the `SUGGESTED_SECTIONS` labels the brand does not yet hold,
   plus a free-text label, because the taxonomy is a suggestion and never a constraint. A new row
   takes a `priority` after the current maximum and an empty document, which is the *labelled and
   empty* state the product already creates on purpose.
3. **`BrandIdentitySheet`** — name, description, website, over `PATCH /brands/:id`. Website goes
   through `normalizeWebsiteUrl`, as the create form does.

Errors run through `useSubmit`, which already reads both transports' error classes.

### 3.4 The footer's still-empty chips

They become buttons that open the editor on that section — the thing the current footer comment
says they will do "once `EditGuidelinesDialog` comes across". It does not come across; the sheet
does the job, and the promise is kept either way.

---

## 4. Tests

`web-next` tests logic and not screens, and that rule holds. What earns a test:

- `blocks.ts` — every node type, the nested list, the empty document.
- `map.ts` — date truncation, the completed-run-only rule, section kind, an empty brand.
- `nav.test.ts` — already asserts the declared/grouped invariant; Phase 1 is covered by it.
- The merge-before-save rule — a section list built from a *fresh* read, asserted against a stale
  cached one, because that is the bug this design exists to avoid.

`components/brand-profile.test.tsx` stays a thin smoke test and is repointed at a mocked profile.

---

## 5. What this plan does not do

- **No assets.** Colours, typefaces and the logo. §0.
- **No reordering, no drag handles, no autofill sparkle.** The autofill route exists
  (`POST /brands/:id/guidelines/autofill`) and is worth a later phase of its own.
- **No research controls.** The footer reads the last run's date; starting one stays in the create
  form.
- **No `/brands` list.** The plural is still deliberately unclaimed.
