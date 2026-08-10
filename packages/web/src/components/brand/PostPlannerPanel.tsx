import { Loader2, Sparkles, Undo2, X } from 'lucide-react'
import type {
  BrandWithSections,
  IdeateOutcome,
  IdeatePillar,
  PostIdea,
  SocialPlatform,
} from '@brandfactory/shared'
import { BrandContextStrip } from '@/components/brand/BrandContextStrip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDayHeading } from '@/lib/calendar'
import type { KeyDate } from '@/lib/key-dates'
import { PLATFORM_LABELS, PLATFORM_OPTIONS } from '@/lib/social-copy'
import {
  commitPairs,
  type IdeaSelection,
  type PlannerBatchSize,
  type PlannerWindow,
  type PlannerWindowChoice,
} from '@/lib/social-plan'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// PostPlannerPanel — the month, planned beside the month
// ---------------------------------------------------------------------------
//
// A side panel over the calendar page rather than a route of its own, because
// planning happens *while you look at the month*: which days are empty, which
// key dates are coming, what is already there. The grid stays on the left and
// fills as the commit runs. A separate page would tear the plan away from the
// grid it is planning into.
//
// Three stages, in the order the money is spent:
//
//   1. **Brief** — what the model will read, and what the run will cost in
//      ideas, stated *before* anything is spent. This is where Phase A's
//      context state and Phase C's arithmetic pay off: the user can see that a
//      brand with one written section is about to plan a month, and close the
//      panel instead.
//   2. **Ideas** — pass 1's batch under its pillars, every card accepted until
//      it is rejected (see `IdeaSelection`).
//   3. **Commit** — pass 2 over the accepted (idea × platform) pairs, then the
//      writes. Rendered as progress rather than as a third screen: the decisions
//      are all made by then and the only new fact is how far it has got.
//
// **Pure, and it holds no query.** Every value it renders and every piece of
// state it changes belongs to the page — the seam `AssetLibraryView` established
// and `SocialCalendarView` follows, and the reason the whole panel is testable
// without a `QueryClient`. It spends nothing itself; it calls `onRun` and
// `onCommit`, and the page decides what those cost.
//
// Built from plain elements and the existing `Button` / `Input` primitives.
// There is no sheet primitive in `components/ui`, and a panel that is an
// `<aside>` in the page's own flow does not need one — the below-`lg` fixed
// overlay is four utility classes on the same element.

/** The narrowest cadence the picker accepts, and the widest — `IdeateThemesInputSchema`. */
const MIN_CADENCE = 1
const MAX_CADENCE = 21

export interface PostPlannerPanelProps {
  /** The brand being planned for. Its sections are the brief's context state. */
  brand: BrandWithSections
  onClose: () => void
  /**
   * Injected, the `formatDayHeading` precedent: a card reading *Tomorrow* is
   * the one thing here that changes without any data changing.
   */
  now?: Date

  // ---- stage 1: the brief -------------------------------------------------
  window: PlannerWindow
  windowChoice: PlannerWindowChoice
  onWindowChoiceChange: (choice: PlannerWindowChoice) => void
  /** The key dates overlapping the window — the ones the request quotes. */
  keyDates?: KeyDate[]
  /** Live scheduled posts already inside the window. */
  planned: number
  platforms: SocialPlatform[]
  onPlatformsChange: (platforms: SocialPlatform[]) => void
  cadence: number
  /** Where the number came from. Shown, always — see `inferCadence`. */
  cadenceSource: 'history' | 'suggested'
  onCadenceChange: (perWeek: number) => void
  batch: PlannerBatchSize

  // ---- stage 2: the ideas -------------------------------------------------
  /** `null` before a run. An empty array is a run that returned nothing. */
  ideas: PostIdea[] | null
  pillars: IdeatePillar[]
  selections: IdeaSelection[]
  onToggleIdea: (index: number) => void
  onRemovePlatform: (index: number, platform: SocialPlatform) => void
  /** The last run's outcome, for the honest line when it is not `ok`. */
  outcome?: IdeateOutcome | null
  /** Save the proposed pillars into the brand. Absent = no offer. */
  onSavePillars?: () => void
  savingPillars?: boolean

