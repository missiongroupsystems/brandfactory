# Phase 2 — the Brand Profile reads the brand

`docs/completions/brand-profile-next.md` §10 listed four steps and this is all four. The page was
built against three fixtures with one declared seam; the seam held. **Wiring it replaced one file
and added three, and no component moved.**

---

## 1. The seam, as promised

```
useBrandProfile(brandId)  ->  BrandProfile
        │                        │
   api.ts + map.ts          every component takes this and nothing else
```

`hooks.ts` was the only file that knew where the data came from. Its body — `sampleProfileFor`, a
hash over three samples — is now two `useSWR` calls and `toBrandProfile`. Its signature, its two
documented rules and its return type survived unchanged, which is the whole claim `types.ts` made
when it wrote the view model down before the data existed.

`fixtures.ts` and `sampleProfileFor` are deleted, in this commit and not a later one — §10's
fourth step, which says *not before, and not after*.

---

## 2. Three requests were considered and two were made

| Route | Answers | Used |
|---|---|---|
| `GET /brands/:id` | `BrandWithSections` | yes — the row and every section |
| `GET /brands/:id/research` | `{enabled, maxMinutes, job}` | yes — one line in the footer |
| `GET /brands/:id/assets` | `BrandAsset[]` | **no** — see §5 |

Both live in `features/brand-profile/api.ts`, which is the only file in the feature that names a
route. Paths go through `bf` (`hc<AppType>`), so a renamed segment on the server is a type error
here rather than a 404 in a browser.

**The research read is separate and is allowed to be late.** It is a different aggregate on the
server, and its error is deliberately dropped rather than returned from the hook: a deployment
with no research provider is a normal deployment, and one footer line about a past run is not
worth an error page over a brand that loaded perfectly.

---

## 3. `blocks.ts` — the one piece of new logic

The mapper's hard half is turning a stored ProseMirror body into `ProfileBlock[]`, and
**`shared`'s `proseMirrorDocToPlainText` cannot do it.** That function flattens every block type
to a string and joins with blank lines, so four bullets and four paragraphs come out identical —
and `types.ts`'s rule 1 is precisely the distinction it discards:

> A `list` block is a real list in the document. It is *not* a paragraph that happens to start
> with a dash.

The pillar band depends on it: list items become cards, paragraphs stay prose. A flattener that
could not tell them apart would promote *"we sit between the hotel dining rooms and the seafood
joints"* into a fourth pillar — a wrong statement rendered confidently, which is the failure the
plan's §2.1 exists to prevent.

So `docToBlocks` is its own walk, with ten tests:

- Headings, blockquotes and code blocks flatten to prose. The view model has no headings, and the
  words are truer than the weight.
- **A nested list flattens into the enclosing one**, parent item first. One flat list is lossy
  about shape; dropping the nested items would be lossy about content, which is worse.
- An empty document maps to `[]` — rule 2's *labelled and says nothing*, which is what `isWritten`
  reads and what the footer counts. A blank paragraph block would make an empty section read as
  written, in the fraction and in the still-empty chips.
- A `hardBreak` becomes a space, so two sentences do not run together in a `<p>`.
- **Marks are dropped, and nothing is lost by it** — see §4.
- It survives anything: `ProseMirrorDoc` is `JsonValue` at the wire, so a body that is not a
  document answers `[]` rather than throwing.

It stays in the feature rather than moving to `shared`, for the reason `prose-mirror.ts` gives for
having moved *out* of `agent`: it moved when it stopped having one consumer. Promote it when a
second appears.

---

## 4. Lossy without losing anything

The flattening drops marks, links and heading levels. That would be a data risk if the editor
worked on blocks — and it does not. `BrandProfileState` now carries `source`, the
`BrandWithSections` the profile was mapped from, and Phase 3's sheet edits *that*. The view model
is the read side; the stored document is the write side; they come from the same request.

This is recorded in `types.ts` rather than only here, because it is the property that makes the
whole flattening safe and it is invisible from either end alone.

---

## 5. What the mapper does not do, and why

