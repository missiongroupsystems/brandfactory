import { useEffect, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import { ChevronDown, MessagesSquare, Plus } from 'lucide-react'
import type { BrandGuidelineSection, BrandWithSections } from '@brandfactory/shared'
import { SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { iconForSection } from '@/components/brand/guidelineIcons'
import { Button } from '@/components/ui/button'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// SectionReadPanel — read-only render of one section body
// ---------------------------------------------------------------------------

// `useEditor` seeds `content` once at mount, so the call site keys this on the
// section id to force a remount when a different section is opened. Editing
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
    <div className="px-3 pb-3 text-sm break-words text-muted-foreground">
      <EditorContent editor={editor} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrandContextRail — the brand's facts, alongside the work
// ---------------------------------------------------------------------------

export interface BrandContextRailProps {
  brand: BrandWithSections
  onEdit: () => void
  className?: string
}

/**
 * The hub's persistent right rail: what the brand *knows about itself*, sitting
 * beside the apps rather than stacked above them, so it stays on screen while
 * you pick something to work on.
 *
 * It supersedes the 1.4.0 `BrandContextBar`, which was a full-width card whose
 * only content was a wrapping chip row — at hub width that meant one small chip
 * marooned in a 130px band, with `Edit` a thousand pixels away. A rail is the
 * shape that content actually wanted.
 *
 * **Written sections and unwritten suggestions are one list.** The suggestions
 * are not a separate "get started" widget that disappears once you begin; they
 * are the same rows in an unwritten state, which is what lets the rail answer
 * "what do we know?" and "what is missing?" without asking twice. It is also
 * why there is no meter here: five rows, two of them written, *is* the meter,
 * and it is the version you can click.
 *
 * Consistent with the D2 decision recorded on `GuidelineMeter`: no percentage,
 * no progress bar, no red/green, no "incomplete" copy. An unwritten row is
 * quiet and dashed, not a warning. A brand with zero sections is a legitimate
 * brand — `docs/vision.md:28` — and the rail must not scold it.
 *
 * Accent budget: the rail stays neutral throughout. The only colour on this
 * page is the brand's own monogram.
 */
export function BrandContextRail({ brand, onEdit, className }: BrandContextRailProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const headingId = useId()
  const panelId = useId()

  const sections = brand.sections
  // `?? null` also covers an open section disappearing after an edit.
  const open = sections.find((s) => s.id === openId) ?? null

  // Suggestions the brand has not written yet. Matched on label, the same way
  // the editor's quick-add chips decide what to offer, so the rail and the
  // dialog never disagree about what counts as "already covered".
  const unwritten = SUGGESTED_SECTIONS.filter(
    (sg) => !sections.some((s) => s.label.trim().toLowerCase() === sg.label.toLowerCase()),
  )

  return (
    <aside aria-labelledby={headingId} className={cn('min-w-0', className)}>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 id={headingId} className="text-sm font-medium">
              Brand context
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sections.length === 0
                ? 'Rides along into every thread'
                : `${sections.length} of ${SUGGESTED_SECTIONS.length} suggested sections`}
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={onEdit}>
            Edit
          </Button>
        </div>

        <ul className="flex flex-col p-1.5">
          {sections.map((s) => {
            const Icon = iconForSection(s.label)
            const isOpen = s.id === openId
            return (
              <li key={s.id}>
                {/* A disclosure, not a toggle button: the body genuinely is
                    hidden when collapsed, so `aria-expanded` is the honest
                    state. (The 1.4.0 chip row used `aria-pressed` precisely
                    because nothing there was ever hidden.) */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  onClick={() => setOpenId(isOpen ? null : s.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && open ? (
                  <div id={panelId}>
                    <SectionReadPanel key={open.id} section={open} />
                  </div>
                ) : null}
              </li>
            )
          })}

          {unwritten.map((sg) => {
            const Icon = iconForSection(sg.label)
            return (
              <li key={sg.label}>
                {/* Opens the same dialog as Edit, where the quick-add chip for
                    this label already exists. Seeding the row from here would
                    mean a second staging channel into the editor alongside
                    `staged`, for one click saved. */}
                <button
                  type="button"
                  onClick={onEdit}
                  title={sg.description}
                  aria-label={`Add ${sg.label}`}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                >
                  <Icon
                    className="size-4 shrink-0 opacity-50 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{sg.label}</span>
                  {/* Visible at rest, not only on hover. Hover-only would leave
                      an unwritten row looking like a written one that simply has
                      nothing to disclose — the two states have to be tellable
                      apart without a pointer, and on touch there is no hover at
                      all. */}
                  <Plus
                    className="size-3.5 shrink-0 opacity-40 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              </li>
            )
          })}
        </ul>

        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2.5 px-2.5" asChild>
            <Link to="/brands/$brandId/context" params={{ brandId: brand.id }}>
              <MessagesSquare className="size-4 text-muted-foreground" aria-hidden="true" />
              Talk it through
            </Link>
          </Button>
        </div>
      </div>
    </aside>
  )
}
