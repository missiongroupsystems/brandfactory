# Vendored: Toolcraft

Upstream: [`pixel-point/toolcraft`](https://github.com/pixel-point/toolcraft)
@ `682a159f985af71798296f15c1cd6434b5fe7151` (2026-07-14). MIT, © Pixel Point —
licence text in [`LICENSE.md`](./LICENSE.md), retained verbatim as the licence
requires.

Toolcraft is a starter kit for building canvas-and-controls design tools. The
Studio mini-app is that surface, mounted inside a brand.

## Why vendored rather than depended on

Upstream ships as a **project generator** (`npx @pixel-point/toolcraft create`),
not a package — there is no published module to add to `package.json`. Vendoring
is the only way to consume it, so the tree is kept verbatim and the deltas below
are the entire diff against upstream.

`eslint.config.js` and `.prettierignore` both exempt this directory, each with
its reason written at the exemption. **`tsc` does not** — `pnpm typecheck`
covers this tree in full and passes.

## What was taken

| Upstream path | Here | Why |
| --- | --- | --- |
| `src/toolcraft/runtime/` | `runtime/` | The engine: canvas shell, panel host, state reducer, persistence, zoom, keyframes/timeline, PNG + video export |
| `src/toolcraft/ui/` | `ui/` | Primitives, panel chrome, and the ~20 control widgets (gradient, curves, colour, channel mixer, vector, anchor grid, font picker) |

## What was dropped

**`ui/components/composites/`** — 29 files, 4,390 lines. Accordion, alert-dialog,
avatar, breadcrumb, card, combobox, command, context-menu, dialog, dropdown-menu,
hover-card, menubar, navigation-menu, pagination, progress, radio-group,
resizable, sheet, sidebar, sonner, spinner, table, tabs.

Nothing outside that directory imported it — the runtime reaches the UI kit
through six files, and every one of them pulls only primitives, panel chrome and
controls. The composites arrived solely because `ui/index.ts` re-exported them.

They are also the half that would have *hurt*: a second `Dialog`, `Sidebar`,
`Table`, `Tabs` and `Sonner` living beside the Radix ones in
`components/ui/`, which is how a codebase ends up with two answers to "which
dialog do I import". The one-line `export * from "./components/composites"` in
`ui/index.ts` is removed to match.

Dropping them also removed `cmdk` and `react-resizable-panels` from the
dependency list entirely. Three new deps remain: `@base-ui/react`,
`@phosphor-icons/react`, `motion`.

## Local deltas

Beyond the composites deletion and its barrel line, **23 one-line type guards**,
all of them the repo's `noUncheckedIndexedAccess` (upstream does not set it).
No behaviour is changed: every guard returns the value the surrounding code
already assumed, and each follows an idiom upstream already uses nearby.

| File | Sites |
| --- | --- |
| `ui/components/controls/curves/curve-geometry.ts` | 13 — an early `return ""` in `getCurveSegmentPath`, `?? point` fallbacks, and a `first` hoist in both tangent functions |
| `runtime/react/controls-panel.tsx` | 5 — `isBooleanControl` became a type predicate (which narrows the four call sites downstream), and one `Boolean(x) &&` became `x !== undefined &&` because `Boolean()` is not a type guard |
| `runtime/react/timeline-panel.tsx` | 2 — `?? point` on paired bezier control-point reads |
| `ui/components/controls/vector/vector-control.tsx` | 1 — `undefined` check on a destructured regex match, returning the `null` the function already returns for a short match |
| `ui/components/controls/file-drop/file-drop-control.tsx` | 1 — guard the single-file branch |
| `runtime/schema/define-toolcraft.ts` | 1 — `?? ""` |

## Re-syncing with upstream

Clone upstream at the new ref and diff `src/toolcraft/` against this directory.
The deltas above are the only expected differences; anything else is drift worth
looking at. Re-apply the composites deletion, then run `pnpm typecheck` — new
`noUncheckedIndexedAccess` sites are the failure mode to expect.
