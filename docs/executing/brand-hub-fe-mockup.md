# Brand hub, front-end first — one reviewable mockup of two proposals

**Status:** proposal, 2026-07-29. A **front-end-only** pass that merges
[`brand-assets.md`](brand-assets.md) (proposal, unlocked) and
[`brand-research-onboarding.md`](../executing/brand-research-onboarding.md)
(locked 2026-07-28) into a single clickable brand hub running on **mock data**.

No migration. No server route. No vendor call. No `shared`, `db`, `server`,
`agent` or `adapters/*` change. The deliverable is a surface you can open, click
through, and reject — after which the two backend plans are re-cut against what
survived review.

## Why the front end goes first

Together the two proposals are two migrations, a new table, a fifth adapter, a
paid third-party vendor, a background job with a ticker, and roughly six new
routes. **Neither has ever been seen.** The assets proposal has no UI at all;
the research proposal's UI is four ASCII sketches in a locked document.

Building the surface first inverts the risk in three ways:

1. **The fixtures are the schema proposal, executed.** If a mock brand cannot
   express "two proposed primaries and nothing else", or "a logo that lives in
   Dropbox and fails to load", then `brand_assets` is wrong — and finding that
   out costs a fixture edit rather than a migration and a rollback note.
2. **The expensive decisions are UI decisions wearing schema clothes.** Assets
   question 3 (does the *Visual guidelines* text section survive alongside a
   colour swatch list?) and question 2 (where do assets render?) cannot be
   settled by argument. They are settled by putting both on screen and looking.
3. **Research's Phase G is already a debt.** It inherits 1.6.0's unverified
   switcher and 1.7.0's two logged rail caveats. Doing the pixels first means
   that pass arrives with the layout already agreed instead of discovering it
   after two migrations have shipped.

The cost is honest and small: some of this UI gets built twice, because a
component wired to fixtures still has to be wired to queries later. The seam in
the load-bearing decision below is what keeps that to *wiring* rather than
rework.

## The load-bearing decision

**Split `BrandHubPage` into a data route and a pure view, and the mockup is the
same view with different props. It is not a harness.**

1.7.0's live pass ran against a throwaway Vite harness, and its own caveat says
what that cost:

> **Not seen against the real app.** The harness rendered the three zones, not
> the route — so the app-shell header above it, React Query loading and error
> states, and the `Other threads` catch-all were **not** in any screenshot.
> — `docs/completions/brand-hub-restructure.md:156`

Building a second harness would buy a second identical caveat. Instead:

```
routes/brands.$brandId.tsx      queries + dialog state  ─┐
                                                         ├─→  <BrandHubView …props />
routes/demo.brand.tsx           fixtures + scenario picker ┘
```

`BrandHubView` takes brand, threads, assets, research state and every callback as
props. The real route feeds it React Query; `/demo/brand` feeds it a fixture and
a scenario `<select>`. Both render **inside the real router, the real app shell,
the real `index.css`, and the real theme toggle** — so the header above the page,
the breadcrumb, the brand switcher and dark mode are all in every screenshot,
which is exactly the list 1.7.0 could not show.

**This follows a precedent already in the repo rather than inventing one.**
`BrandContextRailProps` is `{ brand, onEdit, className }` — no queries, no
mutations — and its 11 tests render it from props alone. The route already owns
`editOpen` / `renameOpen` / `deleteOpen` and passes handlers down. The seam being
proposed is the one the rail already sits behind, moved up one level.

**The seam outlives the mockup.** When `/demo/brand` is deleted, `BrandHubView`
stays: it is what makes the hub testable without mounting a QueryClient, and it
is the reason the backend passes can ship their UI against fixtures too.

### What keeps the real hub unchanged, stated as an invariant

The demo lives at its own URL, but `BrandHubView` is **shared**, so every new
affordance in P1–P4 lands in a component `/brands/$brandId` mounts. "It's only
the demo route" is therefore not what protects the real hub. This is:

> **The real route can only pass `null` / empty for every prop this pass adds,
> and every new affordance renders nothing when its prop is absent.**

