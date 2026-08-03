import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AutofillSectionResult,
  BrandGuidelineSection,
  BrandWithSections,
  GuidelineSectionCreatedBy,
  ProseMirrorDoc,
  SectionId,
  UpdateBrandGuidelinesInput,
} from '@brandfactory/shared'
import { sameSectionLabel, SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useUpdateBrandGuidelines } from '@/api/queries/brands'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import {
  hasCaptureData,
  readCaptureTransfer,
  type CapturePayload,
} from '@/components/project/MessageCapture'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Local state model
// ---------------------------------------------------------------------------

type LocalSection = {
  _key: string // stable React key: actual id for persisted, temp uuid for new
  id?: string
  label: string
  body: ProseMirrorDoc
  priority: number
  /**
   * Carried through local state rather than re-derived at save time, because
   * this form round-trips the brand's *complete* section list: a section this
   * editor merely re-sends must go back with the author it arrived with. The
   * only place the literal `'user'` appears on the client is `blankSection`.
   *
   * Editing an agent-written section does **not** flip it to `'user'`. The
   * field records who produced the section, which is what makes Stage 3E's
   * "these five came from research" legible after you have tidied their prose.
   */
  createdBy: GuidelineSectionCreatedBy
}

const EMPTY_DOC: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

/**
 * Is this body the empty doc — the state auto-fill is allowed to write into?
 *
 * Deliberately strict (decision 5 / Q2): only paragraphs with no content count
 * as empty, so anything the user has typed — or anything that is not plain
 * empty paragraphs — keeps its row's sparkle away. Filling a non-empty row
 * means replace/append/merge semantics and an undo; the lazy-populate case is
 * by definition the empty row, and the cheap escape hatch is deleting the body.
 */
function isEmptyDoc(doc: ProseMirrorDoc): boolean {
  const content = (doc as { content?: unknown[] }).content
  if (!content || content.length === 0) return true
  return content.every((node) => {
    const n = node as { type?: string; content?: unknown[] }
    return n.type === 'paragraph' && (!n.content || n.content.length === 0)
  })
}

function toLocal(s: BrandGuidelineSection): LocalSection {
  return {
    _key: s.id,
    id: s.id,
    label: s.label,
    body: s.body,
    priority: s.priority,
    createdBy: s.createdBy,
  }
}

function blankSection(label = '', createdBy: GuidelineSectionCreatedBy = 'user'): LocalSection {
  return { _key: crypto.randomUUID(), label, body: EMPTY_DOC, priority: 0, createdBy }
}

/**
 * One thing on its way into a new section, unsaved.
 *
 * **A list of these is what `staged` carries, and the list is the Stage 3E
 * change.** 1.5.0 opened this channel for a single captured message, which is
 * why it was one `CapturePayload`; the research review sheet accepts several
 * drafts at once and staging them one at a time would make "accept selected"
 * mean "accept the first of the selected".
 *
 * `label` and `createdBy` are optional because the capture gesture has neither:
 * a message you drag out of a thread has no name until you give it one, and it
 * is **yours** — you curated it, the agent did not write it here. Research
 * supplies both.
 */
export interface StagedSection {
  label?: string
  payload: CapturePayload
  createdBy?: GuidelineSectionCreatedBy
}

// ---------------------------------------------------------------------------
// SectionRow — one editable guideline section
// ---------------------------------------------------------------------------

