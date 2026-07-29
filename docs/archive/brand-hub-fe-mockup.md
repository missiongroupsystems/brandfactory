# Brand hub, front-end first — completion notes

**Pass:** P0–P5 of [`docs/executing/brand-hub-fe-mockup.md`](../executing/brand-hub-fe-mockup.md).
**Date:** 2026-07-29. **Scope:** `packages/web` only.
**Tests:** 456 → **527 (+71)**, no existing test edited.
**A live browser pass was run** — 34 screenshots, Playwright over `vite dev`,
all 13 scenarios × light/dark at 1600×900 plus a 900px narrow pass. It changed
the code twice.

The plan's decision record — what the screenshots settled, and the findings to
fold back into `brand-assets.md` — is appended to the plan itself rather than
duplicated here. This file is the *how*.

---

## What was built

Two proposals — `brand-assets.md` (unlocked) and `brand-research-onboarding.md`
(locked) — rendered as one clickable brand hub over fixtures, so the decisions
they collide on are settled by looking rather than by argument.

```
routes/brands.$brandId.tsx      queries + mutations + dialogs  ─┐
                                                                ├─→  <BrandHubView …props />
routes/demo.brand.tsx           fixtures + scenario picker     ─┘
routes/demo.brand.assets.tsx    fixtures                        ──→  <AssetLibraryView …props />
```

**New (11 files):** `components/brand/BrandHubView.tsx`, `ColorSwatches.tsx`,
`ResearchReviewSheet.tsx`, `AssetLibraryView.tsx` (+ 4 test files) ·
`routes/demo.brand.tsx`, `routes/demo.brand.assets.tsx` · `src/demo/`
(`assetTypes.ts`, `researchTypes.ts`, `fixtures.ts`, `demoParams.ts`,
`DemoBar.tsx`, `DemoNewBrandDialog.tsx`, 5 SVGs, 2 test files).

**Modified (7):** `routes/brands.$brandId.tsx` (223 lines → data half only) ·
`BrandIdentity.tsx`, `BrandMark.tsx`, `BrandContextRail.tsx`, `MiniAppTile.tsx`
(one optional prop each, absent on the real route) · `router.tsx` (the DEV gate)
· `ProjectCard.tsx` (a live-pass finding — see *Beyond the plan*).

**Untouched:** `packages/shared`, `db`, `server`, `agent`, `adapters/*`,
`miniApps.ts`, `workspaces.$wsId.index.tsx`, `editor/proseMirrorSchema.ts`. No
migration, no route, no vendor call, no new repo dependency.

---

## The invariant, and how it is held

> **The real route can only pass `null` / empty for every prop this pass adds,
> and every new affordance renders nothing when its prop is absent.**

`BrandHubView` is *shared* with `/brands/$brandId`, so "it's only the demo route"
is not what protects the shipped hub — this is. It is written at the top of
`BrandHubView.tsx`, restated on each prop, and it has tests of its own rather
than being an observation:

- `BrandHubView.test.tsx` — with no optional props: no website link, no palette
  block, no research row.
- `BrandContextRail.test.tsx` — no `colors` → no palette block; no
  `onStartResearch` → no research row *even when a job is passed*, because a rail
  that offers to research a brand against a backend with no research route is a
  dead affordance.
- `BrandIdentity.test.tsx` — no `websiteUrl`, no `colors` → nothing extra.

The research row is gated on the **callback**, not the job, for that reason. The
rail variant defaults to `C` because **C is 1.7.0** — the only one of the three
arrangements that is also the shipped layout, so a caller that passes no variant
gets today's page. `B` reflows the identity band; defaulting to it would have
moved the real hub's mark in the largest phase and nobody would have noticed
until the live pass.

---

## Four things the plan did not specify, and what was decided

### 1. The DEV gate does not work on its own — `/* @__PURE__ */` is load-bearing

The plan says the demo routes are gated on `import.meta.env.DEV` so Vite
tree-shakes them out. **It does not, and this was measured rather than assumed.**
The first production build of this pass shipped `/demo/brand`, `/demo/brand/assets`
and every fixture string into `dist`:

```
$ grep -o "demo[A-Za-z/-]*" dist/assets/*.js | sort | uniq -c
   2 demo/brand          2 demo/brand/assets      2 demo-brand-website
   2 demo/logo-mark      2 demo-new-brand-form    …
```

Two causes, both the same shape — Rolldown treats a top-level call to an imported
function as potentially side-effecting, so the module survives even when nothing
references its exports:

- `export const demoBrandRoute = createRoute({…})` → annotated
  `/* @__PURE__ */`, which is what lets the route object be dropped and its whole
  component subtree with it.
