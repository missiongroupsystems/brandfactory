# Brand Profile — the page, ahead of its data

The Brand Profile from [`docs/plans/brand-profiles.md`](../plans/brand-profiles.md), built in
`packages/web-next` and deliberately **not wired to the backend**. It is the brand's homepage for
a marketing team: TL;DR, pillars, overview, context sections, visual identity, in one scroll with
a contents rail. Selecting a brand in the sidebar switcher now lands here.

The reason it renders sample content is the instruction that produced it — refine the page first,
integrate second. Everything below is arranged so that integration is one function.

---

## 1. Where it lives, and why the Next app

The plan's §6 flipped its own recommendation once 1.32.0 and 1.33.0 landed: the Vite app was the
right home only while it was the only place brands existed. It is not, any more — the Next shell
signs in, resolves a workspace, and lists and creates real brands through `hc<AppType>`. Building
a substantial new document in "the Vite app it will replace" would have meant building it twice.

So the profile is the first BrandFactory **screen** in `packages/web-next`, as opposed to the
first BrandFactory *data* (1.33.0) or the first BrandFactory *control* (1.32.0).

### The routes, and the plural left free

| Route | What it is |
|---|---|
| `/brand` | The profile of the brand the shell is inside. The nav item points here. |
| `/brand/[id]` | One named brand's profile. Where the switcher navigates. |

**Singular, and `/brands` is deliberately unclaimed.** The Operations Hub's brand registry moved
to `/registry-brands` while this was being written, so the plural was free and this page could
have taken it. It does not, because the product will want both words: `/brands` is *the brands in
this workspace* — a list screen this shell has not built and certainly will — while `/brand` is
**the brand you are inside**, a shell-wide selection rather than a member of a collection. Taking
the plural now would mean moving the page the day that list arrives.

`packages/web` reaches a brand at `/brands/$brandId` because that app *has* the list. When the two
converge, the two paths can be the same page under two names.

**The route wins and the preference is the fallback**, which is the shape `active-brand.ts`
predicted for the first brand-scoped route: `/brand` reads the stored selection, `/brand/:id`
names one, and an id the workspace does not hold falls back to the active brand rather than to an
error — a stale link should land somewhere useful.

---

## 2. What is real and what is not

**The identity is real. Every word of content is a fixture.**

The name and the mark come from the brand the shell actually holds, so the page agrees with the
switcher that opened it. Landing on a page headed *Harbour Table* after picking *Acme* reads as a
broken integration rather than as a preview, which would have been the worse failure.

Everything else — sections, colours, typefaces, the research date — comes from one of three
samples. The identity band carries a `Sample content` badge and the footer says it in words,
because a page that looked finished is how somebody files a bug against a feature that was never
wired. The sidebar item carries a `Sample` tag for the same reason, using the mechanism that
already labels Quotations `Mock`.

### Three samples, not one, and the hash that picks them

`sampleProfileFor(brandId)` hashes the id through `brandHue`'s FNV-1a and takes the modulus.
**Not the first fixture for everybody**: a resolver that answered the same profile for every brand
would make the switcher look broken — pick another brand, watch the page not change, file a bug
against navigation. Hashing means switching brands visibly switches the page, and a given brand
keeps *its* sample across reloads.

The three exist because the states worth reviewing are not the full one:

| Sample | State | What it exercises |
|---|---|---|
| Harbour Table | Eight sections, all written, palette, typefaces, a research run | The full page |
| Kopi & Co | Half written, two sections agent-drafted, two labelled rows empty, no typefaces | The provenance chip, the "still empty" footer chips, a band that hides itself |
| Sprout | A TL;DR and two empty rows. No colours, no website, no research | The near-empty page — the normal starting state, and the one most easily designed badly |

---

## 3. The one seam

```
useBrandProfile(brandId?)   ->  BrandProfile
        │                          │
   fixtures.ts                every component takes this and nothing else
```

