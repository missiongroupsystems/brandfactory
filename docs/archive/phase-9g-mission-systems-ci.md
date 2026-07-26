# Phase 9G — Mission Systems CI visual pass

**Status:** done (with noted skill / Playwright gap)  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase G)  
**Package:** `@brandfactory/web` (foundation tokens + shell chrome)

## Goal

Bring the product frontend in line with the Mission Systems corporate identity:
Satoshi, forest accent, warm neutrals, semantic feedback palette, type scale /
density — while **keeping** the Phase-7 theme toggle (light / dark / system).

## Skill gap

The plan calls for invoking `frontend:apply-mission-systems-ci` (bundled
styleguide, fonts, reference screenshots, Playwright check). That skill is
**not installed** in this repo (no plugin under `.agents` / Claude marketplaces
here). Implementation follows the same CI application already shipped in sister
products:

- Prepper `docs/completions/plan-29-mission-systems-ci.md` (three-tier tokens)
- Launchpad `docs/completions/mission-systems-ci-reskin.md` (Satoshi + palette)

Satoshi `.woff2` faces were **copied from Launchpad**
(`packages/web/public/fonts/Satoshi/`) into BrandFactory
`packages/web/public/fonts/satoshi/`.

## What shipped

### G1 — Identity + tokens (`packages/web/src/index.css`)

| Layer | Content |
| --- | --- |
| **Fonts** | Self-hosted Satoshi 300 / 400 / 400i / 500 / 700 via `@font-face` + `font-display: swap` |
| **Tier 1** | Brand `#1d3a2a`, warm ink ramp, beige surfaces, feedback hexes, input border `#807d76` |
| **Tier 2** | Role aliases (`--color-text-*`, `--surface-*`, `--border-*`, elevations) |
| **Tier 3** | shadcn bridge: `--primary`, `--card`, `--muted-foreground`, … rebind onto tier 2 |

Components keep using `bg-card` / `text-muted-foreground` / `bg-primary` etc.;
the whole tree inherits the CI without a class-by-class rewrite (same strategy
as Prepper).

**Type:** body 14px / 400 / 1.5; headings 500; `font-synthesis: none`.  
**Radii:** 8px functional default (`--radius`).  
**Canvas:** near-white sunken `#faf9f6` behind raised white cards (flat product
surface — no glass).

### Dark mode (plan requirement)

`.dark` re-points **tier 2 only** (and the tier-3 bridge that reads it). The
theme toggle, `localStorage['bf_theme']`, and `applyTheme` path are unchanged.
Primary stays forest-family (`#2a4f3a` on dark for contrast on near-black
surfaces). Feedback tones lighten for AA on dark surfaces.

### G2 — Shell polish

`routes/__root.tsx`:

- Wordmark: Satoshi medium 500, 15px  
- Header: `bg-card` on `bg-background` canvas + hairline border (raised chrome)  
- Slightly tighter horizontal gap (`gap-3`)

Cards, dialogs, login, settings, split-screen pick up palette/type via tokens
without per-file class edits.

### G3 — Playwright visual check

**Not run.** Playwright is not a dependency of this monorepo, and the skill’s
reference screenshots are unavailable without the plugin. Recommended follow-up:
install the `mission-systems/frontend` plugin skill and run its visual
verification CLI against light + dark.

### G4 — Component tests

No class-name assertion updates required. All existing web tests pass against
the new CSS (they assert roles / labels / behaviour, not palette classes).

## Verification

```
pnpm typecheck                          ✔  9/9
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  273 passed + 1 skipped
pnpm -F @brandfactory/web build         ✔
```

## Manual smoke (recommended)

With `pnpm dev` + seeded token:

1. Light mode: forest primary buttons, warm beige page, white cards, Satoshi.  
2. Cycle theme toggle → dark → system; no flash of wrong theme on reload.  
3. Workspace home cards + brand hub + dialogs + login read as one system.

## Phase 9 wrap-up

| Phase | Topic | Status |
| --- | --- | --- |
| A | Shared contracts | done |
| B | DB queries + seed | done |
| C | Server routes | done |
| D | App shell | done |
| E | Workspace home + brand hub | done |
| F | Rename / delete | done |
| G | Mission Systems CI | done (this file) |

Navigation redesign is complete end-to-end.