It holds by construction today — `Brand` has no `website_url`, there is no
assets query, and there is no research query, so there is nothing for the route
to pass even if it wanted to. But it holds by accident unless it is written
down, and it stops holding the moment the backend passes land those queries.
So it is an **acceptance criterion on every phase from P1 on**, not an
observation: a phase whose prop cannot be absent is a phase that has changed the
real hub.

The corollary is what `bare` is really for. It is described below as the
regression baseline, and the baseline it guards is not "the demo looked fine
before" — it is that `bare` and the real route render the **same tree**. If they
diverge, the invariant has already broken and the screenshot is the place it
shows up.

## What merging the two proposals reveals

This is the argument for one document rather than two mockups. Reviewed
separately, each proposal looks fine. Put on one page, they collide three times —
and every collision lands on the rail, which is the surface 1.7.0 spent a whole
pass making coherent.

### 1. Both proposals want the rail footer, and neither can have it alone

The footer today is a `border-t` block holding one full-width ghost button,
`Talk it through` (`BrandContextRail.tsx:184-191`).

Research claims it explicitly, and argues the claim well — its decision 1 says
the footer's stated meaning is *"the ways of finding out more"*, so research
joins talking as the second one. That reading is sound and this pass does not
reopen it.

Assets has no such home. A colour swatch block is **not** a way of finding out
more — it is a fact the brand already knows, which by 1.7.0's own logic belongs
in the section list. But the section list has a stated, load-bearing meaning:
written sections and unwritten suggestions, one list, *which is the meter*. A
swatch row is neither, and dropping one in breaks the single rule the rail
promises.

So the rail has three candidate structures, and **the mockup exists to choose
between them**:

```
A. swatches as a rail block          B. swatches under the mark          C. assets leave the rail
┌─ Brand context ─────────┐          ┌────┐ Casa Vostra                  ┌─ Brand context ─────────┐
│ 2 of 5 suggested  [Edit]│          │ CV │ Neighbourhood trattoria…     │ 2 of 5 suggested  [Edit]│
│ ✓ Target audience     ⌄ │          └────┘ ●●●● ○○  ← palette here      │ ✓ Target audience     ⌄ │
│ ✓ Voice & tone        ⌄ │                                              │ ✓ Voice & tone        ⌄ │
│   Values & positioning+ │          ┌─ Brand context ─────────┐         │   Values & positioning+ │
│   Visual guidelines   + │          │ …unchanged from 1.7.0…  │         │   …                     │
│   Messaging frameworks+ │          └─────────────────────────┘         ├─────────────────────────┤
├─ Palette ───────────────┤                                              │ 💬 Talk it through      │
│ ●●●● ○○         [Edit]  │          identity band grows a second        │ 🔍 Research this brand  │
├─────────────────────────┤          fact; rail rule untouched           └─────────────────────────┘
│ 💬 Talk it through      │                                              + Visual identity tile turns
│ 🔍 Research this brand  │                                                on and owns all assets
└─────────────────────────┘
```

A is the obvious one and the one that crowds the rail. B respects the rail's rule
by not touching it, but 1.7.0 deliberately kept counts *off* the identity band on
the grounds that no fact appears twice — a palette there is a new fact, not a
restated one, so it is arguable rather than excluded. C is the cleanest and the
least discoverable: a brand's colours become somewhere you navigate to.

**No recommendation is made here on purpose.** Three fixtures render three rails;
you look at the `rich` scenario in each and say which one you can live with. That
is the single most valuable output of this pass.

### 2. They meet at the same inert tile, and neither turns it on alone

`Visual identity` has shipped as a `Soon` tile since 1.4.0 (`miniApps.ts:84-92`,
`enabled: false`) — one of the two dead tiles 1.7.0 noted the page already had.

- Research's Q9 puts visual extraction out of scope and records it as *"the work
  that would let the Visual identity tile stop saying Soon."*
- Assets' Q2 proposes the same tile as the home for a photo grid, *"which is
  already a `Soon` tile with a stub route and no reason to exist yet."*

Two proposals, written days apart, independently identify the same tile as the
thing they would enable and each defer it to the other. Merged, it turns on —
and it is the only obvious answer to structure C above.

### 3. Question 3 is the one they share, and it is a layout question

