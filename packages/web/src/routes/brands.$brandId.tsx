import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
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
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
import {
  useBrand,
  useBrandProjects,
  useDeleteBrand,
  useUpdateBrand,
  useUpdateBrandGuidelines,
} from '@/api/queries/brands'
import { useBreadcrumbTrail } from '@/components/Breadcrumbs'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { EntityMenu } from '@/components/entity/EntityMenu'
import { RenameDialog } from '@/components/entity/RenameDialog'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { ProjectCard } from '@/components/project/ProjectCard'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  onLabelChange,
  onBodyChange,
  onRemove,
}: {
  section: LocalSection
  onLabelChange: (key: string, label: string) => void
  onBodyChange: (key: string, body: ProseMirrorDoc) => void
  onRemove: (key: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section._key,
  })

  const editor = useEditor({
    extensions: defaultExtensions,
    content: section.body as Record<string, unknown>,
    onUpdate: ({ editor: ed }) => {
      onBodyChange(section._key, ed.getJSON() as ProseMirrorDoc)
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex gap-3 rounded-lg border bg-card p-4"
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

      <div className="flex flex-1 flex-col gap-2">
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
        <div className="min-h-[80px] rounded border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
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
// BrandEditorForm — keyed by brand.id so it remounts on brand switch
// ---------------------------------------------------------------------------

function BrandEditorForm({ brand }: { brand: BrandWithSections }) {
  const [sections, setSections] = useState<LocalSection[]>(() => brand.sections.map(toLocal))
  const mutation = useUpdateBrandGuidelines(brand.id)

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

// ---------------------------------------------------------------------------
// Brand hub — identity + projects + guidelines
// ---------------------------------------------------------------------------

function BrandHubPage() {
  const { brandId } = brandEditorRoute.useParams()
  const navigate = useNavigate()
  const { data: brand, isPending, isError } = useBrand(brandId)
  const {
    data: projects,
    isPending: projectsPending,
    isError: projectsError,
  } = useBrandProjects(brandId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const update = useUpdateBrand(brandId, brand?.workspaceId ?? '')
  const del = useDeleteBrand(brandId, brand?.workspaceId ?? '')

  useBreadcrumbTrail(brand ? { brand: { id: brand.id, name: brand.name } } : {})

  return (
    <div className="flex-1 overflow-auto p-6">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{brand?.name ?? (isPending ? '…' : 'Brand')}</h1>
          {brand?.description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{brand.description}</p>
          ) : null}
          {isError && <p className="mt-2 text-sm text-destructive">Failed to load brand.</p>}
        </div>
        {brand && (
          <EntityMenu
            label={`Actions for ${brand.name}`}
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        )}
      </header>

      {brand && (
        <>
          <section className="mb-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
              <NewProjectDialog brandId={brand.id} workspaceId={brand.workspaceId} />
            </div>

            {projectsPending && (
              <p className="mt-4 text-sm text-muted-foreground">Loading projects…</p>
            )}
            {projectsError && (
              <p className="mt-4 text-sm text-destructive">Failed to load projects.</p>
            )}
            {!projectsPending && projects?.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                No projects yet. Start one to open the agent canvas with this brand&apos;s context.
              </p>
            )}
            {projects && projects.length > 0 && (
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    kind={p.kind}
                    brandId={brand.id}
                    workspaceId={brand.workspaceId}
                    lastActivityAt={p.lastActivityAt}
                    showBrandName={false}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Guidelines</h2>
            <BrandEditorForm key={brand.id} brand={brand} />
          </section>

          <RenameDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            resource="brand"
            initialName={brand.name}
            initialDescription={brand.description}
            pending={update.isPending}
            onSubmit={(values) => {
              update.mutate(
                {
                  name: values.name,
                  description: values.description ?? null,
                },
                {
                  onSuccess: () => {
                    setRenameOpen(false)
                    toast.success('Brand updated')
                  },
                  onError: (err) =>
                    toast.error(err instanceof AppError ? err.message : 'Failed to update brand'),
                },
              )
            }}
          />

          <DeleteBrandDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            brandName={brand.name}
            // null = not loaded yet / failed. The dialog must not claim "0
            // projects" while the cascade is about to take an unknown number.
            projectCount={projectsPending || projectsError ? null : (projects?.length ?? null)}
            pending={del.isPending}
            onConfirm={() => {
              del.mutate(undefined, {
                onSuccess: () => {
                  setDeleteOpen(false)
                  toast.success('Brand deleted')
                  void navigate({
                    to: '/workspaces/$wsId',
                    params: { wsId: brand.workspaceId },
                  })
                },
                onError: (err) =>
                  toast.error(err instanceof AppError ? err.message : 'Failed to delete brand'),
              })
            }}
          />
        </>
      )}
    </div>
  )
}

export const brandEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: BrandHubPage,
})
