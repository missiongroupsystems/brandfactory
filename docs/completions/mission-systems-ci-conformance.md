# Mission Systems CI conformance — the drift since 1.2.0

**Shipped:** 2026-07-29 · `packages/web` only · **456 tests, unchanged** ·
19 files, +89 / −31

## The report

Not a bug report — the `frontend:apply-mission-systems-ci` skill, run against the
repo with no named target. The skill's own instruction is *"find the target — the
file/component/page the user named, or the current `git diff`"*, and the working
tree was docs-only, so the target became **the whole of `packages/web` audited
against the bundled styleguide**.

That framing matters for what this pass is. It is not a redesign and it changes
no layout decision any previous pass made. It is a **conformance sweep**: the
styleguide is a contract, 1.2.0 signed it, and four feature passes have shipped
since without re-reading it.

## What was actually wrong

1.2.0 applied the CI to `packages/web` — self-hosted Satoshi, three token tiers
in `index.css`, six `components/ui` primitives re-specced. **That spine is
intact**, and the audit is worth recording as much for what it cleared as for
what it caught:

| Checked | Result |
| --- | --- |
| Raw `#hex` in any component | **zero** |
| Raw `--c-*` primitive read from a component | **zero** |
| Satoshi self-hosted, five weights, `font-display: swap` | correct (§1.1) |
| `:focus-visible` ring, `prefers-reduced-motion`, `tabular-nums` | all present in `@layer base` (§10.2, §14, §5.3) |
| `button` · `input` · `card` · `label` · `select` · `dialog` | already to spec |
| Body weight 400, 8px controls, 1px `--border-input` | correct (§0.7, §9, §3.4) |

What had drifted is everything built **after** 1.2.0 — the 1.4.0 hub, 1.5.0
capture, 1.6.0 switcher, 1.7.0 restructure — plus **three `components/ui`
primitives the 1.2.0 pass never reached**. Its changelog line says "six
primitives"; the directory holds nine. `alert-dialog`, `dropdown-menu` and
`sonner` were the three left behind, and two of them had shipped visible
defects.

Four violation classes, all verified by grep before anything was edited:

1. **Two uppercase strings** (§0.4). The CI permits caps in exactly one place —
   side-nav section eyebrows. This app has **no side nav**, so its correct
   uppercase count is zero.
2. **Ten call sites overriding the type scale** (§5.1, §5.2), nine of them `h1`.
3. **Seven raw Tailwind shadows and six wrong radii** (§8, §9).
4. **Four accent spends outside the named roles** (§4).

## The load-bearing decision

**The type scale moves into `@layer base`, so a call site cannot restate it.**

Everything else in this pass is an enumerated fix. This is the only structural
choice, and it is the one that decides whether the pass holds.

`index.css` already carried `h1..h4 { font-weight: 500 }` — the rule was written
down and correct. Ten call sites were overriding it anyway with
`text-2xl font-semibold`, and they were wrong on **three** axes at once, not one:

| | Spec (§5.2 page title) | What the call sites said |
| --- | --- | --- |
| weight | 500 | `font-semibold` → **600** |
| line-height | 1.25 | `text-2xl` → **1.333** |
| tracking | −0.015em | `tracking-tight` → **−0.025em**, or absent |

Exactly one file had it right: `login.tsx`, hand-written as
`text-2xl font-medium tracking-[-0.015em]`. One correct instance out of ten is
the diagnosis — **the scale was reachable only by remembering it**, and nine
routes did not.

So the base layer now carries the full h1/h2/h3 spec and the call sites drop the
utilities. `<h1>{brand.name}</h1>` renders to spec because it is an `h1`, not
because someone recalled three values. A heading that genuinely wants to differ
still overrides with a utility, which is the normal cascade — the difference is
that overriding is now a **decision** rather than the only way to get the
default.

This is the same argument the token tiers already make one layer down (§2): a
component reading a raw hex is a bug *because* the correct value should not
require recall. A heading restating the scale is that bug in typography.

**Why not just swap `font-semibold` → `font-medium` in ten files.** It fixes the
weight and leaves line-height and tracking wrong in all ten, and the eleventh
route written next month starts from the same blank slate. The cheap fix
addresses the symptom the grep found; it does not address why the grep found ten.

## What shipped

### §0.4 — the one uppercase rule

- **`MiniAppTile`** — the `Soon` pill was `text-[10px] uppercase tracking-wide`.
  Now 12px/500 sentence case (§5.2 caption, §12.4 badge). Its neutral-beige fill
  was already right.