Research's Phase D shapes its report into sections keyed to `SUGGESTED_SECTIONS`
labels, one of which is **Visual guidelines** — whose shipped example body is
literally *"Primary palette: neutral-first, one accent…"*. Assets exists to stop
colours being prose.

Ship both unreconciled and a brand states its palette in two places, one of them
written by a machine. That is the precise failure mode `vision.md` opens with.

Three resolutions, all cheap in a mockup and expensive after a migration: the
text section keeps *rationale* while swatches hold *values*; the text section is
dropped from the suggested five once a palette exists; or the swatch block
renders **inside** the Visual guidelines row as its body. Fixture all three,
delete two.

## Facts verified against `main` at 1.7.0 (2026-07-29)

| Claim | Evidence |
| --- | --- |
| The hub owns its queries inline | `routes/brands.$brandId.tsx:39-49` — `useBrand`, `useBrandProjects`, `useUpdateBrand`, `useDeleteBrand`, three `useState` dialogs |
| The rail is already presentational | `BrandContextRailProps` is `{ brand, onEdit, className }`; 11 tests render from props |
| The footer is one ghost button | `BrandContextRail.tsx:184-191`, `Talk it through` → `/brands/$brandId/context` |
| The section list rule is written down | `BrandContextRail.tsx:60-68` — *"Written sections and unwritten suggestions are one list… five rows, two of them written, is the meter"* |
| `BrandMark` is derived, and says so | `BrandMark.tsx:13-15` — *"When real brand assets land, this component keeps its call sites and its geometry; only the source of the fill changes from derived to declared"* |
| `Visual identity` is inert | `miniApps.ts:84-92`, `enabled: false`, `surface: 'tile'` |
| Routes are registered by hand, not file-globbed | `router.tsx:14-24` — a flat `rootRoute.addChildren([...])` of nine imports. A demo route is one import and one array entry, and removing it is the same two lines |
| The tile grid is a fixed 2-up | `routes/brands.$brandId.tsx:94` — `sm:grid-cols-2`, set by 1.7.0's live pass after `auto-fill` wrapped 3+1 |
| The hub is the only width-constrained route | `mx-auto max-w-6xl` at `:63` |
| `EditGuidelinesDialog` already forwards `staged` | Confirmed by the research doc's own drift check; the hub renders it at `:78` passing nothing |
| Blob read URLs already auto-refresh | `api/queries/blobs.ts` — `fetchReadUrl` on a 4-minute `refetchInterval`. The mockup must **not** reimplement this; fixtures serve static URLs and the seam is left for the real pass |
| Test baseline | **456** (446 passed, 10 skipped — the skips are live-Postgres suites, untouched here) |

## Scope — what the mockup renders

Everything below is presentational, fed by props, with mutations as `console.log`
+ local state. Nothing persists across a reload; that is the point.

**Identity band**
- `website_url` as a link under the description (research decision 3).
- `BrandMark` gains an optional declared source: `blob` (a static fixture image),
  `link` (an external URL), or absent → today's monogram.
- **The broken-link case is a first-class scenario, not an afterthought.** Assets
  says image-load failure falls back to the monogram. That path gets a fixture
  with a deliberately dead URL and it gets screenshotted.

**Rail**
- Three structural variants (A / B / C above), switchable.
- Colour swatches: `active` and `proposed` rendered distinguishably, with the
  cardinality range — 1, 2, 4, 12 — driven by fixtures.
- Research footer row, all four states from research decision 2: `idle`,
  `running`, `ready`, `failed`. Plus `NO_FINDINGS`, which the locked doc names as
  a terminal state but never sketches.

**Landing the drafts**
- E1 — the toast with source count and **Undo**, over a brand that arrives
  populated.
- E2 — the review sheet: one card per draft, sources visible, checkbox each,
  *Accept selected*. Rendered from fixture drafts; *Accept selected* opens the
  existing `EditGuidelinesDialog` with `staged` populated, which is a prop that
  already exists and has never been used on this surface.