`features/brand-profile/hooks.ts` is the only file that knows where the data comes from. At
integration it becomes `useSWR([SCOPES.bfBrands, id], () => brandService.get(id))` plus a mapper,
and **no component moves**. That is the same seam the whole package shipped on in 1.31.0, where
one branch inside `apiFetch` carried fifteen screens.

### Why a view model rather than `BrandWithSections`

This package can import the real type from `@brandfactory/shared`, and does not use it for the
page. A guideline section's body is a **ProseMirror document**, and turning one into JSX is the
integration work this pass deliberately does not do. Authoring fixtures as ProseMirror would have
been thirty lines of `{ type: "doc", content: [...] }` per section to render three paragraphs.

So `types.ts` is already flattened: a body is a list of blocks, a TL;DR is a string, a date is a
business date (`YYYY-MM-DD`, so `formatDate` applies and no reader west of Greenwich sees
yesterday). Two rules are recorded there for the mapper, because they are invisible from the
component side:

1. A `list` block is a **real list** in the document, not a paragraph starting with a dash.
   `shared`'s `brandContentPillars()` already makes this call for the planner, and the pillar band
   depends on the same distinction.
2. `blocks: []` is a labelled row that says nothing — a real and common state, created on purpose
   by the suggestion chips, and not the same as the section being absent.

**The taxonomy stays in `shared`.** Which labels are known, which read across the brand, and where
each sits in the curated order are all answered by `canonical-sections.ts`, which this feature
*calls* — `sameSectionLabel`, `suggestedSectionIndex`, `TLDR_SECTION_LABEL`,
`OVERVIEW_SECTION_LABEL`, `CONTENT_PILLARS_SECTION_LABEL`. A second opinion about whether `TLDR`
is the `TL;DR` is exactly the drift that file exists to prevent.

---

## 4. Pillars are the values

Settled in the plan's §2 and implemented literally: **there is no ninth section.** The band reads
`Values & positioning`, the row the product already has.

`splitPillars()` is the whole idea. That section deliberately holds two shapes — a list of values
and a paragraph saying how the brand differs from the alternatives — so:

- **list items become cards**, and
- **paragraphs stay prose** beneath them.

A band that flattened both would promote "we sit between the hotel dining rooms and the seafood
joints" into a fourth pillar: a wrong statement rendered confidently. A brand that wrote its values
as one paragraph gets no cards and a normal prose section, which is also the nudge to press Return
three times — how `brandContentPillars()` already behaves for the planner.

Each card splits its name off a supporting clause at an em dash, so a strip reads as a strip
rather than as four sentences in boxes.

**`Values & positioning` therefore appears exactly once on the page.** `gridSections()` excludes
it along with the other three banded labels, and a test asserts that it never shows up twice.

`Content pillars` keeps its own quieter strip further down, headed **"What we post about"**. Now
that "pillars" means values in the product's language, two sections both called pillars was the
ambiguity to avoid; the stored label is untouched, so the planner's contract is untouched.

**Naming:** the band reads *Brand pillars* with a small `from Values & positioning` note beside it
— the plan's §2.3 option (a). Renaming the stored label would orphan every brand that already
wrote that section, because labels are free text and matching is deliberately literal. That
decision is still open and can be taken on its own merits.

---

## 5. The page, band by band

| Band | Source | Notes |
|---|---|---|
| Identity | brand row + fixture colours | Mark, name, host, updated, the fraction, a palette strip. One question: whose page is this. |
| TL;DR | `TL;DR` section | Largest type on the page, bordered, with a copy button and the line *"Rides into every generation as standing context."* |
| Brand pillars | `Values & positioning` | Cards from the list, prose beneath. |
| Overview | `Overview` section | Full measure prose, 68ch. |
| Context grid | everything else, written | Two-up, taxonomy order, custom labels last. |
| What we post about | `Content pillars` | Quiet chips. Renders nothing when absent. |
| Visual identity | colours + typefaces | Swatches copy their own hex. Renders nothing for a brand with neither. |
| Footer | derived | Muted dots, the fraction, the research date, the still-empty labels. |

