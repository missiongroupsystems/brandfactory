import { Editor } from '@tiptap/core'
import type {
  BrandGuidelineSection,
  ProseMirrorDoc,
  ResearchDraft,
  UpdateBrandGuidelinesInput,
} from '@brandfactory/shared'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import type { StagedSection } from '@/components/brand/BrandGuidelinesEditor'

// ---------------------------------------------------------------------------
// Research drafts → the two shapes the guidelines layer accepts
// ---------------------------------------------------------------------------
//
// 3D produces `{ label, html, text, sources }`. Two things can happen to that,
// and this module is both of them — deliberately in one file, because the whole
// point of decision E is that they are *the same content down two paths*:
//
//   empty brand      → `draftsToSections`  → written, with an Undo (E1)
//   curated brand    → `draftsToStaged`    → offered to the editor  (E2)
//
// **Neither path parses markdown, and neither writes HTML.** The `{ html, text }`
// pair is 1.5.0's `CapturePayload`, and the only thing in this app that has ever
// turned it into a document is a TipTap editor running `defaultExtensions`.
// E2 keeps that literally — the payload goes through the staging channel and is
// parsed by the row's own live editor. E1 has no editor on screen to parse it,
// so it makes one.

/**
 * The headless parse.
 *
 * A **fourth** TipTap instance, joining the section rows, the canvas text
 * blocks and the chat-capture path — and the first with no element behind it.
 * It exists because E1 writes to the server without the editor ever being
 * opened, and `PATCH /brands/:id/guidelines` takes a `ProseMirrorDoc`, not
 * HTML. Round-tripping through the same extension set is what guarantees the
 * document E1 saves is byte-identical to the one E2 would have produced had you
 * accepted the same draft by hand.
 *
 * One instance for the whole list, not one per draft: `setContent` replaces the
 * document, `getJSON` reads it back, and the schema is the invariant part.
 * `emitUpdate: false` because nothing is subscribed and the callback would be a
 * write into a component that is not rendering.
 */
function parseDrafts<T>(
  drafts: ResearchDraft[],
  build: (draft: ResearchDraft, body: ProseMirrorDoc, index: number) => T,
): T[] {
  const editor = new Editor({ extensions: defaultExtensions, content: '' })
  try {
    return drafts.map((draft, i) => {
      // `html` is the rich half and `text` the fallback, the same precedence
      // `SectionRow`'s insert path uses. A draft with neither is not dropped
      // here — 3D already drops empty bodies, and silently discarding a labelled
      // section at the last step would be the one failure that looks like
      // success.
      editor.commands.setContent(draft.html || draft.text, { emitUpdate: false })
      return build(draft, editor.getJSON() as ProseMirrorDoc, i)
    })
  } finally {
    // Detached or not, it holds a ProseMirror view and a plugin set.
    editor.destroy()
  }
}

/**
 * E1's payload: the brand's complete section list, as `PATCH` wants it.
 *
 * **`createdBy: 'agent'` — the enum value's first producer.** It has been in the
 * schema since 0.3.0 and in the wire contract since Stage 1B, which shipped
 * ahead of this phase precisely so that the first thing to write it would not
 * have its answer rewritten on the user's next save.
 *
 * Called only on a brand with no sections (that is what makes E1 E1), so the
 * priorities start at 1000 and the list is complete by construction.
 */
export function draftsToSections(drafts: ResearchDraft[]): UpdateBrandGuidelinesInput['sections'] {
  return parseDrafts(drafts, (draft, body, i) => ({
    label: draft.label,
    body,
    priority: (i + 1) * 1000,
    createdBy: 'agent' as const,
  }))
}

/**
 * E2's payload: drafts on their way into the open editor, unsaved.
 *
 * Order is the order the sheet presented them in, which is the order the model
 * produced. Nothing here is written — the editor appends a row per item and you
 * name, trim and save them yourself, which is the property that lets the review
 * sheet have no writer of its own.
 *
 * `createdBy: 'agent'` for the same reason as E1, and this is the asymmetry it
 * closes: the same five drafts must not record a different author depending on
 * whether the brand you dropped them into happened to be empty. Tidying the
 * prose afterwards does not flip it — see `LocalSection.createdBy`.
 */
export function draftsToStaged(drafts: ResearchDraft[]): StagedSection[] {
  return drafts.map((draft) => ({
    label: draft.label,
    payload: { html: draft.html, text: draft.text },
    createdBy: 'agent' as const,
  }))
}

/**
 * Is this still exactly the list we wrote?
 *
 * The guard on E1's Undo, and the reason Undo is allowed to be a *full-list
 * write of `[]`* rather than a surgical removal. Between the toast appearing
 * and it being clicked, the user can open the editor and save — at which point
 * `[]` stops meaning "take back what research added" and starts meaning "delete
 * the brand's guidelines", which is decision 8's wipe with a friendly label on
 * it.
 *
 * Ids **and** `updatedAt`, in order: ids alone would miss an edit to a body,
 * which is the likeliest thing to happen in the seconds a toast is on screen.
 */
export function sectionsUnchanged(
  current: readonly BrandGuidelineSection[],
  written: readonly BrandGuidelineSection[],
): boolean {
  if (current.length !== written.length) return false
  return current.every((s, i) => s.id === written[i]?.id && s.updatedAt === written[i]?.updatedAt)
}
