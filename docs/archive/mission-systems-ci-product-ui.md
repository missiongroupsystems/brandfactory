# Mission Systems CI — product UI completion (Satoshi, token tiers, accent budget)

**Status:** shipped — the web package renders in the Mission Systems corporate identity. Token architecture, typeface, component catalog, and accent budget all conform to the bundled product styleguide.
**Spec source:** `STYLEGUIDE_MISSION_SYSTEMS.md`, bundled with the `frontend:apply-mission-systems-ci` skill (v0.3.0). Section references below (§2, §4, …) point into that file.
**Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` — all green across 9 workspaces, 240 tests unchanged. **Visual verification against the reference screenshot was explicitly skipped** (see [Verification](#verification)).
**Scope:** `packages/web` only. No server, db, adapter, or shared package touched. ~390 insertions / ~106 deletions across 19 files + 5 font binaries.

This is a re-skin, not a feature. Nothing about what the app *does* changed — every route, query, and interaction is byte-identical in behaviour. What changed is that the app stopped looking like default shadcn/ui and started looking like Mission Systems.

## The fortunate precondition

The single fact that made this a ~390-line change instead of a rewrite: **this codebase already routed nearly every surface through shadcn's semantic contract.** Product code says `bg-card`, `text-muted-foreground`, `border`, `bg-accent` — almost nowhere does it say `#hex` or `bg-slate-200`.

The styleguide's §2 demands three token tiers, where components read tier 2 or 3 and never a raw primitive. The shadcn contract *is* a tier-3 component-token layer; it was simply pointed at a greyscale oklch palette. So the whole re-skin reduces to: define tiers 1 and 2, re-point the existing tier-3 names at tier 2, and fix the handful of places where product code had spent a token on the wrong role.

Had the app hard-coded colors at the point of use, this would have been a file-by-file rewrite with a much worse diff and a much higher regression risk.

## What changed

### `packages/web/src/index.css` — the bulk of the diff (+371)

Four blocks, in dependency order:

1. **`@font-face` × 5** — Satoshi Light/Regular/Italic/Medium/Bold, self-hosted from `public/fonts/Satoshi/`, `font-display: swap`, weights mapped exactly per §1.1 (300 / 400 / 400-italic / 500 / 700).
2. **Tier 1 primitives** — the `--c-*` ramp. The accent `#1d3a2a`, the warm ink ramp, the four feedback triads, the dark-theme primitives, and the `--space-*` 4px grid. **The only place a hex appears in the codebase.**
3. **Tier 2 semantic aliases** — `--color-text-*`, `--surface-*`, `--border-*`, `--color-feedback-*`, `--elevation-*`. Plus a `.dark` block that re-points the same names (see [Dark mode](#dark-mode-shipped-as-an-alias-re-point-not-a-second-design)).
4. **Tier 3** — the shadcn contract (`--background`, `--card`, `--primary`, …), each name now a one-line alias onto tier 2.

Then base-layer rules the styleguide states as absolutes: body at 14/1.5/**400** (§0.7 — 300 is display-only), `text-wrap: pretty` on headings, `tabular-nums` on numeric containers (§5.3), a `:focus-visible` outline (§10.2), and a `prefers-reduced-motion` block (§14).

### Component primitives (`components/ui/*`)

| File | Change | Spec |
|---|---|---|
| `button.tsx` | 8px radius all variants; heights 40/32/44 per density; **elevation removed**; `:focus-visible` outline replaces shadcn's ring; `secondary` = white + hairline border | §12.2, §9, §8, §10.2 |
| `input.tsx` | 40px tall, 8px radius, 1px `--border-input`, placeholder in tertiary, disabled uses a fill not opacity | §11, §3.4, §10.1 |
| `select.tsx` | Trigger matched to `input`; content at 12px radius + elevation-2 | §11, §12.7 |
| `card.tsx` | 12px radius, 20px padding, `--elevation-1` (ink-tinted, never black) | §12.1, §8, §9 |
| `dialog.tsx` | 16px radius, `--elevation-3`, scrim `rgba(23,23,23,0.32)` | §12.6 |
| `label.tsx` | 13px/500 in secondary text | §11 |

### Product surfaces

Headings dropped 600 → **500** across all routes (§5.1), with the §5.2 letter-spacing (`-0.015em` on H1, `-0.01em` on H2) and H2s corrected from `text-lg` to `text-xl`/20px. Canvas block radii normalised to the 8px functional default. `Workspace Settings` → `Workspace settings` (§0.4 — sentence case). A sentence-case audit of every button, label, and heading found no other violation; the codebase was already clean here.

## Why these choices

### The `--accent` name collision — the one trap in this job

**shadcn's `--accent` is not an accent.** In shadcn's vocabulary it's the hover/active *surface* — the thing behind a hovered menu item or ghost button. In Mission's vocabulary (§4) "the accent" is `#1d3a2a`, spent on a fixed, named, deliberately scarce set of roles.

Two tokens, same word, opposite intent. The naive mapping — `--accent: var(--color-brand-accent)` — reads correct and would have turned **every hover state in the application forest green**, blowing the §4 budget on the least meaningful interaction in the product.

The mapping shipped:

```
--primary  →  var(--surface-accent)   /* the brand accent: action, selection */
--accent   →  var(--surface-hover)    /* beige: hover, ghost-button bg */
```

There is a comment in `index.css` at that line saying exactly this, because it is the one place in the file where the obvious edit is the wrong one.

### Three accent-budget violations, all pre-existing

These were latent. They looked fine in greyscale shadcn and only became violations the moment `--primary` started meaning something. Flipping the token *revealed* them rather than causing them — worth noting, because it means the budget rule earns its keep as a review lens, not just a paint job.

- **`ChatPane` — every user message bubble was `bg-primary`.** A ten-turn conversation would have painted ten forest-green blocks down the pane. §4 permits the accent on one primary button, one hero metric, active/selected state, and small brand chrome. A chat log is none of those. Now `--surface-selected` (the faint accent-tinted beige, ink at 15.9:1), which still says "this one is mine" without spending the accent.
- **`workspaces.$wsId.settings` — the source pill was `bg-primary/10 text-primary`.** §12.4 is explicit that pills take a feedback tint or the neutral beige. "workspace setting" is a genuine informational state, so it takes the `info` tint (`#eaf0f5` / `#335a7a`, 6.3:1 on tint); "env default" takes the neutral beige.
- **`ShortlistToggle` — `rounded-full`.** §9 has no pill button in product UI; pills are reserved for status/chips/avatars. Segmented controls are 8px. Its accent-filled selected segment was already correct per §12.5 and was left alone — it is one of the four sanctioned accent roles.

Post-change accent inventory across the whole app: primary buttons (one per view), the selected shortlist segment, focus rings, and the canvas drag-active outline. Nothing else is green.

### Dark mode shipped as an alias re-point, not a second design

The styleguide is **light-theme only** (header note + §16). This app has a working three-state theme toggle (light / dark / system) shipped in 0.7.4.

Three options: delete the toggle, leave dark mode on the old greyscale palette, or re-point the aliases. Deleting a working feature is out of scope for a re-skin. Leaving it stale would mean one theme branded and one theme not — the worst outcome, because it looks like a bug rather than a decision.

So: dark mode is a **second tier-2 map only**, exactly the shape §16 prescribes for when dark mode does arrive. No component code branches on theme, no new tier-1 primitives beyond the declared `--c-dark-*` set. If and when an official Mission dark spec lands, it replaces one block in one file.

One substantive judgement inside it: the accent lifts from `#1d3a2a` to `#3d6b52` in dark. The near-black-green is 12.4:1 behind white text and safe as a *fill*, but against a `#1a1a17` surface it stops reading as a fill at all — a primary button would vanish into the page. `#3d6b52` computes to 6.05:1 behind white text, clearing the §16 tenant guardrail (4.5:1 minimum) with margin, while staying visibly a *fill*. This is an extrapolation beyond the spec and should be treated as provisional.

### Utilities exposed under `status-` / `surface-` prefixes

Tailwind v4 owns the `--color-*` namespace inside `@theme`. The styleguide's tier-2 names (`--color-feedback-error`, `--color-text-tertiary`) collide with it — declaring them in `@theme` produces a self-referential `var()` that silently resolves to nothing.

Rather than rename the spec's tokens, tier 3 declares indirection vars (`--fb-error`, `--text-tertiary`) and `@theme` exposes those as `text-status-error`, `bg-status-info-tint`, `text-tertiary`, etc. Because CSS custom properties resolve at the use site, the `.dark` re-point still flows through the indirection untouched. The styleguide's own token names survive verbatim in the file, which matters for anyone diffing this against the spec.

## Verification

```
pnpm typecheck                              ✔  9/9 workspaces clean
pnpm lint                                   ✔  clean (zero new suppressions)
pnpm format:check                           ✔  clean
pnpm test                                   ✔  239 passed + 1 skipped (240 total; unchanged)
pnpm --filter @brandfactory/web build       ✔  clean
```

Test count is deliberately unchanged. Nothing here is behaviour; the existing 240 passing is the regression net — it proves the re-skin didn't break render paths, which is exactly what it should prove.

### Built-CSS emission check

Tailwind **silently drops** utilities it can't resolve — a typo'd `bg-surface-selected` produces no error, no warning, and no style. `pnpm build` passing proves nothing about whether the new tokens actually reach the browser. So the built stylesheet was grepped directly:

| Checked | Result |
|---|---|
| `bg-surface-base` · `bg-surface-sunken` · `bg-surface-selected` | ✔ emitted |
| `placeholder:text-tertiary` | ✔ emitted (`color:var(--text-tertiary)`) |
| `bg-status-info-tint` · `text-status-info` | ✔ emitted |
| `shadow-elevation-1` · `shadow-elevation-3` | ✔ emitted |
| All 5 `Satoshi-*.woff2` URLs | ✔ present in bundle |
| Accent `#1d3a2a` | ✔ present |

This rules out silently-dropped classes. It says nothing about how the result looks.

### Visual verification: SKIPPED

The skill's §3 loop — Playwright screenshots at 1280×800 and 390×844, read back and diffed against the bundled `grapestack_screenshot.webp` — **was not run.** The Playwright CLI is not available in this environment; offered install-to-scratchpad, install-to-repo, drive-Chrome, and skip, the operator chose skip.

**Consequence, stated plainly: no human or agent has looked at this UI.** Everything above is spec conformance established by reading code and grepping build output. Specifically unverified:

- Satoshi actually rendering (vs. silently falling back to `system-ui`), and at the right weights.
- The accent inventory as *rendered* — the audit above is a grep of source, not a look at pixels.
- Contrast of real text on real backgrounds.
- Mobile: no overflow check at 390px was performed.
- Every hover, focus, disabled, and loading state.

### The one open risk

`--background` now maps to `--surface-sunken` (beige `#f6f5f1`), per §3.2 which designates it "page background behind cards". This is correct for the card-grid pages (workspaces, brands) and matches the reference dashboard, where a beige canvas holds white cards.

**It is unverified on the project split-screen.** That route is two content panes, not a card grid — and the canvas pane's blocks are `bg-card` (white) on what is now a beige pane. That may read as intended layering, or as muddy beige-on-beige. Reference §17 has no split-screen analogue to check against.

If it reads badly, the fix is local and small: give `SplitScreen`'s two panes `bg-surface-base` explicitly. **This is the first thing to look at when the app is next opened.**

## What this explicitly does NOT include

- **The §17 reference layout.** The canonical dashboard is a side-nav shell with stat cards, a data table, and a segmented time control. BrandFactory has none of those — it is a top-bar shell over card grids and a split-screen editor. The CI was applied as *tokens, type, density, components, and accent budget*; the reference layout was **not** imposed as a structure. Forcing a side-nav and stat-card row onto an app with no metrics to show would be cargo-culting the screenshot instead of applying the identity.
- **A monospace face.** `--font-mono` is defined per §5.4 but unused — the app currently surfaces no SKU, product code, hash, or copyable ID. The token is there for the day one appears; adding a second webfont for zero call sites is weight without benefit.
- **The `--space-*` scale as utilities.** Tier 1 declares the 4px grid, but product code still uses Tailwind's own spacing scale (also 4px-based, so values already conform). Migrating `p-6` → `p-[var(--space-6)]` would be churn for an identical computed result.
- **A11y audit beyond token contrast.** §15 asks for an automated contrast + axe check in CI. The tokens shipped are the styleguide's own AA-verified values, but no axe run, keyboard-traversal pass, or screen-reader check happened here.
- **Density modes.** §6.2 defines a `data-density` switch (comfortable / compact). Only comfortable is implemented; there is no dense table in the product yet to motivate the compact mode.
- **Any behaviour change.** No route, query, mutation, or interaction was modified.

## Follow-ups

| Item | Why it's not here | Priority |
|---|---|---|
| Run the Playwright screenshot loop against the reference | Operator skipped; CLI unavailable | **High** — everything above is unverified visually |
| Check the split-screen panes for beige-on-beige | Requires looking at it | **High** — the one known open risk |
| axe + contrast check in CI (§15) | Separate infra thread | Medium |
| Mono face when the first ID/SKU surface lands | No call sites yet | Low |
| Compact density mode (§6.2) | No dense table yet | Low |
| Replace the provisional dark accent `#3d6b52` | Extrapolated beyond a light-only spec | Low — revisit if an official dark spec ships |
