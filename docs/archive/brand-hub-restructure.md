# Brand hub restructure — three zones, and a brand you can see

**Shipped:** 2026-07-28 · `packages/web` only · 436 → **456 tests**

## The report

> Our brand overview page, I want to re-think the structure/design/layout. I
> like app buttons, that's fine, but the top half feels weird/weak/unstructured.

Then, narrowing it:

> I just need/want to structure the page a bit more. I want to see the brand,
> its TLDR/intro at a glance, then quickly be able to take various actions (like
> brainstorming copywriting), but also quickly find related/relevant brand
> information (brand colours, logos, assets, images/photos etc etc etc)

Three questions, in that order. The page is now organised to answer them in that
order.

## What was actually wrong

Not taste — measurable structure. All five were verified against the code and
the supplied screenshot before anything was changed.

1. **No width constraint.** `brands.$brandId.tsx` was `flex-1 overflow-auto p-6`
   like every other route. At 2000px the `h1` sat at x≈28 and its `⋯` at x≈1950
   with nothing in between. The context card repeated the shape: one
   `Target audience` chip at the far left, `Edit` at the far right, a 130px band
   that was ~85% empty. **Content clustered at both extremes with a dead middle**
   is what "unstructured" was describing.
2. **The brand had no visual identity on its own page.** On the surface whose
   premise is *"the brand is the centre of gravity"* (`vision.md:11`), the brand
   was 24px of text.
3. **The most actionable fact was illegible.** 1 of 5 guideline sections,
   rendered as five 6px dots with no number.
4. **The four unwritten sections were invisible.** `SUGGESTED_SECTIONS` carries
   all five labels; the bar rendered only what existed, so an empty brand got an
   empty box.
5. **"Workspace" was a false heading** — the app header has a workspace pill two
   rows up, meaning something else.

## The load-bearing decision

**Each of the three questions gets a zone, and each fact lives in exactly one of
them — the one where you can act on it.**

```
who is this?      identity band   mark · name · TL;DR · ⋯
what can I do?    main column     the app tiles
what do we know?  right rail      brand context, on screen while you choose
```

Everything else follows. The rail is a *column* rather than a band because its
job is to be available while you choose, not to be read and scrolled past — the
record-detail shape (Linear, Attio, GitHub's *About* sidebar), not the
Facebook-profile shape the brief started from, because here the actions deserve
the wide column.

The corollary is the rule that kept the design from bloating: **no fact appears
twice.** `BrandIdentity` carries no counts, and has a test pinning that, because
the rail is *about* sections and each tile carries its own thread count. A stats
strip in the header would have restated both a scroll earlier, with nowhere to
click.

## What shipped

- **`BrandMark`** — the monogram. Initials from the name, hue from the **id**,
  so a rename does not recolour a mark you have learned to recognise. FNV-1a
  rather than a `charCodeAt` sum, because sibling brands in one workspace are
  exactly the colliding case. Initials split by **code point** (`"🌱 Sprout"[0]`
  is half a surrogate pair), two letters for a multi-word name and one for a
  single word — "BR" for "BrandFactory" reads as an abbreviation of nothing.
  Lightness and chroma are fixed in `index.css`, so a derived hue can never land
  outside the palette or below AA against its own fill; only the hue crosses the
  boundary, as a bare number on `--brand-hue`. It lives in CSS rather than in
  Tailwind utilities because light and dark are two rules over one inline
  variable, and an inline `style` cannot express a `.dark` variant.

  On the **accent budget** (§4): this is the one place colour was allowed in.
  The hue is not the *product's* accent — it is the *customer's brand*, which is
  the one thing on this page entitled to look like itself. One element per
  surface, and every other new pixel here is neutral.

- **`BrandIdentity`** — mark, name, description, `⋯`. An absent description is
  rendered as **an action, not a gap**: "Add a description" opens `RenameDialog`,
  which already owns the field (`initialDescription`), rather than growing an
  editor of its own.

- **`BrandContextRail`** — supersedes `BrandContextBar`, which is **deleted**
  rather than left dead. **Written sections and unwritten suggestions are one
  list.** The suggestions are not a get-started widget that vanishes once you
  begin; they are the same rows in an unwritten state, which is what lets the
  rail answer *what do we know* and *what is missing* in one glance. It is also
  why there is **no meter here**: five rows, two of them written, *is* the meter,
  and it is the version you can click.

  This stays inside the D2 decision recorded on `GuidelineMeter` — no
  percentage, no progress bar, no red/green, no "incomplete" copy. Zero sections
  is a legitimate brand state (`vision.md:28`) and the rail must not scold it,
  so a brand at zero reads `Rides along into every thread` rather than `0 of 5`.

  A written row is a **disclosure** (`aria-expanded`, body genuinely hidden) —
  deliberately unlike the 1.4.0 chip row, which used `aria-pressed` precisely
  because nothing there was ever hidden. An unwritten row opens the same dialog
  `Edit` does, where the quick-add chip for that label already exists; seeding
  the row from the rail would mean a second staging channel into the editor
  alongside `staged`, for one click saved.

- **The route** gains `mx-auto max-w-6xl` — the **first constrained width in the
  app**. It lives on this route rather than in the shell because widening the
  other surfaces is a change to pages this pass has no business touching.
  `Workspace` → `Apps`. Below `lg` the columns stack **apps first**: on a narrow
  screen the reason you opened the page should not be below the reference
  material.

## Verification

```
pnpm typecheck                          9/9 workspaces
pnpm lint / format:check                clean
pnpm test                               446 passed | 10 skipped (456)
pnpm --filter @brandfactory/web build   ok
```

436 → **456 (+20 net)**: +27 new (`BrandMark` 11, `BrandContextRail` 11,
`BrandIdentity` 5), −7 with the deleted `BrandContextBar` suite. Two behaviours
in the retired suite were carried across verbatim because they encode bugs that
were actually hit: the read panel's **explicit content sync** (a save returns the
same section id, so the key does not change and a seeded editor would keep
rendering the pre-edit body), and the `aria-controls` target existing in the DOM.

