import { useEffect, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import {
  ChevronDown,
  CircleAlert,
  Loader2,
  MessagesSquare,
  Plus,
  Search,
  SearchX,
  Sparkles,
} from 'lucide-react'
import type { BrandGuidelineSection, BrandWithSections } from '@brandfactory/shared'
import { SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { ColorSwatches, paletteSummary } from '@/components/brand/ColorSwatches'
import { iconForSection } from '@/components/brand/guidelineIcons'
import { Button } from '@/components/ui/button'
import type { BrandAsset } from '@/demo/assetTypes'
import type { ResearchJobSummary } from '@/demo/researchTypes'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import { formatRelativeTime } from '@/lib/relative-time'
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

/**
 * Where a brand's colours go, as three arrangements on one page rather than
 * three arguments in a document.
 *
 * - `A` — a `Palette` block in the rail, below the section list. The obvious
 *   one, and the one that crowds a column already holding five rows and two
 *   actions.
 * - `B` — under the mark, in the identity band. Leaves the rail's one-list rule
 *   untouched at the cost of a second fact in a band 1.7.0 kept to one.
 * - `C` — out of the rail entirely, onto the `Visual identity` page. Cleanest
 *   and least discoverable: a brand's colours become somewhere you navigate to.
 *
 * **`C` is the default because `C` is 1.7.0** — it is the only one of the three
 * that leaves both the rail and the identity band exactly as they ship, so a
 * caller that passes no variant gets the shipped hub. `A` and `B` are reachable
 * only from the demo scenario picker.
 */
export type RailVariant = 'A' | 'B' | 'C'

export interface BrandContextRailProps {
  brand: BrandWithSections
  onEdit: () => void
  className?: string
  /**
   * **Structure A only** — `BrandHubView` passes this for variant `A` and
   * nothing otherwise. Absent → no palette block, which is what the real route
   * renders and what variants `B` and `C` render here.
   */
  colors?: BrandAsset[]
  /**
   * The latest research job, or `null` for a brand nobody has researched.
   * Absent on the real route; there is no research query yet.
   */
  research?: ResearchJobSummary | null
  /**
   * The re-run entry point (research decision 1). **The footer's research row
   * exists only when this does** — a rail that offers to research a brand
   * against a backend with no research route would be a dead affordance, which
   * is the class of thing 1.7.0 spent a pass removing.
   */
  onStartResearch?: () => void
  /** Opens the review sheet from the `ready` state (research E2). */
  onReviewDrafts?: () => void
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
 * page is the brand's own monogram — which is why the research row's in-flight
 * state is a neutral `Loader2` rather than §12.8's accent arc, and why its
 * failed state tints one 14px glyph and nothing else.
 *
 * **The footer is "the ways of finding out more".** Talking and looking it up
 * are the same kind of thing, which is what lets research join it without
 * becoming a sixth row in the section list — that list means *written sections
 * and unwritten suggestions*, and a row that is neither breaks the one rule the
 * rail promises.
 */
export function BrandContextRail({
  brand,
  onEdit,
  className,
  colors,
  research,
  onStartResearch,
  onReviewDrafts,
}: BrandContextRailProps) {
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

        {colors && colors.length > 0 && (
          // Structure A. A block, not a row: the section list is the meter and
          // a swatch row inside it would be neither a written section nor an
          // unwritten suggestion.
          <div className="border-t px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Palette</h3>
              <span className="text-xs text-muted-foreground">{paletteSummary(colors)}</span>
            </div>
            <ColorSwatches colors={colors} className="mt-2.5" />
          </div>
        )}

        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2.5 px-2.5" asChild>
            <Link to="/brands/$brandId/context" params={{ brandId: brand.id }}>
              <MessagesSquare className="size-4 text-muted-foreground" aria-hidden="true" />
              Talk it through
            </Link>
          </Button>

          {onStartResearch && (
            <ResearchRow
              research={research ?? null}
              onStartResearch={onStartResearch}
              onReviewDrafts={onReviewDrafts}
            />
          )}
        </div>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// ResearchRow — one slot, five states
// ---------------------------------------------------------------------------

/**
 * Research decision 2: the run reports itself in the **same footer row the
 * action was started from**, and does not open a second zone to describe
 * itself. Four states are named in the locked document; the fifth,
 * `NO_FINDINGS`, is named as terminal there and never drawn, so it is drawn
 * here — a website that turns out to be a one-page holding site is the ordinary
 * way to reach it, not a failure.
 *
 * ```
 * idle         🔍  Research this brand
 * running      ◌   Researching… started 2 minutes ago
 * ready        ✦   5 drafts ready — Review
 * no findings  ⌀   Nothing found — Try again
 * failed       ⚠   Research failed — Try again
 * ```
 *
 * **None of these may look alarming.** A rail that is on screen the whole time
 * you are choosing what to work on cannot carry a red banner about a background
 * job you opted into; a failed run gets one tinted 14px glyph and a muted line
 * of reason, and everything else stays in the rail's neutral register.
 *
 * `IDLE` is deliberately not a status — it is `research === null`, which is
 * what the query returns for a brand nobody has researched, and it means a hub
 * that has never run research looks exactly as it does today.
 */
function ResearchRow({
  research,
  onStartResearch,
  onReviewDrafts,
}: {
  research: ResearchJobSummary | null
  onStartResearch: () => void
  onReviewDrafts?: () => void
}) {
  const rowClass = 'w-full justify-start gap-2.5 px-2.5'
  const iconClass = 'size-4 shrink-0 text-muted-foreground'

  if (research?.status === 'IN_PROGRESS') {
    return (
      <div
        className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted-foreground"
        // The row is the status, so it announces changes rather than waiting
        // for a poll to be noticed.
        aria-live="polite"
      >
        <Loader2 className={cn(iconClass, 'animate-spin')} aria-hidden="true" />
        <span className="min-w-0 truncate">
          Researching…{' '}
          {research.startedAt
            ? `started ${formatRelativeTime(research.startedAt)}`
            : 'just started'}
        </span>
      </div>
    )
  }

  if (research?.status === 'COMPLETED' && research.drafts.length > 0) {
    const n = research.drafts.length
    return (
      <Button variant="ghost" size="sm" className={rowClass} onClick={onReviewDrafts}>
        <Sparkles className={iconClass} aria-hidden="true" />
        <span className="min-w-0 truncate">
          {n === 1 ? '1 draft ready' : `${n} drafts ready`} — Review
        </span>
      </Button>
    )
  }

  if (research?.status === 'NO_FINDINGS') {
    return (
      <div>
        <Button variant="ghost" size="sm" className={rowClass} onClick={onStartResearch}>
          <SearchX className={iconClass} aria-hidden="true" />
          <span className="min-w-0 truncate">Nothing found — Try again</span>
        </Button>
        <p className="px-2.5 pb-1 text-xs text-muted-foreground">
          The site gave us too little to work with.
        </p>
      </div>
    )
  }

  if (research?.status === 'FAILED') {
    return (
      <div>
        <Button variant="ghost" size="sm" className={rowClass} onClick={onStartResearch}>
          <CircleAlert
            className="size-4 shrink-0 text-[var(--color-status-warning)]"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">Research failed — Try again</span>
        </Button>
        {research.error && (
          <p className="px-2.5 pb-1 text-xs text-muted-foreground">{research.error}</p>
        )}
      </div>
    )
  }

  // Everything else — no job, a cancelled one, or a completed run whose drafts
  // have already been dealt with — is the entry point again.
  return (
    <Button variant="ghost" size="sm" className={rowClass} onClick={onStartResearch}>
      <Search className={iconClass} aria-hidden="true" />
      <span className="min-w-0 truncate">Research this brand</span>
    </Button>
  )
}
