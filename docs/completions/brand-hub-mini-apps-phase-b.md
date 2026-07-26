# Brand hub mini-apps — Phase B: Registry + icon maps

Status: **done**. Second phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Builds on [Phase A](./brand-hub-mini-apps-phase-a.md).

## Goal

Land the pure-data spine the rest of the redesign hangs off: a declarative
mini-app registry and a section-label → icon map. No UI, no consumers yet — both
modules are dead code until Phase D/E/F import them. This isolates the "what are
the mini-apps and how do we classify threads" decision into one testable table
before any component touches it.

## What changed

### B1 — `packages/web/src/components/brand/guidelineIcons.ts` (new)

`iconForSection(label: string): LucideIcon` maps a brand-guideline section label
to a Lucide icon:

| Section label | Icon |
| --- | --- |
| Target audience | `Users` |
| Voice & tone | `MessageCircle` |
| Values & positioning | `Compass` |
| Visual guidelines | `Palette` |
| Messaging frameworks | `MessageSquareText` |
| _(anything else)_ | `FileText` |

The keys are the five `SUGGESTED_SECTIONS` labels from
`packages/shared/src/brand/suggested-categories.ts` — read from source, not
guessed, so they match verbatim (note the `&` in "Voice & tone" /
"Values & positioning"). The guideline-section schema accepts **any** user-typed
label, so the lookup is `.trim().toLowerCase()`-normalised and falls back to
`FileText` for custom labels rather than throwing or returning `undefined`.

### B2 — `packages/web/src/components/brand/miniApps.ts` (new)

The `MiniApp` type and the `MINI_APPS` table, plus `miniAppById(id)`:

| id | title | icon | create | enabled |
| --- | --- | --- | --- | --- |
| `copywriting` | Copywriting | `PenLine` | standardized / `'copywriting'` | **true** |
| `visual` | Visual identity | `Palette` | standardized / `'visual'` | false |
| `social` | Social calendar | `CalendarDays` | standardized / `'social'` | false |
| `freeform` | Open canvas | `Sparkles` | freeform | **true** |

Each entry carries a `match: (p: ProjectSummary) => boolean` predicate deciding
which existing threads belong under it.

## The load-bearing subtlety: discriminated-union narrowing

`ProjectSummary` = `ProjectSchema` (a `kind`-discriminated union of
`FreeformProjectSchema` | `StandardizedProjectSchema`) **intersected** with
`{ brandName, lastActivityAt }`. `templateId` lives **only** on the
`kind === 'standardized'` member. So every standardized `match` predicate narrows
on `kind` **before** touching `templateId`:

```ts
match: (p) => p.kind === 'standardized' && p.templateId === 'copywriting'
```

Reversing the order (`p.templateId === … && p.kind === …`) would not type-check —
TS does not see `templateId` on a bare `ProjectSummary`. The `freeform` entry
mirrors this with `p.kind === 'freeform'`. This is called out in the module doc
comment so a future edit doesn't "simplify" it into a type error.

## Why "Soon" tiles instead of omitting them

`visual` and `social` ship as registry rows with `enabled: false` rather than
being left out entirely. Per the plan, this makes them one-line promotions to
live later (flip `enabled`, build the bespoke UI) and lets the hub advertise the
roadmap. Their `create`/`match` descriptors are already correct, so when the
bespoke UIs arrive no registry surgery is needed.

## Verification

```
pnpm -F @brandfactory/web typecheck   clean
pnpm -F @brandfactory/web lint        clean
```

Phase B gate (typecheck green, no consumers) met. Lint was also run since both
files pull several named imports — clean, no unused-import fallout.

## Files touched

| Action | Path |
| --- | --- |
| New | `packages/web/src/components/brand/guidelineIcons.ts` |
| New | `packages/web/src/components/brand/miniApps.ts` |

No `shared` / `server` / `db` / `agent` changes.

## Next

Phase C — extract the guidelines editor (`SectionRow` + `BrandEditorForm` and
helpers) out of `routes/brands.$brandId.tsx` into
`components/brand/BrandGuidelinesEditor.tsx` **verbatim**, then wrap it in
`EditGuidelinesDialog.tsx`. The `miniApps` `match` predicates get their unit
tests in Phase G.