  // ---- the three actions --------------------------------------------------
  onRun: () => void
  /** Throw away this run's ideas and go back to the brief. */
  onReset: () => void
  onCommit: () => void
  running?: boolean
  writing?: boolean
  /** Rows written so far, while stage 3 runs. */
  progress?: { done: number; total: number } | null
}

export function PostPlannerPanel({
  brand,
  onClose,
  now,
  window,
  windowChoice,
  onWindowChoiceChange,
  keyDates = [],
  planned,
  platforms,
  onPlatformsChange,
  cadence,
  cadenceSource,
  onCadenceChange,
  batch,
  ideas,
  pillars,
  selections,
  onToggleIdea,
  onRemovePlatform,
  outcome,
  onSavePillars,
  savingPillars,
  onRun,
  onReset,
  onCommit,
  running,
  writing,
  progress,
}: PostPlannerPanelProps) {
  const rows = ideas ? commitPairs(ideas, selections).length : 0

  return (
    <aside
      aria-label="Post planner"
      // Below `lg` the panel covers the grid: side by side on a small screen is
      // a promise the layout cannot keep (Q4). Above it, a 400px column in the
      // page's own flow — which is why the page drops its `max-w-6xl` while
      // this is open, and the grid keeps roughly the width it had.
      className={cn(
        'fixed inset-0 z-40 flex flex-col gap-4 overflow-auto bg-background p-4',
        'lg:static lg:z-auto lg:w-[400px] lg:shrink-0 lg:rounded-xl lg:border lg:p-5',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Plan</h2>
          <p className="text-sm text-muted-foreground">
            {ideas
              ? 'Reject what does not fit, then create the rest.'
              : 'What the model will read.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close the planner">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      {/* Phase A's strip, unchanged: the brand, how much of it is written, and
          the dates in play. It is the same claim the dialog makes — *this is
          what is known before anything is written* — and stating it twice in
          two vocabularies would be the drift the component exists to prevent. */}
      <BrandContextStrip brand={brand} keyDates={keyDates} />

      {ideas === null ? (
        <Brief
          window={window}
          windowChoice={windowChoice}
          onWindowChoiceChange={onWindowChoiceChange}
          planned={planned}
          platforms={platforms}
          onPlatformsChange={onPlatformsChange}
          cadence={cadence}
          cadenceSource={cadenceSource}
          onCadenceChange={onCadenceChange}
          batch={batch}
          outcome={outcome}
          running={running}
          onRun={onRun}
        />
      ) : (
        <Ideas
          ideas={ideas}
          now={now}
          pillars={pillars}
          selections={selections}
          onToggleIdea={onToggleIdea}
          onRemovePlatform={onRemovePlatform}
          onSavePillars={onSavePillars}
          savingPillars={savingPillars}
          rows={rows}
          onReset={onReset}
          onCommit={onCommit}
          writing={writing}
          progress={progress}
        />
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Stage 1 — the brief
// ---------------------------------------------------------------------------

function Brief({
  window,
  windowChoice,
  onWindowChoiceChange,
  planned,
  platforms,
  onPlatformsChange,
  cadence,
  cadenceSource,
  onCadenceChange,
  batch,
  outcome,
  running,
  onRun,
}: Pick<
  PostPlannerPanelProps,
  | 'window'
  | 'windowChoice'
  | 'onWindowChoiceChange'
  | 'planned'
  | 'platforms'
  | 'onPlatformsChange'
  | 'cadence'
  | 'cadenceSource'
  | 'onCadenceChange'
  | 'batch'
  | 'outcome'
  | 'running'
  | 'onRun'
>) {
  return (
    <>
      <section className="flex flex-col gap-1.5">
        <Label id="planner-window-label">Window</Label>
        <div role="group" aria-labelledby="planner-window-label" className="flex gap-2">
          <ChoiceButton
            pressed={windowChoice === 'month'}
            onClick={() => onWindowChoiceChange('month')}
          >
            This month
          </ChoiceButton>
          <ChoiceButton
            pressed={windowChoice === 'four-weeks'}
            onClick={() => onWindowChoiceChange('four-weeks')}
          >
            Next four weeks
          </ChoiceButton>
        </div>
        <p className="text-xs text-muted-foreground">
          {window.start} to {window.end} · {planned} {planned === 1 ? 'post' : 'posts'} already
          planned
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <Label id="planner-platforms-label">Platforms</Label>
        <div
          role="group"
          aria-labelledby="planner-platforms-label"
          className="flex flex-wrap gap-1.5"
        >
          {PLATFORM_OPTIONS.map((option) => {
            const on = platforms.includes(option.value)
            return (
              <ChoiceButton
                key={option.value}
                pressed={on}
                onClick={() =>
                  onPlatformsChange(
                    on ? platforms.filter((p) => p !== option.value) : [...platforms, option.value],
                  )
                }
              >
                {option.label}
              </ChoiceButton>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <Label htmlFor="planner-cadence">Posts per week</Label>
        <Input
          id="planner-cadence"
          type="number"
          min={MIN_CADENCE}
          max={MAX_CADENCE}
          value={cadence}
          className="w-24"
          onChange={(e) => {
            const next = Number(e.target.value)
            if (!Number.isFinite(next)) return
            onCadenceChange(Math.min(MAX_CADENCE, Math.max(MIN_CADENCE, Math.round(next))))
          }}
        />
        {/* The source, always. An inference nobody can see is a guess wearing
            the clothes of a fact, and this is the number the whole batch is
            sized from. */}
        <p className="text-xs text-muted-foreground">
          {cadenceSource === 'history' ? 'From your last 4 weeks' : 'Suggested — no history yet'} ·{' '}
          {batch.count} ideas for {batch.slots} {batch.slots === 1 ? 'slot' : 'slots'}
        </p>
      </section>

      {outcome && outcome !== 'ok' && <OutcomeLine outcome={outcome} />}

      <Button onClick={onRun} disabled={running || platforms.length === 0} className="mt-auto">
        {running ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        {running ? 'Planning…' : `Plan ${batch.count} ideas`}
      </Button>
    </>
  )
}

/**
 * The two honest non-answers, in words.
 *
 * Neither is an error and neither is retried automatically: `no-ideas` is a
 * complete answer to a full window, and `invalid-shape` is a fact about the
 * configured model rather than about the brand.
 */
function OutcomeLine({ outcome }: { outcome: IdeateOutcome }) {
  return (
    <p className="rounded-lg border bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
      {outcome === 'no-ideas'
        ? 'No ideas came back for this window. Every day and platform in it may already be taken — widen the window, or add a platform.'
        : 'The model did not answer in the expected shape. Try again, or choose another model in the workspace settings.'}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Stage 2 — the ideas, and the commit at the foot of them
// ---------------------------------------------------------------------------

function Ideas({
  ideas,
  now,
  pillars,
  selections,
  onToggleIdea,
  onRemovePlatform,
  onSavePillars,
  savingPillars,
  rows,
  onReset,
  onCommit,
  writing,
  progress,
}: Pick<
  PostPlannerPanelProps,
  | 'now'
  | 'pillars'
  | 'selections'
  | 'onToggleIdea'
  | 'onRemovePlatform'
  | 'onSavePillars'
  | 'savingPillars'
  | 'onReset'
  | 'onCommit'
  | 'writing'
  | 'progress'
> & { ideas: PostIdea[]; rows: number }) {
  const proposed = pillars.some((p) => p.proposed)
  const groups = groupIdeas(ideas, pillars)

  return (
    <>
      {proposed && (
        <div className="flex flex-col gap-2 rounded-lg border bg-surface-sunken px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {/* Proposed, and said so. Two runs on a brand that never saves them
                will disagree — the save is the fix, and this marker is what
                tells the user the fix exists. */}
            This brand has no <span className="font-medium">Content pillars</span> yet. These were
            proposed for this run only.
          </p>
          {onSavePillars && (
            <Button variant="outline" size="sm" onClick={onSavePillars} disabled={savingPillars}>
              {savingPillars ? 'Saving…' : 'Save these pillars to the brand'}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.name} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.name}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.items.map(({ idea, index }) => (
                <IdeaCard
                  key={index}
                  idea={idea}
                  now={now}
                  selection={selections[index]}
                  onToggle={() => onToggleIdea(index)}
                  onRemovePlatform={(platform) => onRemovePlatform(index, platform)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t pt-3">
        {progress && (
          <p className="text-xs text-muted-foreground" role="status">
            Written {progress.done} of {progress.total}…
          </p>
        )}
        {/* The **row** count, which is the sum of the chips and not of the
            cards (Q8). Nobody should be surprised by six rows from four cards. */}
        <Button onClick={onCommit} disabled={writing || rows === 0}>
          {writing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {writing ? 'Writing…' : `Create ${rows} ${rows === 1 ? 'post' : 'posts'}`}
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={writing}>
          <Undo2 className="size-4" aria-hidden="true" />
          Back to the brief
        </Button>
      </div>
    </>
  )
}

function IdeaCard({
  idea,
  now,
  selection,
  onToggle,
  onRemovePlatform,
}: {
  idea: PostIdea
  now?: Date
  selection: IdeaSelection | undefined
  onToggle: () => void
  onRemovePlatform: (platform: SocialPlatform) => void
}) {
  const rejected = selection?.rejected ?? false
  const platforms = selection?.platforms ?? []

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        rejected && 'opacity-50 grayscale',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{idea.title}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-pressed={!rejected}
          aria-label={`${rejected ? 'Accept' : 'Reject'} ${idea.title}`}
        >
          {rejected ? 'Accept' : 'Reject'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{idea.angle}</p>
      {idea.reason && <p className="text-xs text-muted-foreground italic">{idea.reason}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* The list view's own heading format, from the same function: a card
            reading `Mon 9 Aug` and a day heading reading the same is not a
            coincidence worth risking to a second formatter. The tray is a real
            place in this product, not a failure, so a dateless card says so
            rather than leaving a blank where a date would be. */}
        <Meta>{idea.date ? formatDayHeading(idea.date, now ?? new Date()) : 'Unscheduled'}</Meta>
        {idea.keyDateName && <Meta accent>{idea.keyDateName}</Meta>}
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {platforms.map((platform) => (
          <li key={platform}>
            <button
              type="button"
              onClick={() => onRemovePlatform(platform)}
              disabled={rejected}
              className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted disabled:pointer-events-none"
              aria-label={`Remove ${PLATFORM_LABELS[platform]} from ${idea.title}`}
            >
              {PLATFORM_LABELS[platform]}
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
        {platforms.length === 0 && (
          <li className="text-xs text-muted-foreground">No platform — this card writes nothing.</li>
        )}
      </ul>
    </li>
  )
}

/**
 * A small fact on a card: the day, or the key date it hangs off.
 *
 * The key date is the stronger claim, so it carries the foreground ink — the
 * same relation `MonthPlanSummary` uses between its bold clause and its tail.
 * No new colour: §4 keeps the accent scarce, and a card of chips is not where
 * it should be spent.
 */
function Meta({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-md bg-muted px-2 py-0.5 text-xs',
        accent ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

/** A segmented choice, `ViewToggle`'s idiom: `aria-pressed` carries the state. */
function ChoiceButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={pressed ? 'secondary' : 'outline'}
      size="sm"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * The cards under their pillars, **key-date ideas first inside each group**.
 *
 * A date-anchored idea is the one with a deadline attached to it, and the one
 * whose rejection costs something the calendar cannot offer again — so it is
 * read first. Everything else keeps the order the model returned.
 *
 * Ideas whose pillar matches nothing the run reported fall under a final group
 * rather than vanishing: the model names its own `pillar` per idea, and a name
 * that does not match the pillar list exactly is a mismatch in the answer, not
 * a reason to hide a card the user has already paid for.
 */
function groupIdeas(
  ideas: PostIdea[],
  pillars: IdeatePillar[],
): { name: string; items: { idea: PostIdea; index: number }[] }[] {
  const order = new Map<string, number>()
  pillars.forEach((pillar, i) => order.set(pillar.name, i))

  const groups = new Map<string, { idea: PostIdea; index: number }[]>()
  ideas.forEach((idea, index) => {
    const name = idea.pillar && order.has(idea.pillar) ? idea.pillar : OTHER_GROUP
    const bucket = groups.get(name)
    if (bucket) bucket.push({ idea, index })
    else groups.set(name, [{ idea, index }])
  })

  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? Infinity) - (order.get(b[0]) ?? Infinity))
    .map(([name, items]) => ({
      name,
      // Stable sort, so the model's own order survives inside each half.
      items: [...items].sort(
        (a, b) => Number(Boolean(b.idea.keyDateName)) - Number(Boolean(a.idea.keyDateName)),
      ),
    }))
}

const OTHER_GROUP = 'Other ideas'