function SectionRow({
  section,
  pendingInsert,
  onInsertConsumed,
  onLabelChange,
  onBodyChange,
  onRemove,
  onAutofill,
  autofillPending,
  autofillDisabled,
}: {
  section: LocalSection
  /** Content captured from a message, to insert into this row's editor once. */
  pendingInsert?: CapturePayload
  onInsertConsumed: (key: string) => void
  onLabelChange: (key: string, label: string) => void
  onBodyChange: (key: string, body: ProseMirrorDoc) => void
  onRemove: (key: string) => void
  /** Absent prop = no sparkle, same convention as the rail's `onStartResearch`. */
  onAutofill?: (key: string, label: string) => void
  /** This row is being filled — spinner instead of sparkle. */
  autofillPending: boolean
  /** Another row is being filled — one in-flight at a time. */
  autofillDisabled: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section._key,
  })
  const [dropActive, setDropActive] = useState(false)

  const editor = useEditor({
    extensions: defaultExtensions,
    content: section.body as Record<string, unknown>,
    onUpdate: ({ editor: ed }) => {
      onBodyChange(section._key, ed.getJSON() as ProseMirrorDoc)
    },
  })

  // The imperative insert path, shared by the click action and the Phase E
  // dialog. Parsing happens inside a live editor instance, so no markdown →
  // ProseMirror converter is written anywhere. `insertContent` fires `onUpdate`,
  // which is what gets the new body into local state.
  //
  // Keyed on payload identity, for the same reason the `staged` effect below
  // is: StrictMode double-invokes effects in dev, and clearing `pendingInsert`
  // is a state update that has not landed by the time the second invocation
  // runs — so without this ref the captured body is pasted in twice. The
  // section-count guard one level up does not cover this; a body inserted twice
  // and a section appended twice are different bugs.
  const insertedRef = useRef<CapturePayload | null>(null)
  useEffect(() => {
    if (!editor || !pendingInsert || insertedRef.current === pendingInsert) return
    insertedRef.current = pendingInsert
    editor.commands.insertContent(pendingInsert.html ?? pendingInsert.text)
    onInsertConsumed(section._key)
  }, [editor, pendingInsert, onInsertConsumed, section._key])

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      // Styling only. The editor inside is already a drop target by virtue of
      // being contenteditable, and ProseMirror inserts at the drop position —
      // precision is the point. Never `preventDefault` the drop here; that would
      // take the event away from ProseMirror and land content at the end.
      onDragEnter={(e) => {
        if (hasCaptureData(e.dataTransfer)) setDropActive(true)
      }}
      onDragLeave={(e) => {
        // `dragleave` also fires when the pointer crosses into a child, so check
        // where it went rather than clearing on every leave.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDrop={() => setDropActive(false)}
      className={cn(
        'flex gap-3 rounded-lg border bg-card p-4 transition-colors duration-150',
        dropActive && 'border-primary bg-primary/5',
      )}
    >
      <button
        type="button"
        className="mt-6 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* `min-w-0` because a flex child defaults to `min-width: auto`, i.e. its
          min-content width — which here is the label Input's intrinsic size plus
          any unbreakable string in the body. The editor was built for a dialog
          and a full-width page; it now also renders in a split pane as narrow as
          35% of the viewport, where that default overflows instead of shrinking. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`label-${section._key}`} className="text-xs text-muted-foreground">
            Label
          </Label>
          <Input
            id={`label-${section._key}`}
            placeholder="e.g. Voice & tone"
            value={section.label}
            onChange={(e) => onLabelChange(section._key, e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="min-h-[80px] rounded border border-input bg-background px-3 py-2 text-sm break-words focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        {/* The lazy path's whole affordance: a labelled, empty row grows a
            sparkle. Shown only when all three facts hold — the route offered
            the capability, the row has a name to fill, and there is nothing in
            it to overwrite (decision 5). The draft lands in the editor
            un-saved; the ordinary Save is the commit. */}
        {onAutofill && section.label.trim() !== '' && isEmptyDoc(section.body) && (
          <button
            type="button"
            className="text-muted-foreground hover:text-primary disabled:pointer-events-none disabled:opacity-50"
            aria-label={`Auto-fill ${section.label} with AI`}
            title="Draft this section with AI — from the brand's research when it exists, otherwise a targeted search of the brand's site."
            disabled={autofillPending || autofillDisabled}
            onClick={() => onAutofill(section._key, section.label)}
          >
            {autofillPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove section"
          onClick={() => onRemove(section._key)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrandGuidelinesEditor — keyed by brand.id so it remounts on brand switch
// ---------------------------------------------------------------------------

export interface BrandGuidelinesEditorProps {
  brand: BrandWithSections
  /**
   * Content on its way into new sections: a message captured elsewhere in the
   * UI (the click path, or the dialog), or the drafts accepted from the research
   * review sheet. Appends one blank section per item, in order, and stages each
   * item's content into its own row. Unsaved, like any other edit.
   */
  staged?: StagedSection[] | null
  /** Called once `staged` has been taken, so the caller can clear it. */
  onStagedConsumed?: () => void
  /**
   * A save landed on the server.
   *
   * Exists for research's E2 landing: accepting drafts stages them here, and the
   * *save* — not the accept — is the moment they are actually in the brand's
   * guidelines and the rail must stop offering them. The editor is the only
   * thing that knows when that happened.
   *
   * Fires on every successful save, not only ones carrying staged content. The
   * caller decides whether it means anything, which keeps this a plain fact about
   * the editor rather than a research-shaped callback bolted onto it.
   */
  onSaved?: () => void
  /**
   * Auto-fill one section (guideline auto-fill, Phase D). Label in, result out;
   * the editor owns turning the outcome into an insert and a toast.
   *
   * **Absent prop = no sparkle**, exactly like the rail's `onStartResearch`:
   * the routes compute availability from data they already hold, and a
   * deployment (or brand) that cannot fill gets the affordance absent rather
   * than present-and-failing. The editor stays presentational — it never asks
   * which path the server took, it just renders what came back.
   */
  onAutofill?: (label: string) => Promise<AutofillSectionResult>
}

export function BrandGuidelinesEditor({
  brand,
  staged,
  onStagedConsumed,
  onSaved,
  onAutofill,
}: BrandGuidelinesEditorProps) {
  const [sections, setSections] = useState<LocalSection[]>(() => brand.sections.map(toLocal))
  // Keyed by section `_key`. A payload waiting for its row's editor to mount.
  const [pendingInserts, setPendingInserts] = useState<Record<string, CapturePayload>>({})
  const [newSectionDropActive, setNewSectionDropActive] = useState(false)
  // The row a staging gesture should bring into view; see the effect below.
  const [scrollToKey, setScrollToKey] = useState<string | null>(null)
  // The row currently being auto-filled. One at a time: the others' sparkles
  // disable, which is also the double-click guard the plan puts on the client
  // (the per-day cap on the server is the backstop).
  const [autofillKey, setAutofillKey] = useState<string | null>(null)
  const mutation = useUpdateBrandGuidelines(brand.id)

  // Capture into brand-new sections: append a blank row per item and stage the
  // content on it, so recording a brand-new aspect doesn't mean creating an
  // empty section first and then aiming at it.
  //
  // A list rather than a single item because accepting five research drafts is
  // one gesture and must be one state update: five separate calls would each
  // append against a `prev` the previous one had not landed in yet.
  const captureIntoNewSections = useCallback((items: StagedSection[]) => {
    const created = items.map((item) => ({
      section: blankSection(item.label ?? '', item.createdBy ?? 'user'),
      payload: item.payload,
    }))
    setSections((prev) => [...prev, ...created.map((c) => c.section)])
    setPendingInserts((prev) => {
      const next = { ...prev }
      for (const c of created) next[c.section._key] = c.payload
      return next
    })
    if (created[0]) setScrollToKey(created[0].section._key)
  }, [])

  // New sections are appended, and this dialog opens at the top — so on a brand
  // with anything in it, *Accept selected* put three drafts below the fold and
  // looked like it had done nothing at all. Found by looking at it: the tests
  // all passed, because "the row exists" and "you can see the row" are not the
  // same claim.
  //
  // In an effect keyed on the new row rather than inline, so it runs after the
  // rows have actually mounted.
  //
  // `block: 'start'`, and the first attempt at `'nearest'` is why it is stated
  // rather than defaulted: measured against a brand with six sections,
  // `'nearest'` did the least that satisfies "in view" — it parked the new
  // row's *label* on the bottom edge with its body still below the fold, which
  // reads as an empty field rather than as three drafts that just landed.
  // `'start'` puts the first accepted draft at the top, so what you accepted is
  // what you are looking at.
  useEffect(() => {
    if (!scrollToKey) return
    // jsdom does not implement `scrollIntoView`; a missing method here must not
    // take the staging path down with it.
    document.getElementById(`label-${scrollToKey}`)?.scrollIntoView?.({ block: 'start' })
    // Not reset afterwards: `_key` is a fresh uuid per created section, so the
    // next staging gesture changes this value and re-runs the effect on its
    // own. Clearing it would be a setState inside an effect — a cascading
    // render to reach a state no gesture can ask for twice.
  }, [scrollToKey])

  const handleInsertConsumed = useCallback((key: string) => {
    setPendingInserts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // StrictMode double-invokes effects in dev, and this one appends sections —
  // so it keys on identity rather than merely on truthiness.
  //
  // **Per item, not per list.** 1.5.0 kept one `CapturePayload` here and
  // comparing the prop against the last one it consumed was the whole guard.
  // With a list that is no longer sufficient in one direction: staging `[A]` and
  // then `[A, B]` is a different array, and a list-level check would append `A`
  // a second time. A `WeakSet` of the items already taken answers exactly the
  // question being asked — *has this one been staged?* — and answers it for the
  // StrictMode replay too, which is the case that reaches production as a
  // double paste nobody can reproduce in a build.
  const consumedStagedRef = useRef<WeakSet<StagedSection>>(new WeakSet())
  useEffect(() => {
    if (!staged || staged.length === 0) return
    const fresh = staged.filter((item) => !consumedStagedRef.current.has(item))
    if (fresh.length === 0) return
    for (const item of fresh) consumedStagedRef.current.add(item)
    captureIntoNewSections(fresh)
    onStagedConsumed?.()
  }, [staged, captureIntoNewSections, onStagedConsumed])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleLabelChange = useCallback((key: string, label: string) => {
    setSections((prev) => prev.map((s) => (s._key === key ? { ...s, label } : s)))
  }, [])

  const handleBodyChange = useCallback((key: string, body: ProseMirrorDoc) => {
    setSections((prev) => prev.map((s) => (s._key === key ? { ...s, body } : s)))
  }, [])

  const handleRemove = useCallback((key: string) => {
    setSections((prev) => prev.filter((s) => s._key !== key))
  }, [])

  // The click half of auto-fill. The draft arrives through the row's existing
  // one-shot insert channel — `pendingInserts` is already keyed by `_key`, and
  // `insertedRef` keys on payload identity, so the fresh object below is
  // inserted exactly once even under StrictMode (the 1.5.0 lesson, inherited
  // rather than re-learned). Nothing is saved: the same draft-gesture rule as
  // capture, and the same Save commits it.
  const handleAutofill = useCallback(
    async (key: string, label: string) => {
      if (!onAutofill) return
      setAutofillKey(key)
      try {
        const result = await onAutofill(label.trim())
        if (result.outcome === 'ok' && result.draft) {
          const draft = result.draft
          setPendingInserts((prev) => ({ ...prev, [key]: { html: draft.html, text: draft.text } }))
          // A machine filled the row, so the row says so (decision 6) — the
          // same authorship fact `draftsToSections` records, from the other
          // producer. Edits afterwards do not flip it back.
          setSections((prev) =>
            prev.map((s) => (s._key === key ? { ...s, createdBy: 'agent' } : s)),
          )
          toast.success(
            draft.sources.length > 0
              ? `${draft.label} drafted from ${draft.sources.length} ${
                  draft.sources.length === 1 ? 'source' : 'sources'
                } — review and save.`
              : `${draft.label} drafted — review and save.`,
          )
        } else if (result.outcome === 'no-material') {
          // The honest toast (decision 7): the source genuinely has nothing
          // solid for this label. Not an error — inventing text would be one.
          toast.info(
            result.source === 'report'
              ? `The research doesn't cover ${label.trim()}.`
              : `The search found nothing solid for ${label.trim()} on the brand's site.`,
          )
        } else {
          // `invalid-shape`: a fact about the configured writing model.
          toast.error('The writing model returned something unusable. Try again.')
        }
      } catch (err) {
        toast.error(err instanceof AppError ? err.message : 'Auto-fill failed.')
      } finally {
        setAutofillKey(null)
      }
    },
    [onAutofill],
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSections((prev) => {
      const oldIdx = prev.findIndex((s) => s._key === String(active.id))
      const newIdx = prev.findIndex((s) => s._key === String(over.id))
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  function save() {
    // **A section with no label fails the *whole* save, and the server cannot
    // say which one.** `UpdateBrandGuidelinesSectionInputSchema` requires
    // `label.min(1)`, and this form sends the brand's complete list — so one
    // blank row 400s the request and takes every other edit in the payload with
    // it. What the user saw was a toast reading `Bad Request`.
    //
    // Reachable since 1.5.0, because **every capture creates a blank label** by
    // design (you name it and trim it, then Save). 3F is what made it the
    // ordinary path rather than a corner: the research report is the thing
    // people will capture, and it arrives as a nameless section like any other.
    //
    // Caught by a live pass, not by a test — the editor's own tests type a
    // label before saving, which is exactly what a person does not do when the
    // body they just captured is 4,000 characters long.
    const blank = sections.find((s) => s.label.trim() === '')
    if (blank) {
      toast.error('Every section needs a label. Name this one, then save again.')
      document.getElementById(`label-${blank._key}`)?.focus()
      return
    }

    const payload: UpdateBrandGuidelinesInput = {
      sections: sections.map((s, i) => ({
        ...(s.id !== undefined ? { id: s.id as SectionId } : {}),
        label: s.label,
        body: s.body,
        priority: (i + 1) * 1000,
        createdBy: s.createdBy,
      })),
    }
    mutation.mutate(payload, {
      onSuccess: (serverSections: BrandGuidelineSection[]) => {
        setSections(serverSections.map(toLocal))
        toast.success('Guidelines saved')
        onSaved?.()
      },
      onError: (err) =>
        toast.error(err instanceof AppError ? err.message : 'Failed to save guidelines'),
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    save()
  }

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // `sameSectionLabel`, not `===`: this compared raw strings while the rail
  // compared trimmed-and-lowercased ones, so the two surfaces the rail's own
  // comment claims agree could offer a chip for a section already on screen.
  // Same helper on both sides now.
  const unusedSuggestions = SUGGESTED_SECTIONS.filter(
    (sg) => !sections.some((s) => sameSectionLabel(s.label, sg.label)),
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s._key)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {sections.map((s) => (
              <SectionRow
                key={s._key}
                section={s}
                pendingInsert={pendingInserts[s._key]}
                onInsertConsumed={handleInsertConsumed}
                onLabelChange={handleLabelChange}
                onBodyChange={handleBodyChange}
                onRemove={handleRemove}
                onAutofill={onAutofill ? handleAutofill : undefined}
                autofillPending={autofillKey === s._key}
                autofillDisabled={autofillKey !== null && autofillKey !== s._key}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sections yet. Add one below or pick from suggestions.
        </p>
      )}

      {/* Unlike a SectionRow, this one is not already a drop target, so it has
          to opt in by preventing `dragover`. Nothing is saved: the content lands
          in local state exactly like typing, and you name and trim it before
          hitting Save. That is what makes capture safe to be one-handed. */}
      <div
        onDragOver={(e) => {
          if (!hasCaptureData(e.dataTransfer)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragEnter={(e) => {
          if (hasCaptureData(e.dataTransfer)) setNewSectionDropActive(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setNewSectionDropActive(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          setNewSectionDropActive(false)
          const payload = readCaptureTransfer(e.dataTransfer)
          if (payload) captureIntoNewSections([{ payload }])
        }}
        className={cn(
          'rounded-lg border border-dashed px-4 py-3 text-center text-xs transition-colors duration-150',
          newSectionDropActive
            ? 'border-primary bg-primary/5 text-foreground'
            : 'text-muted-foreground',
        )}
      >
        Drop a message here for a new section
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setSections((prev) => [...prev, blankSection()])}
      >
        + Add section
      </Button>

      {unusedSuggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Quick-add suggested sections</p>
          <div className="flex flex-wrap gap-2">
            {unusedSuggestions.map((sg) => (
              <button
                key={sg.label}
                type="button"
                title={sg.description}
                // Hover is a *surface* change, not an accent one (§4, §10.1):
                // the accent belongs to the primary action and the selected
                // state, and a row of chips that all turn green on the way past
                // spends it on nothing.
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                onClick={() => setSections((prev) => [...prev, blankSection(sg.label)])}
              >
                {sg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t pt-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save guidelines'}
        </Button>
      </div>
    </form>
  )
}
