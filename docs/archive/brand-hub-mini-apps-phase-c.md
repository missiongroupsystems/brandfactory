# Brand hub mini-apps — Phase C: Extract the guidelines editor

Status: **done**. Third phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Builds on [Phase A](./brand-hub-mini-apps-phase-a.md) and
[Phase B](./brand-hub-mini-apps-phase-b.md).

## Goal

De-risk the big Phase E rewrite by **moving working code before rewriting its
host**. The entire brand-guidelines editor (TipTap section list, dnd-kit reorder,
quick-add suggestions, `Cmd-S` save, `useUpdateBrandGuidelines`) lived inline in
`routes/brands.$brandId.tsx`. Phase E turns that route into a hub; if the editor
were still inline, that rewrite would be tangled up with editor logic. Extracting
it verbatim first means Phase E is **pure orchestration** — it only wires
components together.

## What changed

### C1 — `packages/web/src/components/brand/BrandGuidelinesEditor.tsx` (new)

Moved `LocalSection`, `EMPTY_DOC`, `toLocal`, `blankSection`, `SectionRow`, and
the form component **verbatim** out of `brands.$brandId.tsx`. The only change is
the export: `BrandEditorForm` → **`BrandGuidelinesEditor`** (same body, same
`{ brand }: { brand: BrandWithSections }` signature). No logic touched — drag
reorder, quick-add, `Cmd-S`, `useUpdateBrandGuidelines`, and the success/error
toasts all moved as-is. Imports were reconstituted at the top of the new module
(react hooks, `@tiptap/react`, `@dnd-kit/*`, lucide, sonner, shared types,
`AppError`, `useUpdateBrandGuidelines`, `defaultExtensions`, the UI primitives).

The `key={brand.id}` remount idiom at the call site is preserved — the editor
seeds its `useState` from `brand.sections` once, so it must remount when the
brand changes rather than trying to reconcile.

### C2 — `packages/web/src/components/brand/EditGuidelinesDialog.tsx` (new)

Wraps `BrandGuidelinesEditor` in the `Dialog` primitive. Props
`{ brand, open, onOpenChange }`, title **"Edit brand context"**, renders
`<BrandGuidelinesEditor key={brand.id} brand={brand} />`.

Deliberately **does not duplicate the save path**: the editor already owns its
Save button and `Cmd-S`, so the dialog footer is a single "Done"
(`DialogClose`) affordance. The content is widened (`sm:max-w-2xl`) and made
scrollable (`max-h-[85vh] overflow-y-auto`) because the section list can grow
tall, and `aria-describedby={undefined}` silences the Radix "missing description"
warning — the same idiom `NewProjectDialog` already uses.

This dialog has **no consumer yet** — Phase E's hub mounts it behind the context
bar's "Edit" button. It compiles as an exported module in the meantime.

### Host rewire — `packages/web/src/routes/brands.$brandId.tsx`

Per the plan's "cleanest" option (delete inline, import the new module so the
file compiles throughout), the ~235 lines of extracted editor code were removed
from this file and its now-dead imports pruned: `@tiptap/react`, all
`@dnd-kit/*`, `lucide-react` (`GripVertical`/`Trash2`), the guideline-only shared
types, `SUGGESTED_SECTIONS`, `useUpdateBrandGuidelines`, `defaultExtensions`,
`Button`/`Input`/`Label`, and the `useCallback`/`useEffect`/`useRef` hooks.
`BrandHubPage` now imports `BrandGuidelinesEditor` and renders it in the existing
`Guidelines` section (`<BrandGuidelinesEditor key={brand.id} brand={brand} />`).

Everything else in the route — identity header, the `Projects` section with
`NewProjectDialog`/`ProjectCard`, rename/delete dialogs, the `brandEditorRoute`
export and its `beforeLoad` auth guard — is untouched. Phase E is what replaces
the `Projects` strip with mini-app tiles and demotes guidelines into the context
bar; C only relocates the editor.

## Verification

```
pnpm -F @brandfactory/web typecheck     clean
pnpm -F @brandfactory/web lint          clean
pnpm -F @brandfactory/web test          84 passed (18 files)
prettier --check (new + changed files)  clean
```

Phase C gate (typecheck green) met, and the app stays fully green — lint, the
whole test suite, and formatting all pass. No test needed updating: the extraction
is behavior-preserving and no existing test imported the inline `BrandEditorForm`.

## Files touched

| Action | Path |
| --- | --- |
| New | `packages/web/src/components/brand/BrandGuidelinesEditor.tsx` (extracted verbatim) |
| New | `packages/web/src/components/brand/EditGuidelinesDialog.tsx` |
| Edit | `packages/web/src/routes/brands.$brandId.tsx` (remove inline editor, import module) |

No `shared` / `server` / `db` / `agent` changes.

## Next

Phase D — `components/brand/BrandContextBar.tsx`: the ambient, collapsible brand
context bar (section chips → read-only body panel, collapse to an icon rail, an
"Edit" button that opens `EditGuidelinesDialog`). Consumes `iconForSection` from
Phase B and `defaultExtensions` for the read-only editor.
