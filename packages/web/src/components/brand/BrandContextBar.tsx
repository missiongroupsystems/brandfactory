import { useEffect, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import { ChevronDown, ChevronRight, MessagesSquare } from 'lucide-react'
import type { BrandGuidelineSection, BrandWithSections } from '@brandfactory/shared'
import { iconForSection } from '@/components/brand/guidelineIcons'
import { GuidelineMeter } from '@/components/brand/GuidelineMeter'
import { Button } from '@/components/ui/button'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// SectionReadPanel — read-only render of one section body
// ---------------------------------------------------------------------------

// `useEditor` seeds `content` once at mount, so the call site keys this on the
// selected section id to force a remount when the selection changes. Editing
// lives in EditGuidelinesDialog; this instance is `editable: false`.
function SectionReadPanel({ section }: { section: BrandGuidelineSection }) {
  const editor = useEditor({
    extensions: defaultExtensions,
    content: section.body as Record<string, unknown>,
    editable: false,
  })

  // The key covers a *selection* change; it does not cover a *content* change.
  // A save from EditGuidelinesDialog comes back on the same section id (the
  // server preserves ids), so `useUpdateBrandGuidelines` repoints the cache
  // while this key stays put — and the seeded editor would keep rendering the
  // pre-edit body next to its already-updated label. Push new content in
  // explicitly. Read-only, so there is no cursor or selection to disturb.
  useEffect(() => {
    editor?.commands.setContent(section.body as Record<string, unknown>)
  }, [editor, section.body])

  return (
    <div className="mt-3 rounded-lg border bg-card px-4 py-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{section.label}</p>
      <div className="text-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrandContextBar — ambient, collapsible brand context
// ---------------------------------------------------------------------------

export interface BrandContextBarProps {
  brand: BrandWithSections
  onEdit: () => void
}

/**
 * Demotes brand guidelines from the brand page's main surface to an ambient
 * bar: chips for each section, one read-only body panel for the selected chip,
 * and an Edit button that hands off to `EditGuidelinesDialog`.
 *
 * Collapse and selection are independent — collapsing condenses the chips to an
 * icon rail but keeps the open panel, so the bar can be shrunk without losing
 * the section being read.
 *
 * It is also where the brand *conversation* hangs off (rather than the hub's
 * mini-app grid): typing context and talking it out are the two ways to build
 * the same thing, so they sit together. Two entry points — an icon beside Edit
 * once sections exist, and a second CTA on the empty state, which is the
 * intended first-run path for a brand that starts as a rough idea.
 *
 * Accent budget: chips and the rail stay neutral (`bg-surface-sunken` /
 * `hover:bg-accent`, selection via `bg-surface-selected`). No brand green here —
 * this bar is ambient context, not a call to action.
 */
export function BrandContextBar({ brand, onEdit }: BrandContextBarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The chip row never actually hides — collapsing only swaps labelled chips
  // for an icon rail — so this is a toggle button (`aria-pressed`), not a
  // disclosure (`aria-expanded`), which would claim the controlled region is
  // hidden when it isn't. `aria-controls` still names the region it restyles.
  const chipRowId = useId()

  const sections = brand.sections
  // `?? null` also covers a selected section disappearing after an edit.
  const selected = sections.find((s) => s.id === selectedId) ?? null

  if (sections.length === 0) {
    return (
      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Brand context</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing captured yet. Audience, voice and positioning ride along into every thread.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Add brand context
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/brands/$brandId/context" params={{ brandId: brand.id }}>
              …or talk it through
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8" aria-label="Brand context">
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-pressed={collapsed}
            aria-controls={chipRowId}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {collapsed ? (
              <ChevronRight className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
            Brand context
          </button>
          <GuidelineMeter sectionCount={sections.length} />
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            title="Talk it through"
            aria-label="Talk it through"
            asChild
          >
            <Link to="/brands/$brandId/context" params={{ brandId: brand.id }}>
              <MessagesSquare className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>

        <div id={chipRowId} className="mt-3 flex flex-wrap gap-2">
          {sections.map((s) => {
            const Icon = iconForSection(s.label)
            const isSelected = s.id === selectedId
            return (
              <button
                key={s.id}
                type="button"
                title={s.label}
                aria-label={s.label}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : s.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border py-1.5 text-xs transition-colors duration-150',
                  collapsed ? 'px-2' : 'px-3',
                  isSelected
                    ? 'bg-surface-selected text-foreground'
                    : 'bg-surface-sunken text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{s.label}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {selected && <SectionReadPanel key={selected.id} section={selected} />}
    </section>
  )
}
