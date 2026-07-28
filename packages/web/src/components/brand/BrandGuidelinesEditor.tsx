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
import { GripVertical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  BrandGuidelineSection,
  BrandWithSections,
  ProseMirrorDoc,
  SectionId,
  UpdateBrandGuidelinesInput,
} from '@brandfactory/shared'
import { SUGGESTED_SECTIONS } from '@brandfactory/shared'
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
}

const EMPTY_DOC: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

function toLocal(s: BrandGuidelineSection): LocalSection {
  return { _key: s.id, id: s.id, label: s.label, body: s.body, priority: s.priority }
}

function blankSection(label = ''): LocalSection {
  return { _key: crypto.randomUUID(), label, body: EMPTY_DOC, priority: 0 }
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
}: {
  section: LocalSection
  /** Content captured from a message, to insert into this row's editor once. */
  pendingInsert?: CapturePayload
  onInsertConsumed: (key: string) => void
  onLabelChange: (key: string, label: string) => void
  onBodyChange: (key: string, body: ProseMirrorDoc) => void
  onRemove: (key: string) => void
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

      <button
        type="button"
        className="mt-6 text-muted-foreground hover:text-destructive"
        aria-label="Remove section"
        onClick={() => onRemove(section._key)}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrandGuidelinesEditor — keyed by brand.id so it remounts on brand switch
// ---------------------------------------------------------------------------

export interface BrandGuidelinesEditorProps {
  brand: BrandWithSections
  /**
   * Content captured from a message elsewhere in the UI (the click path, or in
   * Phase E the dialog). Appends a blank section and stages the content into
   * it. Unsaved, like any other edit.
   */
  staged?: CapturePayload | null
  /** Called once `staged` has been taken, so the caller can clear it. */
  onStagedConsumed?: () => void
}

export function BrandGuidelinesEditor({
  brand,
  staged,
  onStagedConsumed,
}: BrandGuidelinesEditorProps) {
  const [sections, setSections] = useState<LocalSection[]>(() => brand.sections.map(toLocal))
  // Keyed by section `_key`. A payload waiting for its row's editor to mount.
  const [pendingInserts, setPendingInserts] = useState<Record<string, CapturePayload>>({})
  const [newSectionDropActive, setNewSectionDropActive] = useState(false)
  const mutation = useUpdateBrandGuidelines(brand.id)

  // Capture into a brand-new section: append a blank row and stage the content
  // on it, so recording a brand-new aspect doesn't mean creating an empty
  // section first and then aiming at it.
  const captureIntoNewSection = useCallback((payload: CapturePayload) => {
    const created = blankSection()
    setSections((prev) => [...prev, created])
    setPendingInserts((prev) => ({ ...prev, [created._key]: payload }))
  }, [])

  const handleInsertConsumed = useCallback((key: string) => {
    setPendingInserts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // StrictMode double-invokes effects in dev, and this one appends a section —
  // so it keys on payload identity rather than merely on truthiness.
  const consumedStagedRef = useRef<CapturePayload | null>(null)
  useEffect(() => {
    if (!staged || consumedStagedRef.current === staged) return
    consumedStagedRef.current = staged
    captureIntoNewSection(staged)
    onStagedConsumed?.()
  }, [staged, captureIntoNewSection, onStagedConsumed])

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
    const payload: UpdateBrandGuidelinesInput = {
      sections: sections.map((s, i) => ({
        ...(s.id !== undefined ? { id: s.id as SectionId } : {}),
        label: s.label,
        body: s.body,
        priority: (i + 1) * 1000,
      })),
    }
    mutation.mutate(payload, {
      onSuccess: (serverSections: BrandGuidelineSection[]) => {
        setSections(serverSections.map(toLocal))
        toast.success('Guidelines saved')
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

  const unusedSuggestions = SUGGESTED_SECTIONS.filter(
    (sg) => !sections.some((s) => s.label === sg.label),
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
          if (payload) captureIntoNewSection(payload)
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
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
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