Some decisions inside those that are not obvious from the markup:

- **The TL;DR earns the hero slot for what it is**, not for being first: it is the section written
  to ride into every generation, capped at ~400 characters for that reason. A marketer who knows
  that writes it carefully, so the page says it once.
- **The provenance chip is the point of the section card.** `created_by` has been on the row since
  1.9.0 and is shown nowhere in the product. It renders only for `agent` — "written by a person"
  is the unremarkable case and does not deserve a badge on five cards out of six.
- **The clamp expands; it never truncates permanently.** A voice section cut off mid-rule is worse
  than no voice section, because the reader believes they have read it. The fold is counted
  ("2 more") and reversible, and copy always takes the whole thing.
- **The footer is soft, following `GuidelineMeter`**: muted dots, no percentage, no red. A
  half-written brand is a normal brand. `0 of 0` is never rendered as a fraction — it reads "No
  brand context yet", `brandContextState`'s rule.
- **Empty states name the job rather than reporting the absence.** An empty TL;DR says *"Write the
  one paragraph every agent reads"*; empty pillars say *"Name what this brand stands on"*.
- **Copy is a first-class action and it genuinely works.** `profileToMarkdown` serialises the
  whole brand; the TL;DR, each section and each hex copy individually. Empty sections are omitted
  rather than pasted as bare headings.

### The contents rail

Sticky, `lg` and up, with `IntersectionObserver` scroll-spy over the band headings. The
`rootMargin` narrows the root to a band across the top of the viewport, so "active" means *at the
top of the screen* rather than *anywhere on screen*, which would light three entries at once on a
tall display.

The observer is built inside the effect and state is written **from its callback**, never from the
effect body — `react-hooks/set-state-in-effect` is a real gate here and has broken this build
before.

Every heading is a real `<h2>` with an `id`, so sections are linkable (`/brand#voice-tone`) and a
screen-reader user can walk the page by structure. `CardTitle` in this kit renders a `div`, which
is why the bands do not use it.

`sectionAnchor()` slugifies rather than reusing `normaliseSectionLabel`, which strips spaces along
with punctuation: every label would collapse to one unreadable word, and two labels differing only
in punctuation would collide into one duplicate `id`. It keeps `\p{L}\p{N}` for the reason
`canonical-sections.ts` gives at length — an ASCII class does not keep letters, it keeps English —
and falls back to the row id when a label has nothing sluggable in it.

---

## 6. The shell changes

Three files outside the feature.

- **`brand-switcher.tsx`** — picking a brand now writes the preference **and then** navigates to
  `/brand/<id>`. The write happens first and not instead: the destination reads the route's id,
  but every other surface reads the preference, and a header disagreeing with the page under it
  would be worse than not navigating at all.
- **`nav.ts`** — `Brand profile` is the first nav item, above Dashboard, tagged `Sample`. It is
  the way *back* to the page: a radio group reports changes, so re-selecting the brand you are
  already in does nothing, and without a nav item the profile would be reachable only by switching
  away and back.
- **`nav.ts` + `app-sidebar.tsx`** — `isActivePath(pathname, href)` replaces
  `pathname.startsWith(item.href)`. `"/brands".startsWith("/brand")` is true, so the plain prefix
  would light *Brand profile* on the `/brands` list this shell has left room for. The boundary
  check asks the question the nav is actually asking: is the current page this item, or something
  *inside* it. A detail route still lights its list.

Plus `lib/website-url.ts` gained `displayHost`, ported from the Vite app's file — the package
already had that file's other half.

---

## 7. Files

