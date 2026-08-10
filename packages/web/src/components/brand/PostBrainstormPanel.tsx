import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import type { IdeateOutcome, PostIdea, SocialPlatform } from '@brandfactory/shared'
import { Button } from '@/components/ui/button'
import { formatDayHeading } from '@/lib/calendar'
import { PLATFORM_LABELS } from '@/lib/social-copy'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// PostBrainstormPanel — three angles, beside the form they fill
// ---------------------------------------------------------------------------
//
// Door 3. The planner (Door 1) answers *what should this month look like*; this
// answers *what do I say here*, for one day and one platform, while the form
// that will hold the answer is still on screen. It is the same route and the
// same two passes — pass 1 for the angles, pass 2 for the caption of the one
// that is picked — so nothing about how ideas are produced is duplicated here.
//
// **Pure, and it holds no query.** Every value it renders belongs to
// `PostEditorForm`, which owns the date and the platform this run is about and
// the `Copy` field the answer lands in. That is the same seam `PostPlannerPanel`
// keeps with `usePostPlanner`, one scale smaller: the state sits with the thing
// it describes, and the money is spent by the page.
//
// **A platform is required, and the panel says so rather than guessing one.**
// Pass 2 writes per platform on purpose — a LinkedIn caption is not an
// Instagram one — so a run with no platform chosen would be a run for nowhere,
// and picking one for the user would be a guess arriving as a fact. The form
// leaves the platform empty for exactly this reason (see its `useState`), and
// this panel is not the place to overturn that.

export interface PostBrainstormPanelProps {
  /** The day the angles are for — the form's date field, or today. */
  dayKey: string
  /** The platform the run writes for. `null` = not chosen yet. */
  platform: SocialPlatform | null
  /** Injectable clock, so a heading reading *Today* can be pinned in a test. */
  now?: Date

  /** `null` before a run. An empty array is a run that returned nothing. */
  ideas: PostIdea[] | null
  /** The last run's outcome, for the honest line when it is not `ok`. */
  outcome?: IdeateOutcome | null
  running?: boolean
  /** The angle whose caption is being written, or `null`. */
  writingIndex?: number | null
  /** The angle whose caption is in the `Copy` field, or `null`. */
  usedIndex?: number | null

  onRun: () => void
  onUse: (index: number) => void
  /**
   * Put back the copy an angle replaced. **Absent when there is nothing to put
   * back** — the field was empty, or the replacement has already been undone.
   */
  onUndo?: () => void
}

export function PostBrainstormPanel({
  dayKey,
  platform,
  now,
  ideas,
  outcome,
  running,
  writingIndex = null,
  usedIndex = null,
  onRun,
  onUse,
  onUndo,
}: PostBrainstormPanelProps) {
  const heading = formatDayHeading(dayKey, now ?? new Date())
  const busy = Boolean(running) || writingIndex !== null

  return (
    <section
      aria-label="Brainstorm"
      className="flex flex-col gap-3 rounded-lg border bg-surface-sunken p-3 sm:w-[280px] sm:shrink-0"
    >
      <p className="text-xs text-muted-foreground">
        {platform ? (
          <>
            Angles for <span className="font-medium text-foreground">{heading}</span> on{' '}
            <span className="font-medium text-foreground">{PLATFORM_LABELS[platform]}</span>.
          </>
        ) : (
          // Not a disabled button with no explanation: the fix is one field
          // away and the reason it is required is the reason pass 2 exists.
          'Choose a platform first. The copy is written for one platform, and an Instagram caption is not a LinkedIn one.'
        )}
      </p>

      {ideas !== null && ideas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ideas.map((idea, index) => (
            <AngleCard
              key={index}
              idea={idea}
              used={usedIndex === index}
              writing={writingIndex === index}
              disabled={busy}
              onUse={() => onUse(index)}
            />
          ))}
        </ul>
      )}

      {outcome && outcome !== 'ok' && (
        <p className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
          {outcome === 'no-ideas'
            ? 'Nothing came back for this day. Try another platform, or write the post yourself.'
            : 'The model did not answer in the expected shape. Try again, or choose another model in the workspace settings.'}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRun}
        disabled={busy || !platform}
      >
        {running ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        {/* A second run replaces the list and costs what the first one cost.
            The label says *more* rather than *again* so nobody reads it as a
            free retry of a call that already answered. */}
        {running ? 'Thinking…' : ideas === null ? 'Three angles' : 'Three more angles'}
      </Button>

      {/* Offered only after an angle has overwritten something a person typed.
          The copy the model wrote is on screen and editable either way; this
          is the only thing on this surface that cannot be got back by hand. */}
      {onUndo && (
        <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={busy}>
          <Undo2 className="size-4" aria-hidden="true" />
          Put my copy back
        </Button>
      )}
    </section>
  )
}

/**
 * One angle.
 *
 * `Use this` is the only action: an angle is not accepted or rejected the way a
 * planner card is, because nothing here is committed — the caption lands in a
 * field the user still has to submit, and the way to reject an angle is to pick
 * another one or to close the column.
 */
function AngleCard({
  idea,
  used,
  writing,
  disabled,
  onUse,
}: {
  idea: PostIdea
  used: boolean
  writing: boolean
  disabled: boolean
  onUse: () => void
}) {
  return (
    <li
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border bg-background p-2.5',
        used && 'border-[var(--border-strong)]',
      )}
    >
      <p className="text-sm font-medium">{idea.title}</p>
      <p className="text-xs text-muted-foreground">{idea.angle}</p>
      {idea.reason && <p className="text-xs text-muted-foreground italic">{idea.reason}</p>}
      {idea.keyDateName && (
        <span className="self-start rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {idea.keyDateName}
        </span>
      )}
      <Button
        type="button"
        variant={used ? 'secondary' : 'outline'}
        size="sm"
        className="self-start"
        onClick={onUse}
        disabled={disabled}
        aria-label={`Use ${idea.title}`}
      >
        {writing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {/* `Use this` again on the angle already in the field rewrites it —
            same angle, a second caption. Stated, because a button that has
            visibly already been pressed has to say what pressing it again
            does. */}
        {writing ? 'Writing…' : used ? 'Rewrite this' : 'Use this'}
      </Button>
    </li>
  )
}
