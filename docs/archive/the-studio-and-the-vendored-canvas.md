# Studio, and 54,000 lines of somebody else's canvas

**A brand operating system with no way to make a picture.** `Visual identity`
has held a brand's colours, marks and photography since 2E, and every one of
them arrives by upload or by URL — the library is a very good filing cabinet
attached to a product whose other four tiles all *make* something. The gap is
not a missing feature so much as a missing verb.

[`pixel-point/toolcraft`](https://github.com/pixel-point/toolcraft) is a canvas
with controls: upload, pan, zoom, radar, history, layers, a timeline with
keyframes, and image + video export, driven by a declarative schema. MIT.
Stack-compatible to a degree that is almost suspicious — React 19, Vite 8,
TanStack Router, Tailwind 4, dnd-kit, sonner, cva, clsx, tailwind-merge, all
already in `packages/web`.

This pass vendors it and puts it under `Apps` as **Studio**. The canvas is
**generic** — no brand context is wired, by decision; the palette, asset-library
and export-to-`brand_assets` seams are the follow-up, and §6 says what they are.

```
┌────┬──────────────┬────────────────────────────────────┐
│ ▣  │ Casa Vostra ⌄│  🖌 Studio                          │
│ ── │              │  A canvas with controls — …        │
│ CV │ ▸ Overview   │ ┌────────────────────────────────┐ │
│ AC │              │ │                    ┌──────────┐│ │
│ MG │ APPS         │ │                    │ Controls ││ │
│ +  │  Copywriting3│ │      [canvas]      │          ││ │
│    │  Visual id 12│ │                    │          ││ │
│    │  Studio      │ │                    └──────────┘│ │
│    │  Social  Soon│ │  ┌──────────────┐              │ │
│    │  Open canvas2│ │  │ ↶ ↷  ⊙  − + │              │ │
│    │              │ │  └──────────────┘              │ │
│ ◧  │ BRAND        │ └────────────────────────────────┘ │
│ ☀  │  Brand ctx  1│                                    │
└────┴──────────────┴────────────────────────────────────┘
             ↑ no count, on purpose — see §3
```

---

## 1. Why vendored, and why that is not a euphemism

Upstream ships as a **project generator** (`npx @pixel-point/toolcraft create`),
not a package. There is no module to depend on, so vendoring is not a shortcut
past a dependency — it is the only way to consume it at all.

What follows from that is that the tree has to stay **diffable against
upstream**, because re-syncing is a manual diff forever. So it is checked in
verbatim at `682a159` with `LICENSE.md` beside it, and every local change is
enumerated in `src/toolcraft/README.md`.

Two exemptions carry that, each with its reason written at the exemption rather
than here:

- **`.prettierignore`** — the tree is double-quoted and semicolon'd because
  upstream is. Reformatting 54k lines to our style would make every future
  `git diff` against upstream unreadable, which is the one property vendoring
  has to preserve.
- **`eslint.config.js`** — 87 findings, and the shape of them is the argument:
  34 `react-hooks/set-state-in-effect`, 18 `rules-of-hooks`, 11 `refs`, 5
  `immutability`, 4 `preserve-manual-memoization`. Those are the React-compiler
  rules that arrived with `eslint-plugin-react-hooks@7`, which upstream is not
  on. Refactoring a canvas engine's effect graph to satisfy them is a rewrite
  of the thing we vendored in order not to write.

**Types are deliberately not exempted, and this is the load-bearing half.**
`pnpm typecheck` covers the vendored tree in full and passes: our code consumes
these types, so they have to hold. Style is upstream's business; the contract is
ours. It cost 23 one-line guards, all of them `noUncheckedIndexedAccess`
(upstream does not set it) — an early `return ""`, some `?? fallback`s, one
`isBooleanControl` promoted to a type predicate, and a `Boolean(x) &&` corrected
to `x !== undefined &&` because `Boolean()` is not a type guard. None changes
behaviour; each follows an idiom upstream already uses nearby. All 23 are in the
README's table.

**3 `jsx-a11y` findings are inside that exemption** and are a real gap, not a
clean one: two `click-events-have-key-events` and one
`no-static-element-interactions`, all on canvas-surface drag handles.

## 2. What was dropped, and why the drop is the interesting half

`ui/components/composites/` — 29 files, 4,390 lines: accordion, alert-dialog,
avatar, breadcrumb, card, combobox, command, context-menu, **dialog**,
dropdown-menu, hover-card, menubar, navigation-menu, pagination, progress,
radio-group, resizable, sheet, **sidebar**, **sonner**, spinner, **table**,
tabs.

The reachability check is what settled it. `ui` imports `runtime` zero times;
`runtime` reaches into `ui` from exactly six files, and every one of them pulls
only primitives, panel chrome and controls. The composites arrived solely
because `ui/index.ts` re-exported them — reachable through a barrel, used by
nothing.

They are also precisely the half that would have hurt. A second `Dialog`,
`Sidebar`, `Table`, `Tabs` and `Sonner` beside the Radix ones in
`components/ui/` is how a codebase ends up with two answers to *which dialog do
I import*, and no amount of directory naming prevents the wrong one being
picked. The one-line `export *` in the barrel went with them.

Dropping them removed **`cmdk` and `react-resizable-panels` entirely**. Three
new dependencies remain: `@base-ui/react` (the primitives' substrate),
`@phosphor-icons/react`, `motion`.

The 54k lines that stayed are the part with no local equivalent: the engine, and
~20 control widgets — gradient with a stop list, a 355-line curves graph,
channel mixer, colour picker, vector pad, anchor grid, font picker.

## 3. `unit: 'canvas'` — the third answer

The registry already had two. `'thread'` is a category of conversations;
`'asset'` was 2E's first row that is not (`Visual identity` counts files). Studio
is a third shape again: **it is not a collection of anything.** One surface, one
state.

So `countOf` returns `null` for it, which is already this codebase's *not known,
say nothing* value — the row renders no number rather than a `0`, because `0`
would read as "empty" for something that is never empty in the way a category
with no threads is. The doc comment says explicitly that `'canvas'` must not be
read as "a collection of canvases".

Everything else falls out of the registry being the nav, as 1.15.0 built it:
`TILE_APPS` derives the row, `BrandNavPanel` renders it, the hub gets a tile, and
the `unit === 'thread'` guard already excludes it from thread nesting. **One row
added; no second list edited.**

`create` and `match` are retained on the row for classification only — the exact
precedent `visual` set. Nothing creates a `templateId: 'studio'` thread, but if
one ever exists it is classified rather than landing in `Other threads`.

## 4. Mission Systems, by cascade

The vendored surface is styled entirely through the
`--background` / `--foreground` / `--border` … contract — the same one
`index.css` tier 3 already publishes for the shadcn primitives. So the studio
inherits Mission Systems for free, and the integration is only the short list of
places where **toolcraft reads a token differently than we write it**.

Upstream's own theme block is **deleted, not overridden**. It declared ~40
colour tokens twice, in neutral greys with a blue accent; overriding would have
meant restating all 40 just to neutralise them. Deleting lets them cascade from
`:root` / `.dark`, which is what makes the studio follow the app's theme rather
than keep a second one.

Seven remappings survive, in `src/styles/toolcraft.css`:

| tokens | why |
| --- | --- |
| `--secondary`, `--border`, `--input` | **Dilution bases.** Every use site is `color-mix(…, var(--x) 8–25%, transparent)`. Toolcraft sets them to full-contrast ink and lets the mix do the work; our tier 3 hands out the *finished* colour — `--border` is already `rgba(23,23,23,0.16)`, and mixing that to 12% is a border nobody can see. Pointed at `--color-text-primary`, which keeps upstream's arithmetic and takes the hue from tier 2 |
| `--accent`, `--accent-foreground` | **A highlight here, not a hover surface.** Upstream paints `#0c8ce9` on a checked switch, a selected layer row and the text selection. Ours is deliberately the opposite — `--surface-hover`, a beige — because pointing shadcn's accent at the brand green would spray it across every hover and blow the §4 accent budget. That reasoning does not reach in here: these are a handful of genuine active states, which is what §4 spends the accent on. So Studio's active states are brand green |
| `--link`, `--chart-1` | No tier-3 equivalent. `--link` is load-bearing at 44 use sites; `--chart-1` has one and no chart |

**Two theme systems met, and one was switched off.** `ToolcraftThemeProvider`
keeps a preference of its own — own storage key, defaulting to dark — and the
vendored toolbar carries a toggle for it. Colour now comes from our cascade, so
that toggle would have been a switch that half-works, disagreeing with the rail's
own. `toolbar.theme: false` in the schema turns it off with no vendored edit;
`schema.toolbar.theme` was already the gate.

That leaves `color-scheme`, which the provider writes as an **inline style** and
only `!important` can outrank. Without the override the panels would render our
light palette while native scrollbars and form controls inside them rendered
dark. It is the one `!important` in the file, and it is overriding vendored
inline style, which is the textbook case for it.

## 5. The chunk

Mounted eagerly, the vendored runtime lands in the entry chunk — the login page
paying for a gradient editor. `StudioSurface` is therefore a `React.lazy` split
point with a **default export and nothing else**, and `studioSchema.ts` is split
out beneath it so the schema can be tested without dragging `runtime/react` back
into the eager graph through the back door.

```
entry      1,296 kB  →  1,189 kB + 110 kB shared   (unchanged; rolldown split dnd-kit out)
Studio         —     →  1,171 kB   (285 kB gzip), on the studio route only
CSS          242 kB  →    266 kB   (+23 kB, +2 kB gzip) — not code-split, every page pays
```

1.17 MB is a lot of JavaScript, and it is the honest price of the controls in §2
that have no local equivalent. It is paid on one route, on demand, behind a
`Suspense` fallback inside the page frame — the header stays put and only the
canvas area swaps.

## 6. What is deliberately not here

The scope was set to *generic canvas first, brand wiring later*, and the
controls panel ships with **`sections: []`**. That is not an oversight: a control
section is a statement about what the tool does, and inventing sliders to fill
the panel would be the generic image toy this stopped short of. The panel
renders its own empty state.

The one brand-shaped thing is the **persistence key**, scoped per brand — and
that is a correctness floor rather than an integration. State lands in
`localStorage`; a single key would show one brand's canvas under another brand's
name the moment you switched.

The follow-up, in the order that makes each one useful on its own:

1. **Palette control seeded from the brand's colours** — `useBrandAssets` already
   returns them and toolcraft already has a `Palette` control.
2. **Image picker reading the asset library** — the logo and photography, with
   `useSignedReadUrls` doing what it does on the library page.
3. **Export writing back into `brand_assets`** — the runtime's PNG export into
   the existing two-step `uploadBlob` path, which closes the loop the intro
   opens with.

## Files

**New**

| file | what |
| --- | --- |
| `src/toolcraft/**` | vendored upstream: `runtime/` + `ui/`, `LICENSE.md`, and a `README.md` recording provenance, the composites deletion and all 23 type deltas |
| `src/styles/toolcraft.css` | the seven remappings, the `color-scheme` bridge, `@source`, and the six scale entries our `@theme` lacks |
| `components/brand/studioSchema.ts` | every choice the app makes; imports `runtime` only, never `runtime/react` |
| `components/brand/StudioSurface.tsx` | the lazy split point — default export only |
| `components/brand/StudioPage.tsx` | `PageHeader` + the `Suspense` boundary |
| `components/brand/studioSchema.test.ts` | 3 |

**Changed** — `miniApps.ts` (the row, the `'studio'` id, `unit: 'canvas'`),
`BrandNavPanel` (`countOf`), `routes/brands.$brandId.apps.$appId` (the third
dispatch branch), `index.css` (three imports), `packages/web/package.json`
(three deps), `eslint.config.js` + `.prettierignore` (the exemptions).

**Tests changed** — `miniApps.test.ts` (the `TILE_APPS` id list and the counts
object both enumerate every row), `BrandNavPanel.test.tsx`,
`BrandHubView.test.tsx` (see below), the route suite (a stub for the lazy
module — loading it for real would pull every control widget and a canvas jsdom
has no 2D context for).

## Verification

```
pnpm typecheck                    10/10 workspaces
pnpm lint / format:check          clean
pnpm test                         1029 passed | 49 skipped (114 files)
pnpm -F @brandfactory/web build   clean
```

1024 → **1029 (+5)**: `studioSchema` 3, `BrandNavPanel` 1 (no count on a canvas
row, asserted with everything *loaded* — the existing `null`-while-pending test
would have passed on that row for the wrong reason), the route's canvas branch 1.

**One existing assertion was tightened rather than worked around.**
`BrandHubView`'s "renders no palette block" test asserted
`queryByText(/colour/)`, meaning the summary line `1 colour · 1 proposed` — but
matching any tile *description* that mentions colours, which Studio's now does.
It is now `/\d+ colours?\b/`, which is the invariant the test is named for. The
alternative was rewording the tile to dodge it, which would have left the loose
assertion for the next row to trip over.

The 49 skips are live-Postgres and **were not run**: no Docker daemon and no
`.env` here, unchanged from 1.11.2's standing warning. Nothing in this pass
touches SQL, the server, or any package other than `web`.

**No live pass.** No database means the app cannot boot, so none of this has been
on a screen. What is verified is the DOM, the type contract across 54k vendored
lines, the compiled CSS and the production build. What reasoning cannot settle,
in rough order of how likely it is to be wrong:

1. **The re-tokenisation, which is the whole of §4 and is unobserved.** The seven
   remappings are reasoned from reading every use site of each token, not from
   looking at the result. The dilution-base group is the one to check first: if
   `--border` is wrong the panels have no visible edges, and if `--accent` is
   wrong every active state disappears into a beige.
2. **`min-width: 1024px`.** `ToolcraftApp` sets it on itself and clips its own
   overflow; the panels are absolutely positioned and do not reflow. The
   container scrolls instead, which is the honest failure — but 296px of sidebar
   chrome plus a 1024px floor is 1320px before the canvas has any room, and the
   `lg` breakpoint hands over at 1024.
3. **Whether the empty controls panel reads as unfinished.** §6 argues it is the
   right restraint. On a screen it may just look broken, and the fix would be
   bringing item 1 of the follow-up forward.
4. **The vendored surface under our fonts.** Upstream sizes against Inter; the
   app serves Satoshi, and the six `@theme` scale entries carried over are
   upstream's numbers, not re-measured ones.