**Assets are not read.** Colours and typefaces map to `[]`, so `VisualIdentityBand` renders
nothing and the identity band's palette strip hides itself. Both already behaved that way for a
brand that genuinely has neither, which is why nothing branches on it and why the page loses two
bands rather than gaining two empty states.

This was asked for directly and is one request plus one filter to reverse. It is stated on the
fields in `types.ts` so the next reader does not go looking for a bug.

Three rules the mapper *does* apply, each stated where it is applied:

1. **An instant becomes the day the server named**, by truncation and never by parsing.
   `new Date("2026-08-17T02:00:00Z")` is the 16th for every reader west of Greenwich, so a section
   edited early would be dated yesterday in New York. Same rule as `lib/format.ts`'s `formatDate`,
   and the reason `types.ts` specified a business date in the first place.
2. **A research date belongs to a run that finished**, and two statuses mean that: `COMPLETED`,
   and `NO_FINDINGS` — ours rather than the vendor's, *a success that found nothing*. The status
   is tested as well as the timestamp, so a stray `completedAt` on a `FAILED` row can never print
   *"Research ran 12 August"* under a brand whose research produced nothing.
3. **The taxonomy is not re-decided.** `kind` comes from `shared`'s `sectionKindForLabel`, the
   same function the planner and the rail ask. A second opinion about whether `TLDR` is the
   `TL;DR` is the drift `canonical-sections.ts` exists to prevent.

---

## 6. What the page stops claiming, and one thing it starts saying

- **The `Sample content` badge is gone**, and the footer's *"This page renders sample content"*
  note with it. Both were honesty machinery for a page with no data; leaving either over real data
  would be the same bug pointed the other way.
- **The `brandName` prop is gone.** It existed because the identity was real and the content was
  not, so the page would agree with the switcher that opened it. Both halves are real now, and a
  second source for one field is a second answer waiting to disagree.
- **`brands.description` is rendered**, under the name, **only when the TL;DR is unwritten.** That
  is `brandDescriptionLine`'s precedence read from the other end: the TL;DR wins, and the
  description is the older, weaker copy of the same sentence. The TL;DR has the hero band directly
  below, so printing both would say the brand twice.

---

## 7. Two cache scopes, and why the list is invalidated too

`SCOPES` gains `bfBrand` (`[brand, brandId]`) and `bfResearch`. The brand is its own scope beside
the workspace list's, the same split every Operations Hub area makes — the row in the switcher and
the document on the profile are two cache entries holding one truth.

That matters at Phase 3's writes: `BrandSummary` carries `sectionCount` and the flattened `tldr`,
so writing a section changes a row in the switcher. Both scopes are invalidated on every write.

**The id is resolved before anything is fetched**, which is a change of behaviour worth naming.
Firing at the route's id immediately would request a brand this workspace may not hold, so a stale
`/brand/:id` link would show the server's 404 for a moment and then correct itself to the right
page. The list is almost always already in the cache — the sidebar's switcher reads the same key —
so the common case waits for nothing.

---

## 8. Files

```
src/features/brand-profile/
  api.ts            NEW  the three routes, one of them unused; the GuidelineWrite type
  blocks.ts         NEW  ProseMirror -> ProfileBlock[], the one new walk
  blocks.test.ts    NEW  10 tests
  map.ts            NEW  BrandWithSections + job -> BrandProfile
  map.test.ts       NEW  9 tests
  hooks.ts          rewritten around SWR; signature and rules unchanged
  types.ts          + description; the notes on the two empty fields and on the write side
  fixtures.ts       DELETED
  components/brand-profile.tsx        brandName dropped, doc comment retold
  components/profile-identity.tsx     badge dropped, description line added
  components/profile-footer.tsx       the sample note dropped
  components/brand-profile.test.tsx   repointed at a mapped server response
src/lib/api/cache.ts   two scopes
```

---

## 9. Verification

`pnpm vitest run --project @brandfactory/web-next src/features/brand-profile` — 46 tests before
Phase 3 added its own. The screen's smoke test now builds a `BrandWithSections` and puts it
through the **real mapper**, so it exercises `docToBlocks` and `toBrandProfile` on the way to the
page rather than asserting the layout against a hand-authored shape the API cannot produce.

The full gate is in `docs/changelog.md`.