```
src/features/brand-profile/
  types.ts                     the view model, and the two rules the mapper must honour
  fixtures.ts                  three sample brands — the whole data layer
  hooks.ts                     useBrandProfile — the one seam
  profile.ts                   the rules: findSection, isWritten, sectionAnchor,
                               splitPillars, gridSections, completeness, profileToMarkdown
  profile.test.ts              22 tests over those rules
  components/
    brand-profile.tsx          the composition, and the argument for bands over equal cards
    brand-profile.test.tsx     6 smoke tests — see §8
    profile-identity.tsx       mark, name, host, fraction, palette strip
    tldr-band.tsx              the hero
    pillars-band.tsx           the cards + prose, and the quieter content-pillar strip
    section-card.tsx           one context section: provenance chip, clamp, copy
    visual-identity-band.tsx   swatches that copy their own value, typefaces
    profile-footer.tsx         completeness, research, still-empty chips
    profile-contents.tsx       the sticky rail and the scroll-spy
    section-heading.tsx        a real h2 with an id
    rich-text.tsx              blocks -> JSX
    copy-button.tsx            clipboard + toast

src/app/(app)/brand/page.tsx           the active brand
src/app/(app)/brand/[id]/page.tsx      one named brand
src/components/layout/nav.test.ts      isActivePath, and the nav's shape
```

About 1,970 lines including tests and comments.

---

## 8. Verification, and what could not be verified

```
pnpm typecheck                         clean (11 packages)
pnpm lint / format:check               clean (whole repo)
pnpm test                              2071 passed | 78 skipped (169 files)
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next lint    clean
pnpm -F @brandfactory/web-next build   clean — /brand static, /brand/[id] dynamic
```

**There was no browser pass, and the reason is worth recording.** The shell sits behind sign-in,
and the only door on that page is a *Dev token* field. Pasting a token into a credential field is
not something I will do, so the authenticated page was never rendered in a browser by this work.
`next build` proves the route compiles and prerenders, but the profile subtree is behind
`AuthBoundary` and that render never reaches it.

`components/brand-profile.test.tsx` exists to close as much of that gap as a test can: it mounts
the real screen against a mocked `useActiveBrand` and asserts the five things a person checks in
the first five seconds — it renders, the bands are in reading order, the pillar cards come from
the list while the positioning paragraph stays prose, the values section is not repeated in the
grid, and the two fractions agree. It is **not** the start of a screen-test habit; this package
tests logic and not screens, and that rule stands.

`test-setup.ts` gained an `IntersectionObserver` stub beside the existing `ResizeObserver` one —
jsdom implements neither, and an observer that never reports is the least surprising answer: the
rail renders every entry and highlights none, which is its own honest "not scrolled anywhere yet"
state.

**To look at it:** `pnpm -F @brandfactory/web-next build && … start`, then sign in and pick a
brand. `next dev` still does not hydrate (open since 1.31.0), so a dev server shows skeletons
forever and is not evidence of anything.

---

## 9. What is deliberately absent

- **No editing.** No `Edit` button anywhere, because there is nothing behind it yet — a control
  that opens nothing is worse than its absence. `EditGuidelinesDialog` comes across from the Vite
  app in a later phase; the footer says so on screen.
- **No ProseMirror renderer.** `rich-text.tsx` renders the flattened view model. The real one has
  to handle marks, links and nested lists, and it arrives with the mapper.
- **No density toggle, no print stylesheet.** Both are in the plan (P2) and both are cheap; they
  were left out so the layout could be reviewed before it grew modes.
- **No assets from the API.** Colours and typefaces are fixture strings. The real ones are
  `BrandAsset` rows with `kind`, `role`, `library` and `status`, and the mapper reads them.
- **No changelog entry.** This is not a release — it is a page put up for review before its data
  exists. It earns a version when it is wired.

---

## 10. Next

1. Review the page and settle the open questions in the plan's §9 — chiefly the pillar naming
   (§2.3) and whether a read-only share link is in scope.
2. `brandService.get(id)` over `GET /brands/:id`, which already answers `BrandWithSections`.
3. The mapper: `BrandWithSections` + `BrandAsset[]` → `BrandProfile`, honouring the two rules in
   `types.ts`. This is the only new code that has to learn ProseMirror.
4. Delete `fixtures.ts` and the `Sample content` badge in the same commit that lands the mapper —
   not before, and not after.