- `const VOICE = section(…)`, `const PALETTE_FULL = [color(…), …]` at module
  scope in `fixtures.ts` → moved inside `sectionFixtures()` / `assetFixtures()` /
  `draftFixtures()` / `threadFixtures()`, called from `buildScenarios`. Inside a
  function the calls are unreachable until someone calls it.

After both: **zero occurrences of `demo` or any fixture string in the built
assets**, and the bundle is 25 kB smaller than the first attempt. The reason is
written into both files so the next edit does not quietly undo it, and the grep
is the check that keeps it honest.

### 2. `MiniAppTile` needed a destination prop, not just a tile-list prop

P4 says the demo passes "a copy with `Visual identity` enabled and pointed at
`/demo/brand/assets`" and that `MiniAppTile` is "given nothing". Half of that is
not achievable: the tile's destination was a constant *inside* the component
(`to="/brands/$brandId/apps/$appId"`), so overriding the registry without
overriding the href points the demo tile at the real mini-app page.

`MiniAppTile` therefore takes an optional `href`, absent on every real call site
— the same absent-by-default shape as every other prop this pass added. It
renders a plain `<a>` rather than a `<Link>`, which follows from decision 3.

### 3. The demo routes are in the router's *runtime* tree but not its *type*

`rootRoute.addChildren([...appRoutes, ...(DEV ? demoRoutes : [])])` widens the
tree's type, which is what every `<Link to="…">` in the app is checked against. A
cast pins the type to `appRoutes` alone.

That is not a workaround — it is the better end state. A dev-only path should not
become a typed destination product code can reach for, and the cast makes that a
compiler fact. The demo navigates with plain `<a href>` and carries its state in
the query string (`?scenario=rich&rail=A`), which also gives the live pass a deep
link per screenshot.

### 4. The create dialog is a copy, not an extraction

The plan's scope lists `Website (optional)` + the research checkbox. The shipped
`NewBrandDialog` posts `CreateBrandInput`, and `website_url` is not on that
schema — putting the field there means a `shared` change and a migration, which
is the first line of the non-goals. So `src/demo/DemoNewBrandDialog.tsx` is a
copy and `workspaces.$wsId.index.tsx` is untouched. What is under review is the
**hard gate** (research decision 4): the checkbox is disabled *with its reason
rendered beside it*, not silently dead.

---

## Smaller decisions, recorded so they read as decisions

- **`ResearchReviewSheet` is a `Dialog`.** `components/ui` has no sheet
  primitive, and adding one for a surface that may not survive review would be
  the mockup deciding something it was built to ask about. The name is the locked
  document's.
- **`ResearchDraft` carries `{ html, text }`** — the same pair `CapturePayload`
  defines. The sheet shows the text, the staging channel carries the HTML, so no
  `dangerouslySetInnerHTML` exists anywhere and only the editor's own schema ever
  parses it. Sources ride *inside* the HTML as links, because a citation that
  arrives as bare text stops being a citation on the first save.
- **`staged` stays a single `CapturePayload`.** *Accept selected* stages the
  first chosen draft and toasts that it did. Widening it to a list is a
  behavioural change in 1.5.0 code whose StrictMode double-insert bug is on
  record; it belongs to research Phase E, where its test belongs.
- **The rail's in-flight spinner is a neutral `Loader2`, not §12.8's accent arc.**
  `BrandContextRail`'s own doc comment says the rail stays neutral throughout and
  that the only colour on the page is the brand's monogram. The failed state
  spends exactly one 14px amber glyph.
- **`proposed` is signalled by geometry, never by colour.** Colour is the content
  in a swatch row, so tinting one to mean "unsettled" is unreadable. An active
  colour fills its box; a proposed one is a smaller chip inside a dashed outline
  of the same footprint. Same register as the rail's unwritten rows — quiet and
  dashed, never red.
- **No `Edit` on the palette block**, though the ASCII sketch has one. There is
  no palette editor in this pass, and an `Edit` that does nothing is exactly the
  dead affordance 1.7.0 spent a pass removing.
- **State resets by remount, not by effect.** The repo's lint config forbids
  `setState` in an effect (`react-hooks/set-state-in-effect`). So `BrandMark`
  keys its `<img>` on the src, the review sheet's tick state lives inside
  `DialogContent` (which unmounts when closed), and the demo route keys its hub
  on the scenario id. All three are the honest expression anyway: the state is
  derived from the thing it is keyed on.