**Visual identity page**
- The tile stops saying `Soon` in the demo scenarios only.
- Asset library: logo, photos, files. Blob-backed and link-backed side by side,
  visibly distinguishable, because assets' rule is that a link is first-class for
  reference and a blob is expected for identity — and if the UI cannot show that
  distinction, the rule is unenforceable in practice.

**Create dialog**
- `Website (optional)` + the research checkbox, disabled-with-a-reason when the
  URL is empty (research decision 4's hard gate).

## The fixtures, and why each one exists

One scenario per decision that a screenshot can falsify. A scenario that cannot
fail a decision is a screenshot nobody needs.

| Scenario | State | The decision it tests |
| --- | --- | --- |
| `bare` | 0 sections, 0 assets, no research | Today's hub, unchanged. The regression baseline |
| `palette-proposed` | 2 colours, **both `proposed`**, nothing else | The exact case that prompted this: *"1 or 2 primary colours proposed and not even finalised."* If this reads as a broken or scolding brand, `status` has failed |
| `palette-full` | 12 colours, one `proposed` | Cardinality at the top end. Does a rail block survive a full ramp, or does it force structure C? |
| `logo-blob` | uploaded logo | `BrandMark` declared. Geometry must not shift vs the monogram |
| `logo-link-ok` | `source: 'link'` that renders | Bring-your-own-hosting, the happy path |
| `logo-link-dead` | `source: 'link'` that fails to load | **The monogram fallback.** Assets claims this costs nothing; a screenshot decides |
| `researching` | job in flight, 2 min elapsed | Rail footer `running`. Does a spinner in a persistent column read as progress or as broken? |
| `research-landed` | populated + toast + Undo | E1. The toast must not obscure what it is describing |
| `research-ready` | curated brand, 5 drafts waiting | E2 badge → review sheet. The *common* path on any existing brand |
| `research-failed` | error + Try again | Failure in a rail that must not look alarming |
| `no-findings` | terminal, nothing found | The state the locked doc names but never draws |
| `rich` | **everything at once** — 12 colours, logo, 5 sections, drafts ready, 8 assets | **The crowding test, and the whole reason for merging.** If the rail collapses here, structure A is dead |
| `long-names` | 60-char brand name, 40-char labels | Discharges 1.6.0's deferred truncation check for free |

**Both `link` fixtures point at local files, and the reason is not tidiness.** A
real Google Drive URL in `logo-link-ok` makes the P5 Playwright run depend on a
third party being up, and a fabricated hostname in `logo-link-dead` fails via DNS
— which **hangs** for however long the resolver takes rather than firing `onError`
promptly, so the shot lands mid-timeout and the fallback it exists to prove is
the one thing not in it. `logo-link-ok` gets a static file under the demo module
served from the dev origin; `logo-link-dead` gets a path on that same origin that
does not exist, so the 404 is immediate and local.

What is being reviewed here is that a `link`-sourced asset is **visibly
distinguishable** from a `blob`-sourced one and that failure degrades to the
monogram. Neither claim is about the bytes crossing the internet, and a suite
that is offline-safe and deterministic is worth more than a fixture whose URL
looks authentic in a diff.

Fixtures are typed against a FE-local mirror of the proposed `BrandAsset` union —
same discriminants, same exactly-one-of rule, in
`packages/web/src/demo/assetTypes.ts`. **That file is the schema review.** It is
deleted when `@brandfactory/shared` gains the real types, and any field the
fixtures needed but the proposal lacks is a finding to fold back into
`brand-assets.md` before Phase A is written.

## Phases

Each leaves the repo green. FE only; test deltas are estimates.

### P0 — the seam (+6–10)

Extract `BrandHubView` from `routes/brands.$brandId.tsx`; the route keeps every
query and dialog and passes props down. Add `routes/demo.brand.tsx` with the
scenario `<select>`. Fixture module + `assetTypes.ts`.

**The demo route is gated on `import.meta.env.DEV`, not on remembering to
remove it.** `router.tsx:14-24` is a flat hand-written array, so the entry is:

```ts
const routeTree = rootRoute.addChildren([
  …,
  ...(import.meta.env.DEV ? [demoBrandRoute] : []),
])
```

The non-goals below say `/demo/brand` does not ship to production, and the risk
table's mitigation was *"one line in `router.tsx`; removal is the same line."*
That is true at the **end** of the pass and false in the middle of it: between P0
and P5 the route is registered, and any deploy in that window carries a
fixture-backed page into the live app — a dead affordance of exactly the kind
1.7.0 was cleaning up. Gating it makes "dev-only" a build-time fact rather than a
P5 checklist item, and Vite tree-shakes the import out of the production bundle.

It costs P5 nothing: Playwright drives `vite dev`, which is still the real
router, the real app shell, the real `index.css` and the real theme toggle —
which is the entire list 1.7.0's throwaway harness could not put in a screenshot.

**Zero visual change, and a test that pins it.** The existing hub tests keep
passing untouched, which is what proves the extraction was a move and not a
rewrite. If they need editing, the seam is in the wrong place.

### P1 — identity (+8–12)

`website_url` on the band. `BrandMark` gains `src?: string | null` with an
`onError` fallback to the monogram — one component, three fixtures, and the
component's own doc comment already promised this exact change.

### P2 — the rail, all three structures (+14–20)

The colour block, the research footer row's five states, and **A / B / C behind
the scenario picker**. Largest phase, and the one review is actually for.

Two of the three structures are deleted at the end of this pass. Building all
three is cheaper than arguing about one, and the deletion is the deliverable.

**C is the default, because C is 1.7.0.** The variant arrives as a prop, and the
prop's default has to be *some* arrangement — structure C leaves both the rail's
section list and the identity band exactly as they ship, so it is the only one of
the three that is also the current layout. A and B are reachable only from the
scenario picker. This matters because B reflows the identity band: defaulting to
it would move the real hub's mark and description in P2 and nobody would notice
until P5, which is the invariant above failing in the one phase most likely to
break it.

### P3 — landing the drafts (+10–14)

`ResearchReviewSheet` from fixture drafts. The E1 toast with Undo. *Accept
selected* → `setStaged(...)` + `setEditOpen(true)`, using the prop
`EditGuidelinesDialog` already forwards.

**`staged` stays a single `CapturePayload` in this pass.** Widening it to a list
is a behavioural change in 1.5.0 code whose StrictMode double-insert bug is on
record; the mockup can stage one draft to prove the channel and leave the
widening to the real Phase E, where its test belongs. Recorded so the omission
reads as a decision, not an oversight.

### P4 — Visual identity (+10–14)

The asset library page. Only reachable in demo scenarios — `miniApps.ts` is
**not** edited, because flipping `enabled` there would turn the tile on for real
brands with nothing behind it, which is the dead-affordance problem 1.7.0 was
cleaning up.

**How it is reached, since the registry is off-limits.** The real mini-app page
is `routes/brands.$brandId.apps.$appId.tsx`, driven entirely by `miniApps.ts` —
so "demo scenarios only" needs a mechanism, and leaving it unspecified is the one
place this phase could quietly grow back into the registry it just forbade
itself. It gets a **second demo route**, `routes/demo.brand.assets.tsx`, under
the same `import.meta.env.DEV` gate as `/demo/brand`, rendering an
`AssetLibraryView` from the same fixtures.

`MiniAppTile` is then given nothing: in the demo, `BrandHubView` receives its
tile list as a **prop** — the real route passes `TILE_APPS` unchanged, the demo
route passes a copy with `Visual identity` enabled and pointed at
`/demo/brand/assets`. The registry stays a constant that only one caller reads,
the tile component stays unaware there is a demo, and P4 adds no branch to any
file the real hub renders.

`AssetLibraryView` is the piece that outlives the pass, on the same logic as
`BrandHubView`: whichever way question 2 resolves, the surface that renders a
brand's assets is wanted, and only its route and its data source are in doubt.

### P5 — the live pass and the decision record (−0)

Playwright over all 13 scenarios × light/dark × 1600/900, driving `vite dev` so
the app shell, breadcrumb, brand switcher and theme toggle are in every shot —
the list 1.7.0's harness could not produce.

Two mechanical checks, both cheap and both guarding a claim made above rather
than a pixel:

- **`pnpm --filter @brandfactory/web build`, then grep the built assets for
  `demo`.** Zero hits or the DEV gate is not doing what P0 says it does.
- **`bare` against the real `/brands/$brandId`.** Same tree, or the absent-prop
  invariant has already broken.

Then a short **decisions** section appended to this file: which rail structure
won, what happened to question 3, and every field the fixtures wanted that the
schema did not have. That section is the input to `brand-assets.md`'s Phase A,
and this pass is not done without it.

Estimated **456 → ~505** (+~48), all `packages/web`.

## Non-goals

- **Any backend.** No migration, no route, no adapter, no vendor key, no
  `shared` type. If a phase needs one, the phase is out of scope.
- **Real uploads.** No file picker wired to a blob store; drop zones are inert
  and log. The blob transport already works and is not what needs reviewing.
- **Real research.** No Perplexity call, no polling, no ticker. States are
  fixtures and a scenario picker, not a state machine — a `setTimeout` that
  walks `idle → running → ready` would be a simulation of the part that is
  already designed.
- **Turning `Visual identity` on for real brands.** Demo scenarios only.
- **Widening `staged`.** P3 above.
- **Shipping `/demo/brand` or `/demo/brand/assets` to production.** Both are
  gated on `import.meta.env.DEV` from the moment they exist (P0), so they are
  absent from the production bundle for the *duration* of the pass and not only
  at the end of it, and both are deleted when it lands. If either survives, it
  survives as an explicit decision with an auth gate, not by being forgotten.
- **Re-litigating the locked research decisions.** Decisions 1–12 are settled.
  This pass renders them; it does not reopen them. The one thing it may
  legitimately send back is *placement*, and only where placement collides with
  assets — which is section "What merging reveals" and nothing else.

## Risks

| Risk | Mitigation |
| --- | --- |
| **The mockup becomes the product** — fixtures rot into a second source of truth | `/demo/brand` and `assetTypes.ts` are deleted in the same pass that lands the real types. P5's decision record is what makes the deletion safe, because the *findings* outlive the files |
| **Reviewing pixels ratifies a schema nobody read** | Inverted deliberately: the fixtures are typed against the proposed union, so a scenario that cannot be expressed is a schema finding. That is the mechanism, not a side effect |
| **Three rail structures is three times the work** | Two are deleted. They are variants of one component's arrangement, not three components — and the alternative is deciding by argument, which is what produced two proposals that both want the same footer |
| **The seam churns the hub's tests** | P0's acceptance criterion is that they pass **unedited**. If they don't, stop and re-cut the seam |
| **New props leak into the real hub** — `BrandHubView` is shared, so P1–P4 edit a component `/brands/$brandId` renders | The absent-prop invariant under the load-bearing decision, as an acceptance criterion on every phase from P1. It holds by construction today (no `website_url`, no assets query, no research query) and stops holding when the backend passes land them, which is why it is written down rather than relied on. `bare` must render the same tree as the real route |
| **A rail variant becomes the default by accident** | C is the default and C *is* 1.7.0 — P2. B reflows the identity band, so defaulting to it would move the real hub in the largest phase |
| **Demo route ships to prod** | `import.meta.env.DEV` in `router.tsx`, so it is tree-shaken out of the production bundle — a build-time fact, not a P5 checklist item. P5 greps the built assets to confirm |
| **`enabled: false` gets flipped for convenience** | Called out in P4 as the thing not to do, with the reason — and P4 gives the mechanism that removes the temptation: the tile list becomes a prop, so the demo overrides it without the registry knowing |

## Interaction with the two source documents

Neither is superseded. This pass sits **before** both.

- `brand-assets.md` is unlocked and its questions 2, 3 and 6 are precisely what
  P5 answers. Its Phase A should not be written until then.
- `brand-research-onboarding.md` is **locked**, and stays locked. Its Phase A
  (`website_url` + provenance on the wire) is independently useful, needs no
  mockup, and can ship in parallel with this pass without conflict — it is the
  one piece of either proposal that this document does not gate.

Its Q10 — whether Phase A ships alone first — is still the open sequencing call,
and this pass makes the answer **yes**: Phase A is backend-only and blocked by
nothing here, while every other research phase touches a rail whose shape is
about to be decided.
