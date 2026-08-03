import { useEffect, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import {
  ChevronDown,
  CircleAlert,
  FileText,
  Loader2,
  MessagesSquare,
  Plus,
  Search,
  SearchX,
  Sparkles,
} from 'lucide-react'
import type {
  BrandAsset,
  BrandGuidelineSection,
  BrandWithSections,
  ResearchJobSummary,
} from '@brandfactory/shared'
import { hasReportToRead, sameSectionLabel, SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { ColorSwatches, paletteSummary } from '@/components/brand/ColorSwatches'
import { iconForSection } from '@/components/brand/guidelineIcons'
import { Button } from '@/components/ui/button'
import { defaultExtensions } from '@/editor/proseMirrorSchema'
import {
  RESEARCH_POLL_UNREACHABLE,
  RESEARCH_REPORT_MISSING_HINT,
  RESEARCH_REPORT_ROW_HINT,
  RESEARCH_REPORT_ROW_LABEL,
  researchPaceLine,
} from '@/lib/research-copy'
import { formatElapsed, researchProgress, type ResearchPace } from '@/lib/research-progress'
import { useNow } from '@/lib/use-now'
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
  /**
   * Inline colour assets, `proposed` ones included.
   *
   * **`undefined` and `[]` are different, and neither renders a block.**
   * `undefined` means *not known* — the query is pending or failed — and `[]`
   * means the brand has no colours. Both are silence rather than a placeholder:
   * a brand with an empty palette is a legitimate brand (`docs/vision.md:28`)
   * and a "no colours yet" box would be the scolding this rail spent 1.7.0
   * removing. The distinction still matters because a block that flashes empty
   * on every navigation is worse than one that appears 100ms late.
   */
  colors?: BrandAsset[]
  /**
   * Where the `Palette` heading goes — the surface that *owns* colours, where
   * they are added, labelled, reordered and proposed. Read here, write there.
   *
   * **Gated on the prop, not on the job**, the same way `onStartResearch` gates
   * the research row. In 2C the Visual identity page is still a `Coming soon`
   * stub, so `BrandHubView` passes nothing and the heading is plain text: a
   * link from the one surface that shows you your colours to a page that says
   * "later" is worse than no link, and it is the affordance class 1.7.0 spent a
   * pass removing. 2E flips `visual.enabled` and the heading becomes a link
   * with no edit here.
   */
  paletteHref?: string
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
  /**
   * Opens the report dialog from the finished state.
   *
   * **This row used to be a `<Link>` to `/brands/:id/context`** — the *list* of
   * every conversation the brand has, where finding the report meant recognising
   * a date in a card title. It is a button now, and the destination it used to be
   * is a footer action inside the dialog. Optional and un-gated, exactly like
   * `onReviewDrafts`: the row is what tells you a paid run finished, so it must
   * render whether or not a caller wired the handler.
   */
  onReadReport?: () => void
  /** A start request is in flight — see `BrandHubViewProps.researchStarting`. */
  researchStarting?: boolean
  /**
   * `RESEARCH_JOB_MAX_MINUTES`, off the research envelope.
   *
   * **Optional, and absent means the row never promises an automatic close.**
   * A deployment that has not told us its ceiling still gets the clock and the
   * over-time line; what it does not get is a sentence naming a number nobody
   * supplied. Degrading to a plausible default would be the confabulation this
   * whole feature is built to avoid, one layer down.
   */
  researchMaxMinutes?: number
  /**
   * The status poll itself is failing.
   *
   * Surfaced because a clock that keeps ticking over a dead connection is a
   * *worse* lie than the frozen one it replaces — it reads as live confirmation
   * that the run is progressing. The run almost certainly is: it is a row on a
   * server and a reconciling ticker, neither of which needs this browser.
   */
  researchUnreachable?: boolean
  /**
   * Whether the footer offers `Talk it through`, the link to
   * `/brands/$brandId/context`. Defaults to true — the hub wants it. The brand
   * context page itself passes `false`, because there the link would point at
   * the page it is on: a self-link reads as an affordance, goes nowhere, and
   * the conversations it promises are already the main column beside the rail.
   * With the link off and no `onStartResearch`, the footer has no rows and is
   * omitted entirely rather than rendered as an empty bordered band.
   */
  showTalkLink?: boolean
  /**
   * Does Brand context hold **any** conversation for this brand?
   *
   * **It no longer gates the report row, and that is the correction.** 1.13.2
   * added this to stop the row promising a report that was not where it pointed:
   * `landReportInThread` swallows its own failure, so a `COMPLETED` job could
   * link at a Brand context that never received anything, and the answer was to
   * drop the affordance entirely.
   *
   * That answer was one layer too high. The report is not in the thread — it is on
   * the job row, and the thread was only ever a copy of it. So a failed landing
   * costs the *conversation*, never the report, and suppressing the row meant
   * hiding a readable document in order to report a missing copy of it, with
   * "research again" — $0.40 — as the only remaining move.
   *
   * What it drives now is one sentence: which hint sits under a row that works
   * either way. `undefined` is still a pending query and still reads as "landed",
   * so a navigation does not flash an anomaly notice on a healthy brand.
   */
  hasBrandContextThreads?: boolean
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
  paletteHref,
  research,
  onStartResearch,
  onReviewDrafts,
  onReadReport,
  researchStarting = false,
  researchMaxMinutes,
  researchUnreachable = false,
  showTalkLink = true,
  hasBrandContextThreads,
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
  //
  // **They did disagree, for as long as that sentence has been written.** This
  // side trimmed and lowercased; the editor compared `s.label === sg.label`
  // exactly, so a brand with `voice & tone` in lower case got no rail
  // suggestion and a quick-add chip that would append a second one. Both now
  // call `sameSectionLabel`, which is also what makes `TLDR` and `TL;DR` one
  // section rather than two rows the user has to notice.
  const unwritten = SUGGESTED_SECTIONS.filter(
    (sg) => !sections.some((s) => sameSectionLabel(s.label, sg.label)),
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
              {/* Counts what the list below actually shows: N written rows,
                  then M suggestion rows. It used to read
                  `${sections.length} of ${SUGGESTED_SECTIONS.length} suggested
                  sections` — a denominator the numerator can exceed, so a brand
                  with eight sections of its own announced "8 of 5 suggested
                  sections", and a brand whose sections are all custom claimed
                  suggestions it had not taken. Still no percentage, no bar and
                  no "incomplete": the register is the rail's, only true. */}
              {sections.length === 0
                ? 'Rides along into every thread'
                : unwritten.length > 0
                  ? `${sections.length} written · ${unwritten.length} suggested`
                  : `${sections.length} written`}
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
          // A block, not a row. The section list above is the meter — written
          // sections and unwritten suggestions, one list — and a swatch row
          // inside it would be neither, which is the one rule this rail
          // promises. Its own `border-t` and heading keep it outside the count.
          <div className="border-t px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              {/* Read-only either way — no `Edit` button here. The rail shows
                  the palette; the library owns it. */}
              <h3 className="text-sm font-medium">
                {paletteHref ? (
                  <a
                    href={paletteHref}
                    className="rounded-sm transition-colors duration-150 hover:text-muted-foreground"
                  >
                    Palette
                  </a>
                ) : (
                  'Palette'
                )}
              </h3>
              <span className="text-xs text-muted-foreground">{paletteSummary(colors)}</span>
            </div>
            <ColorSwatches colors={colors} className="mt-2.5" />
          </div>
        )}

        {(showTalkLink || onStartResearch) && (
          <div className="border-t p-1.5">
            {showTalkLink && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2.5 px-2.5"
                asChild
              >
                <Link to="/brands/$brandId/context" params={{ brandId: brand.id }}>
                  <MessagesSquare className="size-4 text-muted-foreground" aria-hidden="true" />
                  Talk it through
                </Link>
              </Button>
            )}

            {onStartResearch && (
              <ResearchRow
                research={research ?? null}
                researchStarting={researchStarting}
                onStartResearch={onStartResearch}
                onReviewDrafts={onReviewDrafts}
                onReadReport={onReadReport}
                maxMinutes={researchMaxMinutes}
                unreachable={researchUnreachable}
                hasBrandContextThreads={hasBrandContextThreads}
                // The report row's hint is onboarding — *read it there, capture
                // what matters into the guidelines* — and `COMPLETED` is forever,
                // so on a brand that already has sections it is two permanent
                // lines of instruction for something the user has demonstrably
                // already done. The row itself stays; only the teaching goes.
                showReportHint={sections.length === 0}
              />
            )}
          </div>
        )}
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
 * running      ◌   Researching… 4m 12s
 *                  ▁▁▁▁▁▂▂▂▂▂▂▂▂▂▂▂▂  (elapsed across the quoted window)
 *                  Usually 3–15 minutes. Drafts + report land here when ready.
 * ready        ✦   5 drafts ready — Review
 * finished     ▤   Research finished — read the report   → opens the report
 *              🔍  Research again
 * no findings  ⌀   Nothing found — Try again
 * failed       ⚠   Research failed — Try again
 * ```
 *
 * **Two of these rows are repairs, and both were the same mistake: a state the
 * user was in that the rail had no drawing for.**
 *
 * The running state showed `started N minutes ago` computed at render time,
 * which never re-ran — see `useNow` for why the poll cannot stand in for a
 * clock. It said *1 second ago* for the length of a 5-minute run. It now counts,
 * which is also the only honest liveness signal available: there is still **no
 * vendor progress** (`{ status: 'running' }` until completion) and the meter
 * measures elapsed time against the quoted window, not work done. Past that
 * window it says so, and near `RESEARCH_JOB_MAX_MINUTES` it says the run will
 * close itself — a ceiling that has been enforced since 1.11.2 and that no
 * surface has ever mentioned.
 *
 * The finished state did not exist at all. `COMPLETED` with an empty `drafts`
 * array — shaping produced nothing, or the drafts were already taken — fell
 * through to the bare entry point, so a finished $0.40 run rendered identically
 * to a brand nobody had ever researched. See `hasReportToRead`.
 *
 * **And when it did exist, it pointed at a list.** The row it shipped as was a
 * `<Link>` to `/brands/:id/context`, so "read the report" meant leaving the hub
 * for a page that does not mention research and picking the right card out of the
 * brand's conversations by the date in its title. It opens the report instead
 * (`onReadReport`), and the conversation is a footer action in that dialog. The
 * row is therefore a `<button>` where it used to be a link — Cmd-click to a new
 * tab moves one step in, to `View in brand context`, which is still a real link.
 *
 * **None of these may look alarming.** A rail that is on screen the whole time
 * you are choosing what to work on cannot carry a red banner about a background
 * job you opted into; a failed run gets one tinted 14px glyph and a muted line
 * of reason, and everything else stays in the rail's neutral register. The
 * over-time meter is the same one glyph's worth of tint, for the same reason.
 *
 * **The no-meter rule this appears to break is a different rule.** D2 (see
 * `GuidelineMeter`, and this component's own doc comment) forbids scoring *the
 * brand* — no percentage of completeness, nothing that reads as a brand being
 * deficient for having four sections instead of five. A paid background job's
 * elapsed time is a fact about a job, not a judgement about the brand, and the
 * quantity it draws is one the row already states in words.
 *
 * `IDLE` is deliberately not a status — it is `research === null`, which is
 * what the query returns for a brand nobody has researched, and it means a hub
 * that has never run research looks exactly as it does today.
 */
function ResearchRow({
  research,
  onStartResearch,
  onReviewDrafts,
  onReadReport,
  researchStarting = false,
  maxMinutes,
  unreachable = false,
  hasBrandContextThreads,
  showReportHint = true,
}: {
  research: ResearchJobSummary | null
  onStartResearch: () => void
  onReviewDrafts?: () => void
  onReadReport?: () => void
  researchStarting?: boolean
  maxMinutes?: number
  unreachable?: boolean
  hasBrandContextThreads?: boolean
  showReportHint?: boolean
}) {
  const rowClass = 'w-full justify-start gap-2.5 px-2.5'
  const iconClass = 'size-4 shrink-0 text-muted-foreground'
  // **Every row that can start a run carries this**, not just the idle one. The
  // window is between the click and the POST resolving, and in that window the
  // job in the cache is still the *old* one — so `Try again` after a failure
  // invites a second click exactly as readily as `Research this brand` does, and
  // a second click was a second paid run.
  const startProps = { disabled: researchStarting, onClick: onStartResearch } as const

  // Unconditional, because hooks are: `active` is what makes a hub with no run
  // in flight hold no timer.
  const inFlight = research?.status === 'IN_PROGRESS'
  const now = useNow(inFlight)

  if (research?.status === 'IN_PROGRESS') {
    // No ceiling on the wire means no ceiling *claimed* — `Infinity` keeps the
    // clock and the over-time line and removes only the sentence that would
    // name a number nobody supplied.
    const { elapsedMs, fraction, pace, minutesToCeiling } = researchProgress(
      research.startedAt,
      now,
      maxMinutes ?? Number.POSITIVE_INFINITY,
    )

    return (
      <div className="flex gap-2.5 px-2.5 py-2 text-sm text-muted-foreground">
        <Loader2 className={cn(iconClass, 'mt-0.5 animate-spin')} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {/* **Not inside the live region.** This changes every second, and a
              polite region wrapping it would have a screen reader announce the
              clock once per tick for the length of the run. */}
          <p className="truncate">Researching… {formatElapsed(elapsedMs)}</p>

          <ResearchPaceMeter fraction={fraction} pace={pace} stalled={unreachable} />

          {/* The live region is *this* line, which changes only when the run
              crosses a threshold or the poll stops getting through — three or
              four times across a run, each of them worth saying out loud. */}
          <p className="mt-1 text-xs leading-snug" aria-live="polite">
            {unreachable ? RESEARCH_POLL_UNREACHABLE : researchPaceLine(pace, minutesToCeiling)}
          </p>
        </div>
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

  // Reached only with `drafts.length === 0`, because the branch above claims
  // every `COMPLETED` job that still has drafts. Two ways to be here and they
  // are indistinguishable on the wire — shaping produced nothing, or the drafts
  // have already been taken — so the row speaks to what is true in both cases:
  // the report exists and is worth reading. Re-run sits underneath rather than
  // replacing it; a finished run has two reasonable next moves and the old
  // fall-through offered only the one that spends $0.40 again.
  if (hasReportToRead(research)) {
    // **`COMPLETED` and the report are one write** — `finishResearchJob` sets the
    // status and the report text in a single statement — so this row's claim needs
    // nothing checked. It used to: the report was fetched *by going to look for the
    // conversation 3F made of it*, and that landing can fail silently, which is
    // what 1.13.2's `hasBrandContextThreads` gate was for. Reading the report off
    // the row instead of out of the thread removes the fallible step, and with it
    // the reason to ever suppress the row.
    //
    // The prop survives, doing something smaller and honest: a brand with no
    // conversations at all has lost the *copy*, so the hint says so — and the
    // report still opens.
    const threadLanded = hasBrandContextThreads !== false

    return (
      <div>
        <Button variant="ghost" size="sm" className={rowClass} onClick={onReadReport}>
          <FileText className={iconClass} aria-hidden="true" />
          <span className="min-w-0 truncate">{RESEARCH_REPORT_ROW_LABEL}</span>
        </Button>
        {/* The missing-conversation line always shows — it explains an anomaly
            rather than teaching a gesture, so the rule that retires the hint below
            does not apply to it. */}
        {!threadLanded ? (
          <p className="px-2.5 pb-1 text-xs leading-snug text-muted-foreground">
            {RESEARCH_REPORT_MISSING_HINT}
          </p>
        ) : showReportHint ? (
          <p className="px-2.5 pb-1 text-xs leading-snug text-muted-foreground">
            {RESEARCH_REPORT_ROW_HINT}
          </p>
        ) : null}
        <Button variant="ghost" size="sm" className={rowClass} {...startProps}>
          <Search className={iconClass} aria-hidden="true" />
          <span className="min-w-0 truncate">Research again</span>
        </Button>
      </div>
    )
  }

  if (research?.status === 'NO_FINDINGS') {
    return (
      <div>
        <Button variant="ghost" size="sm" className={rowClass} {...startProps}>
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
        <Button variant="ghost" size="sm" className={rowClass} {...startProps}>
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

  // Everything else — no job, or a cancelled one — is the entry point again.
  // A *completed* run no longer arrives here: it has its own row above, which
  // is the whole point of `hasReportToRead`.
  return (
    <Button variant="ghost" size="sm" className={rowClass} {...startProps}>
      <Search className={iconClass} aria-hidden="true" />
      <span className="min-w-0 truncate">Research this brand</span>
    </Button>
  )
}

/**
 * Elapsed time across the quoted window. **Decorative, and deliberately so.**
 *
 * `aria-hidden`, with no `progressbar` role and no value: a progress bar
 * announces a *proportion of work done*, and this is not that — the vendor
 * reports nothing until it reports everything. The authoritative statement is
 * the text beside it, which a screen reader already gets as a running clock and
 * a spoken pace line. Drawing a bar that assistive tech would read as "62%
 * complete" would be exactly the fake meter 1.13.0 refused to ship.
 *
 * Once past the window it is full and carries the same warning tint as the
 * failed row's glyph — one 14px-equivalent of colour, which is the rail's whole
 * accent budget for a background job.
 *
 * **`stalled` is the poll failing, and it takes the glide away.** The clock
 * beside it keeps counting, because elapsed-since-`startedAt` stays true whether
 * or not this browser can reach the server — but a bar smoothly advancing is
 * read as *live confirmation that work is happening*, which is the one thing a
 * dead connection cannot attest to. It dims and steps instead of gliding, so the
 * row keeps its height and stops making the claim.
 */
function ResearchPaceMeter({
  fraction,
  pace,
  stalled = false,
}: {
  fraction: number
  pace: ResearchPace
  stalled?: boolean
}) {
  return (
    <div
      className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/20"
      aria-hidden="true"
    >
      <div
        className={cn(
          'h-full rounded-full',
          // Matches the 1s tick, so the fill glides instead of stepping. Linear
          // because a run has no acceleration to imply.
          !stalled && 'transition-[width] duration-1000 ease-linear',
          pace === 'normal'
            ? 'bg-muted-foreground/60'
            : 'bg-[var(--color-status-warning)] opacity-70',
          stalled && 'opacity-30',
        )}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  )
}