- **`ProjectCard`** — the kind badge, same three faults, plus a bare `border`
  where §12.4 asks for a **neutral beige pill**. `kind` arrives lowercase off the
  wire (`'freeform' | 'standardized'`), so `capitalize` is what makes it a
  sentence rather than dropping it to lowercase.
- **`Workspace Settings`** → `Workspace settings`; the settings source badge's
  `workspace setting` / `env default` → sentence case.

### §5.1 / §5.2 — the type scale

`index.css` gains h1 (24/1.25/−0.015em), h2 (20/1.3/−0.01em), h3
(16/1.35/−0.005em) alongside the existing weight-500 rule. Nine `h1` call sites
drop `text-2xl font-semibold tracking-*`; `login.tsx` drops its correct-but-manual
version too, because a hand-copied right answer is still a place to drift from.

Two non-heading weights: `AlertDialogTitle` `font-semibold` → `font-medium`,
matching `DialogTitle`, which 1.2.0 had already fixed; `BrandCard`'s brand name
→ `font-medium` (§5.2 card title is 500).

**`BrandMark` keeps `font-semibold`, deliberately.** A monogram inside a coloured
tile is brand chrome (§7.2's logo tile / avatar), not a typographic role, and its
weight is doing optical work at 14–56px against a tinted fill. Left alone rather
than swept up by a grep.

### §8 / §9 — elevation and radii

`shadow-sm`/`md`/`lg` are Tailwind's **black-based** defaults. §8's ramp is
ink-tinted (`rgba(23,23,23,…)`) and never black — the whole point of a warm
neutral system is that its shadows are warm too.

| Surface | Before | After |
| --- | --- | --- |
| `BrandCard` · `ProjectCard` · `MiniAppTile` | `rounded-lg` (8px, the *button* radius) + `shadow-sm` | `rounded-xl` (12px, §9 cards) + `shadow-elevation-1` |
| `DropdownMenuContent` · `SubContent` | `rounded-md` (6px, the *tooltip* radius) + `shadow-md`/`lg` | `rounded-xl` (12px, §12.7) + `shadow-elevation-2` |
| Dropdown menu **items** (×4) | `rounded-sm` (4px) | `rounded-lg` (8px, §9 functional default) |
| `MessageCapture` floating button | `rounded-md` + `shadow-md` | `rounded-lg` + `shadow-elevation-2` |
| `Toaster` | sonner's own shadow | `rounded-xl` + `shadow-elevation-2` (§12.7) |

### `alert-dialog` — the one real visual bug

Not a token-purity nit. `AlertDialogContent` was `bg-background`, and in this
repo's tier-3 map `--background: var(--surface-sunken)` — the **sunken page
canvas**, `#f6f5f1`. `DialogContent` is `bg-popover` = `--surface-overlay` =
white.

So the app had two modal types rendering on two different surface colours, and
the beige one is the **destructive-confirmation** path (`DeleteBrandDialog`,
`DeleteProjectDialog`) — a warm grey card floating over a scrim, next to white
cards everywhere else. Alongside it: `bg-black/50` where §12.6 specifies ink at
32% (a cold veil over a deliberately warm ramp), 8px radius where §9 says 16,
and `shadow-lg` where §8 says `elevation-3`.

All four now match `dialog.tsx` exactly, which is the point — two components
implementing one spec should be diffable.

### §4 — accent budget

The accent is spent on a **fixed, named set**: primary button, one hero metric,
active/selected state, small brand chrome. Four spends fell outside it:

- **`SourceBadge`** (settings) — `bg-primary/10 text-primary`. A 10% accent tint
  is not a colour the palette contains, and a badge is not a named accent role.
  *Where did this value come from* is an **informational** distinction, so it
  takes the `info` tint (§3.3); the fallback stays the neutral beige pill §12.4
  reserves for plain states.
- **`BrandGuidelinesEditor`** quick-add chips — `hover:border-primary
  hover:text-primary`. Hover is a **surface** change (§10.1), not an accent one.
  A row of chips that all turn green on the way past spends the accent on
  nothing.
- **`SplitScreen`** resize handle — `hover:bg-primary/40` → `--border-strong`,
  which is the token for exactly "border, emphasised".
- **`FileBlockView`** download link — `text-primary` is the button *fill* token;
  §3.1 gives standalone links `--color-text-link`. Identical in light, and the
  two are meant to be re-pointable independently (§16).

**Left alone, because they are the budget working.** `ShortlistToggle`'s
accent-filled selected segment is §12.5 verbatim. `AuthBoundary`'s spinner is
§12.8's "thin accent arc". The canvas and guidelines-editor drop targets are the
active-state role. `BrandMark`'s hue is the *customer's* brand, not the product's
accent — the argument 1.7.0 recorded, unchanged.

Accent inventory now, per view: primary button, selected segment, spinner, drop
target, brand monogram. Nothing else.

## Verification

```
pnpm typecheck                          9/9 workspaces
pnpm lint / format:check                clean
pnpm test                               446 passed | 10 skipped (456)
pnpm --filter @brandfactory/web build   ok
```

**456 → 456. No test was added, edited, or deleted.**

That is the intended result and it is load-bearing evidence, not a gap: every
change here is a class name or a CSS rule, and a styling pass that churns
behavioural tests has changed behaviour. The 456 passing unedited is the check
that it did not. Two suites were the specific risk — `MiniAppTile` (6 tests,
asserts the `Soon` affordance) and `ProjectCard` (4 tests) — because both had
their badge markup rewritten; both assert on **text and role**, not class names,
so both passed untouched. A grep confirmed no test in the repo pins
`font-semibold`, `uppercase`, `shadow-sm` or `text-2xl`.

The 10 skips are the live-Postgres suites (no Docker daemon). This pass touches
no `db` or `server` code.

## Caveats

**Nothing was rendered. The live pass was skipped by decision.**

Playwright was not installed and Docker was down, so the two honest options were
a mocked-API Playwright run or nothing. The mocked run was chosen and then
abandoned: `npm install -D @playwright/test` fails in this repo with
`EUNSUPPORTEDPROTOCOL` on a transitive `link:` dependency, pnpm being the package
manager. Nothing was left behind — no `package-lock.json`, no change to
`package.json` or `pnpm-lock.yaml`; npm aborted before writing. Verification was
then skipped rather than pursued further.

So, stated the way 1.6.0 and 1.5.1 state theirs — **reasoned, not observed:**

- **The `alert-dialog` surface fix is the one worth looking at first.** It is the
  only change with a visible before/after that is not a couple of pixels, and it
  is the only one whose *current* state was demonstrably wrong rather than merely
  off-spec.
- **The sonner change is the least certain.** `toastOptions.className` composes
  with sonner's own stylesheet, and whether `shadow-elevation-2` actually beats
  its built-in `box-shadow` is a specificity question a screenshot answers and
  reading does not.
- **Pill sizing and card radii moved by 2–4px** across every card surface in the
  app. Individually invisible, collectively the thing the CI is for, and entirely
  unverified.
- **Both themes are unverified.** Every token used here already has a `.dark`
  re-point, and no new primitive was added, so dark mode should follow by
  construction — but §16's promise is exactly the kind that is worth testing once
  rather than trusting forever.

Two things were **seen and left**, so they read as decisions:

- **`RouteError.tsx` renders `<h1 className="text-lg font-medium">`** — an 18px
  page title. It is an error-boundary card, not a page, and the override is now
  explicit against a base rule rather than one of ten identical hand-rolled
  values. Kept.
- **Section labels are `<h2 className="text-sm font-medium text-muted-foreground">`**
  on the hub, workspace home and mini-app pages — 14px where §5.2's H2 is 20px.
  This is a 1.4.0/1.7.0 layout decision, not CI drift, and the base rule leaves
  it alone because the utility overrides it. Changing it is a design change and
  belongs to whoever is redesigning those pages, not to a conformance sweep.

**Not addressed: the mono face** (§5.4). `--font-mono` is wired to a system stack
and nothing in the product currently surfaces an ID, SKU or code block, so there
is no call site to give it. It becomes real the first time one exists.

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`, `packages/adapters/*`. No migration, no wire-contract change,
no API route, no new dependency.

## Interaction with the open plans

- **`docs/plans/brand-hub-fe-mockup.md`** — its P0 seam (`BrandHubView` + a
  DEV-gated `/demo/brand`) is the mechanism that would let this pass, and the two
  backend passes behind it, be screenshotted inside the **real** app shell
  without a database. That is the standing answer to every caveat above, and it
  is the reason this pass did not build a second throwaway harness: 1.7.0 already
  bought that caveat once.
- **`docs/plans/brand-assets.md`** — unaffected. Nothing here constrains where
  brand colours land, and `BrandMark`'s doc comment still promises the same
  swap from derived to declared fill.