- **The demo route has no auth gate.** The premise of the pass is that it runs
  with no backend, and a login redirect would make the fixtures unreachable
  without one. Signed in, the shell's workspace and brand switchers appear as
  usual; signed out, they return `null`. Noted as a limit below.

---

## Beyond the plan: one shipped-component fix

**`ProjectCard`'s name column collapsed and wrapped one word per line**, in every
one of the first 34 screenshots. It has shipped that way since 0.9.0 and it is on
the hub's `Other threads` grid and on workspace home:

```
before                          after
┌──────────────────────┐        ┌──────────────────────┐
│ Openi… [Standardized]│  ⋯     │ Opening-week press…  │  ⋯
│ week                 │        │ [Standardized] 2 wee…│
│ press                │        └──────────────────────┘
│ note                 │
└──────────────────────┘
```

The name was a shrink-to-fit flex item beside a `shrink-0` badge in a ~235px
card, leaving it a ~60px column. **`truncate` alone does not fix it** — it turns
four bad lines into one unreadable one, because the width was never the name's to
begin with. The badge moved down to the meta row, where the other secondary facts
already are.

This is outside the plan's scope and is flagged rather than buried: it is a
visible change to a shipped component, made because the live pass found it and
because leaving it would have put an obviously broken card in every screenshot
the mockup exists to have reviewed. `ProjectCard`'s four tests assert text and
role, not class names, and passed untouched. Reverting is one commit.

---

## Verification

```
pnpm typecheck                          9/9 workspaces
pnpm lint / format:check                clean
pnpm test                               517 passed | 10 skipped (527)
pnpm --filter @brandfactory/web build   ok
grep -c "demo\|Casa Vostra" dist/…js    0        ← the DEV gate, checked
```

**456 → 527 (+71). No existing test was edited or deleted** — which is P0's
acceptance criterion, and the evidence that extracting `BrandHubView` was a move
rather than a rewrite. The 10 skips are the live-Postgres suites (no Docker
daemon); this pass touches no `db` or `server` code.

New coverage: `BrandHubView` 6 · `BrandContextRail` +10 · `BrandMark` +5 ·
`BrandIdentity` +5 · `ColorSwatches` 7 · `ResearchReviewSheet` 6 ·
`AssetLibraryView` 8 · `fixtures` 20 · `demoParams` 4.

`fixtures.test.ts` is not a test of pixels. The fixtures are typed against the
proposed `BrandAsset` union, so a brand state they cannot express is a schema
finding — and asserting the states is what stops that check from being "it
compiled".

### The live pass

Playwright driving `vite dev`, so the app shell, the wordmark, the theme toggle,
the real router and the real `index.css` are in every shot — the list 1.7.0's
throwaway harness could not produce. **No console errors and no page errors
across the whole run.** Playwright was installed in a scratch directory outside
the repo; `package.json` and `pnpm-lock.yaml` are unchanged.

It changed the code twice: the `ProjectCard` fix above, and the `/* @__PURE__ */`
work after the build grep failed.

---

## Limits, stated plainly

- **The brand switcher is still not in a screenshot.** The demo route has no auth
  gate, and `BrandSwitcher` / `WorkspaceSwitcher` return `null` without a token —
  so the shots have the wordmark, the breadcrumb slot and the theme toggle, but
  not the two pills. The plan claimed the switcher would be in every shot; it is
  not, and signing in would mean pointing the header's queries at a live API
  while the page below runs on fixtures. **1.6.0's switcher check is therefore
  still owed.** The `long-names` fixture discharges the *identity band* and
  *rail-row* halves of it, which is what it was built for.
- **The narrow rail is observed, not fixed.** At 900px a section row is ~830px
  wide with its chevron at the far right. 1.7.0 logged it, this pass added two
  more rows to that column, and neither has addressed it.
- **No `prefers-reduced-motion` pass and no keyboard walk.** Both themes were
  shot; neither reduced motion nor focus order was.
- **The proposed swatch chips are small** — a 14px fill in a 28px dashed box.
  Legible as *different*, arguably too quiet as *a colour*. Worth an opinion
  before structure A or B is chosen.
- **The mockup is built, not reviewed.** Two of the three rail structures are
  meant to be deleted and the deletion is the deliverable. `/demo/brand`,
  `/demo/brand/assets` and `src/demo/` are all deleted in the pass that lands the
  real types; the *findings* are what outlive them, which is why they are written
  into the plan's decisions section rather than only into these files.

## Where to look first

```
pnpm --filter @brandfactory/web dev
open http://localhost:5173/demo/brand?scenario=rich&rail=A
```

Then switch `rail` between `A`, `B` and `C` on the `rich` scenario. That is the
one comparison this whole pass exists to make.
