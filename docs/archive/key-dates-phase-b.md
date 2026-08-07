# Phase B — colour tokens and the appearance map

**Status:** complete, 2026-08-06. Written against `main` at **1.22.1** + Phase A
(1560 passed | 68 skipped before this phase; the skips are the live-Postgres
suites).

Executes Phase B of
[`docs/executing/key-dates-implementation-plan.md`](../executing/key-dates-implementation-plan.md),
following [Phase A](key-dates-phase-a.md). The *why* is argued in
[the proposal's §6](../executing/key-dates-on-the-social-calendar.md); this file
records what was written, the six measured ratios B5 asks for, and one finding
the plan did not ask for.

**No migration, no route, no component, no behaviour change.** Phase B is
vocabulary again — the colours the next three phases speak in. 2 files added,
1 modified (+68 lines of CSS), +7 tests. Nothing renders any of it.

---

## 1. What was built

Three set colours, threaded through all four tiers of `index.css` exactly as the
existing `--fb-*` block is:

```
TIER 1   --c-violet-600/-50        raw hex, light      the only place a hex lives
         --c-dark-violet-300/-900  raw hex, dark
   ↓
TIER 2   --color-dateset-global          the only layer .dark re-points
         --color-dateset-global-tint
   ↓
hop      --ds-global / --ds-global-tint  inside @layer base :root
   ↓
@theme   --color-keydate-global         → text-keydate-global
         --color-keydate-global-tint    → bg-keydate-global-tint
```

Plus `lib/key-dates/appearance.ts` — one exhaustive
`Record<KeyDateSet, { label, dot }>` of complete class strings.

| Set | Hue | Light ink / tint | Dark ink / tint |
| --- | --- | --- | --- |
| `global` | Violet | `#5b4a7a` on `#f0edf6` | `#a99ac9` on `#282338` |
| `sg-holidays` | Rose | `#8f3f63` on `#fbeef3` | `#d18aa6` on `#38222c` |
| `sg-events` | Teal | `#1f5f66` on `#e9f3f3` | `#6fb3ba` on `#172e30` |

The proposal's starting values shipped unchanged — see §2.

## 2. B5 — the six ratios, measured

The task says record them, "because a number nobody wrote down is a number
nobody checked". Label ink on its own tint, computed by the WCAG 2.x relative
luminance formula. **The bar is 4.5:1**, which is what
`--color-feedback-error-on`'s comment already holds itself to.

| Theme | Set | Ink on tint | Ratio | |
| --- | --- | --- | --- | --- |
| Light | `global` | `#5b4a7a` on `#f0edf6` | **6.71:1** | pass |
| Light | `sg-holidays` | `#8f3f63` on `#fbeef3` | **6.09:1** | pass |
| Light | `sg-events` | `#1f5f66` on `#e9f3f3` | **6.44:1** | pass |
| Dark | `global` | `#a99ac9` on `#282338` | **5.87:1** | pass |
| Dark | `sg-holidays` | `#d18aa6` on `#38222c` | **5.51:1** | pass |
| Dark | `sg-events` | `#6fb3ba` on `#172e30` | **6.01:1** | pass |

**All six cleared on the proposal's starting values, so no tier-1 hex was
adjusted.** The margin is comfortable — the worst pair sits 22% above the bar,
and every pair would still pass at AAA for large text (4.5) though none reaches
AAA for body text (7.0), which is the same standing the existing feedback tints
have.

Two more measurements, not asked for but cheap once the first six exist:

- **The dot swatch against the popover surface it sits on** — 6.21:1 to 7.76:1
  across both themes. The bar for a non-text UI element is 3:1, so the menu's
  swatches are not marginal.
- **The tint against the surface behind it** — 1.09:1 to 1.16:1. Deliberately
  low: a marker tint is a wash, not a border. It is worth stating because it
  means **the tint alone never delimits anything** — the marker is legible
  because of its ink, and a reader who cannot see the wash loses nothing but the
  category cue, which is carried in text anyway.

## 3. The finding the plan did not ask for

The proposal says colour must never be the only signal because "three tinted
labels are indistinguishable to a reader with deuteranopia". That was an
assertion. It is now a measurement, and **it is correct — more so than the
sentence suggests.**

Pairwise CIELAB ΔE between the three inks, under normal vision and under
simulated dichromacy (Viénot LMS method):

| Pair | Normal | Protanopia | Deuteranopia | Tritanopia |
| --- | --- | --- | --- | --- |
| violet vs rose | 28.4 | 15.0 | 25.9 | 53.5 |
| violet vs teal | 38.6 | 22.2 | **13.6** | 64.2 |
| rose vs teal | 55.7 | **8.4** | **12.8** | 115.9 |

(Light inks; the dark inks behave the same way — rose vs teal falls to 9.7 under
protanopia.)

Under normal vision the triad is well separated: the closest pair, violet and
rose, sits at ΔE 28. **Under protanopia rose and teal collapse to ΔE 8.4**,
which is near the threshold of "same colour, slightly different". That is
structural, not a bad choice of hex: rose and teal sit on opposite ends of the
red–cyan axis, which is precisely the axis red–green colour blindness flattens.
No three-hue palette avoids it without spending lightness, and lightness is
already committed to the 4.5:1 contrast bar.

**So the triad ships as approved, and the non-colour signals stop being a
nicety.** They are the actual mechanism by which roughly 8% of male readers tell
these three sets apart:

- the marker's accessible name includes the set,
- the list block groups under a named heading per set,
- the menu row pairs each swatch with its label and description.

This is recorded rather than acted on because the triad is a locked decision
(plan §"Locked before the first line") and the plan's own bar was contrast, which
it clears. **Phase F should look at rose and teal side by side specifically** —
it is the pair most likely to send the palette back, and the plan already notes a
re-tune is six lines in tier 1. If it does come back, the cheapest fix that
preserves three hues is to widen the lightness gap between `sg-holidays` and
`sg-events` rather than to rotate either hue.

## 4. Decisions the plan left to the implementation

### The dark primitives invert their numbering, and say so

The plan names them `--c-dark-violet-*` without fixing the suffix. The light
ramp uses `-600` for ink and `-50` for tint, following the feedback primitives.
Reusing those numbers in the dark set would put a near-white (`#a99ac9`) under a
name ending `-600`, when every other `-600` in the file is a dark ink.

So the dark set tracks **lightness**, the convention `--c-dark-ink-100/-300/
-500/-700` already established two blocks above: `-300` is the light ink, `-900`
is the dark tint. The roles invert against the light ramp, and a comment at the
block says why, so nobody helpfully renumbers it back.

### The dark values are tier-1 primitives, not inline hexes

The `.dark` block re-points surfaces and text through `var(--c-dark-*)`, but
re-points the four feedback pairs with **raw hex written inline**
(`--color-feedback-error: #e08a7c`). Two precedents, and they disagree.

Phase B follows the tier-1 rule the file states in its own header — *the ONLY
place a raw hex may live* — rather than the feedback block that predates it. Six
new primitives, `.dark` re-points through them, and no hex appears below tier 1.

**The feedback block was left alone.** It is a pre-existing inconsistency, it is
not this phase's to fix, and a drive-by edit to four colour pairs is exactly the
kind of thing that turns a colour-token diff into something nobody can review.
Noted here so it is a known deviation rather than a discovery.

### Tier-2 names match `KeyDateSet` verbatim

`--color-dateset-sg-holidays`, not `--color-dateset-holidays` or
`--color-dateset-sgHolidays`. The CSS alias and the TypeScript union member are
the same string, so `appearance.ts`'s class strings can be read straight against
the stylesheet, and `data.test.ts`'s exhaustiveness check over `KEY_DATE_SETS` is
checking the same list the CSS declares.

### `dateset-` at tier 2, `keydate-` at `@theme`

The two must differ or the `@theme` entry resolves to itself — Tailwind owns the
`--color-*` namespace, so `--color-keydate-global: var(--color-keydate-global)`
is what a matching pair would compile to. `--fb-*` → `--color-status-*` is the
precedent, and the comment points at it.

### The label and the dot are different shapes

`label` is two classes (tint background **and** ink); `dot` is one (a solid
fill). A dot has no text, so it needs no text colour, and it is a swatch rather
than a wash, so it uses the ink value rather than the tint. The test pins both
shapes, not just non-emptiness.

## 5. The files

| File | Change |
| --- | --- |
| `packages/web/src/index.css` | +68 lines: 6 light primitives, 6 dark primitives, 6 tier-2 aliases, 6 `.dark` re-points, 6 hop variables, 6 `@theme` entries |
| `packages/web/src/lib/key-dates/appearance.ts` | **new** — `KEY_DATE_APPEARANCE` |
| `packages/web/src/lib/key-dates/appearance.test.ts` | **new** — 7 tests |
| `packages/web/src/lib/key-dates/index.ts` | `export * from './appearance'` |

## 6. What the 7 tests hold

The plan budgeted ~2. The extra five are not padding — three of them pin a
failure mode that renders perfectly and lies:

**Every class string names its own token.** The guard against a copy-paste
leaving `sg-events` pointing at the rose hue: the calendar would render, the
colours would be pretty, and the legend would be wrong.

**Each set's strings are distinct.** The same failure from the other side — two
sets sharing a hue is caught even if both correctly name *a* token.

**No class string contains `${`.** Tailwind scans source text for whole class
names, so `bg-keydate-${set}-tint` produces no CSS and fails silently as a
colourless pill rather than as a build error. This is the one rule in
`appearance.ts` whose violation is invisible in review, so it is asserted.

**The shapes are pinned, not just the presence** — `label` must carry both
`bg-…-tint` and `text-…`, `dot` must be exactly `bg-…`.

**The map is indexable by a set that came from a string, not a literal** — the
lookup Phase C's `localStorage` reader will feed it.

## 7. Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1567 passed | 68 skipped (139 files)
pnpm -F @brandfactory/web build   clean in 537ms
```

Repo-wide **1560 → 1567 (+7)**, 138 → 139 files. **No existing test changed.**

### The tokens were verified in the built CSS, not just in the source

A `@theme` entry that is self-referential, or a class string Tailwind never
scans, both fail *silently* — the stylesheet simply lacks a rule. So the built
output was read rather than the input trusted. All nine utilities are emitted:

```
.text-keydate-global{color:var(--ds-global)}
.bg-keydate-global-tint{background-color:var(--ds-global-tint)}
.bg-keydate-global{background-color:var(--ds-global)}
…and the six siblings
```

and the chain resolves through all four tiers, with the light and dark values
landing in the right selectors:

```
:root   --c-violet-600:#5b4a7a  →  --color-dateset-global:var(--c-violet-600)
.dark   --color-dateset-global:var(--c-dark-violet-300)   [#a99ac9]
        --ds-global:var(--color-dateset-global)
```

`--color-keydate-*` correctly appears in **no** declaration — `@theme inline`
inlines the value into the utility, which is what `inline` means and what the
`--fb-*` → `--color-status-*` pair already does.

That the utilities exist at all is also the proof B6's complete-strings rule
works: nothing in `components/` mentions them, so the only text Tailwind could
have scanned them from is `appearance.ts`.

### Acceptance

```
grep -rn 'keydate-' packages/web/src/components/   → nothing
grep -rn 'KEY_DATE_APPEARANCE' packages/web/src    → appearance.ts, appearance.test.ts
```

Nothing renders these yet, as the phase requires.

## 8. Carried forward

- **Phase D is the first phase that can see any of this.** A–C are all dark;
  the colours exist, are correct in both themes, and are reachable from no
  screen.
- **Rose vs teal under protanopia (§3) is the one thing to look at in Phase F**,
  ahead of the general "are the three hues distinguishable" check the plan
  already lists.
- **The feedback block's inline dark hexes** (§4) remain a pre-existing tier-1
  violation. Not this phase's to fix; worth a line in a future CI pass.
- **`appearance.ts` has no `strip` or `band` entry.** `label` and `dot` cover
  the five surfaces the proposal names; if Phase D finds the season band wants a
  third shape, it belongs in this map rather than in the component.

## 9. Caveats

- **Nothing was looked at in a browser.** The ratios are computed, the CSS is
  verified to compile and resolve, and no human eye has seen these three colours
  next to each other. That is Phase F, and it is non-skippable for exactly this
  reason — §3 is a measurement of a real risk, not a reassurance.
- **The contrast figures are WCAG 2.x**, which is known to overstate legibility
  for some mid-tone pairs. APCA would be the better instrument; the repo's
  existing bar is stated in WCAG terms (`--color-feedback-error-on`'s comment),
  and using a second scale for one feature would make the two uncomparable.
- **The dichromacy simulation is an approximation.** Viénot's linear LMS method
  models the three classical dichromacies; it says nothing about the far more
  common *anomalous trichromacies*, where separation is better than these
  numbers but still reduced. The direction of the finding holds; the exact ΔE
  figures should not be quoted as though they described every reader.