### The live pass — run, and it changed the code

Docker was down, so the real stack could not boot. A **throwaway Vite harness**
(deleted; not committed) rendered the three zones over four mock brands against
a memory-history router, screenshotted with Playwright at 1600px light, 1600px
dark and 900px. It caught three things reasoning had not:

1. **The tile grid wrapped 3 + 1.** `auto-fill minmax(220px,1fr)` fits three
   across the main column and dropped `Open canvas` onto a row of its own beside
   a tile-and-a-half of dead space. Now a fixed `sm:grid-cols-2` — a 2×2 block
   that also squares up against the rail instead of out-running it.
2. **Unwritten rows had no affordance at rest.** The `+` was `opacity-0` until
   hover, so an unwritten row looked like a written one with nothing to
   disclose — and on touch there is no hover at all. Now visible at `opacity-40`.
3. **Every monogram rendered the same green**, because the *harness* gave all
   four brands the same id. A harness bug, not a code bug — but it meant the
   central claim (the hue varies, and does not collide with the product accent)
   was unverified until the ids were varied. With real ids: green, blue, coral,
   periwinkle.

Both themes and both breakpoints were then re-shot and read.

## Caveats

- **Not seen against the real app.** The harness rendered the three zones, not
  the route — so the app-shell header above it, React Query loading and error
  states, and the `Other threads` catch-all were **not** in any screenshot. All
  three are covered by tests and unchanged in behaviour, but "unchanged in
  behaviour" is not "observed". Worth ten seconds of looking once Docker is up.
- **The stacked rail is wide.** Below `lg` the rail spans the container, so a
  row's trailing glyph sits far from its label. Judged acceptable — a trailing
  chevron at the row edge is the settings-list convention — but it is the same
  *class* of thing this pass set out to fix, and it was accepted rather than
  overlooked.
- **One hue lands near the error tint.** A coral monogram in dark mode reads
  faintly like a destructive surface. Seen and accepted: it is a large rounded
  tile with initials in it, and constraining the hue range to dodge one region
  costs more than it buys.
- **`docs/executing/brand-research-onboarding.md` Phase G** still owes a live
  browser pass, and 1.6.0's deferred check on brand-switcher pill rhythm and
  long-name truncation still rides with it. This pass did not discharge either.

**Not addressed:** brand assets — colours, logos, photos, files. It is a new
capability, not a layout change (see `docs/plans/brand-assets.md`), and no dead
"coming soon" box was shipped in its place on a page whose problem was already
two inert tiles.

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`, `packages/adapters/*`. No migration, no wire-contract change.
