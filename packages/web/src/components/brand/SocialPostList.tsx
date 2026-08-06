import { Fragment } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { BrandAsset, SocialPost, SocialPostStatus } from '@brandfactory/shared'
import { deferUntilMenuClosed } from '@/components/entity/EntityMenu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { assetUrl } from '@/lib/asset-url'
import { formatDayHeading, formatTimeOfDay, groupByDay, localDayKey } from '@/lib/calendar'
import {
  formatKeyDateRange,
  KEY_DATE_APPEARANCE,
  KEY_DATE_SET_LABELS,
  keyDatesByDay,
  splitByShape,
  upcomingKeyDates,
  type KeyDate,
} from '@/lib/key-dates'
import { PLATFORM_LABELS, postExcerpt, STATUS_LABELS } from '@/lib/social-copy'
import { cn } from '@/lib/utils'

/**
 * How many entries the **Key dates** block lists.
 *
 * Enough to cover the next month or two of a fully switched-on calendar without
 * the block outgrowing the posts underneath it — the list is a plan of *your*
 * work, and this is context for it.
 */
const UPCOMING_KEY_DATES_SHOWN = 6

// ---------------------------------------------------------------------------
// SocialPostList — the calendar's other reading
// ---------------------------------------------------------------------------
//
// The month grid answers "what is this month shaped like"; this answers "what
// is next, and what did we say we would do". Three regions, in the order a
// planner reads them:
//
//   Unscheduled — the tray. Posts with no slot are **invisible in the grid**,
//                 which is exactly why the list leads with them: an idea
//                 written down and never scheduled must not quietly vanish
//                 behind a month someone has stopped looking at.
//   Upcoming    — today first, then forward.
//   Past        — yesterday first, then backwards. Both halves run *away* from
//                 now, so the rows nearest the present are nearest the middle
//                 and neither half buries today under a year of history.
//
// Pure, like every `components/brand` view: no queries, and every affordance
// renders only when its callback prop does.

export interface SocialPostListProps {
  /** In `bySchedule` order, as the query and the cache applier keep it. */
  posts: SocialPost[]
  /** The brand's assets, for attachment thumbnails. Ids that miss are skipped. */
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  /**
   * Injectable clock — the `formatRelativeTime` precedent. Which day counts as
   * today is the one thing here that changes without any data changing, and a
   * test cannot pin the Upcoming/Past split otherwise.
   */
  now?: Date
  /**
   * The enabled sets' dates, already filtered and deduped by the page. Empty
   * renders exactly what this list rendered before the feature existed.
   */
  keyDates?: KeyDate[]
  onEditPost?: (post: SocialPost) => void
  onMarkPosted?: (post: SocialPost) => void
  onDeletePost?: (post: SocialPost) => void
}

export function SocialPostList({
  posts,
  assets,
  resolveBlob,
  now = new Date(),
  keyDates = [],
  onEditPost,
  onMarkPosted,
  onDeletePost,
}: SocialPostListProps) {
  const unscheduled = posts.filter((p) => p.scheduledAt === null)
  const byDay = [...groupByDay(posts).entries()]
  const todayKey = localDayKey(now)
  // `YYYY-MM-DD` compares lexicographically the way it compares chronologically,
  // which is the whole reason the key has that shape.
  const upcoming = byDay.filter(([key]) => key >= todayKey)
  const past = byDay.filter(([key]) => key < todayKey).reverse()

  // Two readings of the same dates, and they answer different questions.
  //
  // `byKeyDay` annotates the days you have **already planned into** — a suffix
  // on a heading that exists anyway. Only single days: a season has no one day
  // to hang off, and the grid's strip is where seasons belong.
  //
  // `upcomingKeys` is the block at the head of Upcoming, and it is the half
  // that earns the feature. Suffixes only ever appear on days that already have
  // posts, so without this a Deepavali nobody has planned for is invisible on
  // the one surface whose job is to say what is coming. Seasons are included
  // here precisely because they are absent from the suffixes.
  const byKeyDay = keyDatesByDay(splitByShape(keyDates).days)
  const upcomingKeys = upcomingKeyDates(keyDates, now, UPCOMING_KEY_DATES_SHOWN)

  const rowProps = { assets, resolveBlob, onEditPost, onMarkPosted, onDeletePost }

  // **Before anything key-date-shaped renders.** A calendar with no posts and
  // eight key dates is still empty of *your* work, which is the only thing this
  // sentence has ever been about — and a Key dates block above it would make
  // the surface look populated while the sentence says it is not.
  if (posts.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        Nothing planned yet. Start a post and it will appear here — with or without a date.
      </p>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {unscheduled.length > 0 && (
        <section>
          <RegionHeading
            title="Unscheduled"
            detail={`${unscheduled.length} ${unscheduled.length === 1 ? 'post' : 'posts'}`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            No slot yet, so these do not appear on the calendar.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {unscheduled.map((post) => (
              <PostRow key={post.id} post={post} {...rowProps} />
            ))}
          </ul>
        </section>
      )}

      {/* The section now opens for key dates alone: a brand whose posts are all
          in the past still has a next Deepavali, and hiding it because nothing
          is scheduled would be the same silence this block exists to break.
          With `keyDates` empty the condition is exactly what it was. */}
      {(upcoming.length > 0 || upcomingKeys.length > 0) && (
        <section>
          <RegionHeading title="Upcoming" />
          <KeyDatesBlock keyDates={upcomingKeys} />
          <DayGroups groups={upcoming} now={now} byKeyDay={byKeyDay} rowProps={rowProps} />
        </section>
      )}

      {past.length > 0 && (
        <section>
          <RegionHeading title="Past" />
          {/* Past days get suffixes too — a post that went out on Deepavali is
              worth knowing about when you are reading back over what you did. */}
          <DayGroups groups={past} now={now} byKeyDay={byKeyDay} rowProps={rowProps} />
        </section>
      )}
    </div>
  )
}

type RowProps = Pick<
  SocialPostListProps,
  'assets' | 'resolveBlob' | 'onEditPost' | 'onMarkPosted' | 'onDeletePost'
>

/**
 * What is coming that you have **not** planned for.
 *
 * Chronological across every enabled set, not grouped by set. The plan and the
 * proposal both describe this as grouped under a per-set heading, and the
 * reason they give is that the colour must never be the only carrier of which
 * set a row belongs to — which the named label on each row satisfies just as
 * completely. Grouping would scatter the timeline: with six entries over three
 * sets, the earliest date can land at the bottom of the block, and *when* is
 * the axis this block exists to answer.
 */
function KeyDatesBlock({ keyDates }: { keyDates: KeyDate[] }) {
  if (keyDates.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5 rounded-xl border bg-card p-3">
      {keyDates.map((keyDate) => (
        <li key={keyDate.id} className="flex items-baseline gap-2 text-sm">
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 translate-y-[-1px] rounded-full',
              KEY_DATE_APPEARANCE[keyDate.set].dot,
            )}
          />
          <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatKeyDateRange(keyDate)}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {keyDate.name}
            {keyDate.note && (
              <span className="ml-2 text-xs text-muted-foreground">{keyDate.note}</span>
            )}
          </span>
          {/* The set, in words. Phase B measured rose and teal at ΔE 8.4 under
              simulated protanopia — the dot is the fast path, this is the one
              that always works. */}
          <span className="shrink-0 text-xs text-muted-foreground">
            {KEY_DATE_SET_LABELS[keyDate.set]}
          </span>
        </li>
      ))}
    </ul>
  )
}

function DayGroups({
  groups,
  now,
  byKeyDay,
  rowProps,
}: {
  groups: Array<[string, SocialPost[]]>
  now: Date
  byKeyDay: Map<string, KeyDate[]>
  rowProps: RowProps
}) {
  return (
    <div className="mt-3 flex flex-col gap-5">
      {groups.map(([dayKey, dayPosts]) => (
        <div key={dayKey}>
          <h3 className="text-xs font-medium text-muted-foreground">
            {/* The suffix is built *beside* `formatDayHeading`'s output, never
                inside it: that function is a pure string used in two places and
                one of them is an `aria-label`, where a dot and a middot would
                be read aloud as punctuation. */}
            {formatDayHeading(dayKey, now)}
            {(byKeyDay.get(dayKey) ?? []).map((keyDate) => (
              <Fragment key={keyDate.id}>
                {/* The separator is a real text node **outside** the flex span,
                    and both halves of that matter. A heading's accessible name
                    is its text content, so CSS `gap` alone would read
                    "Today·Deepavali" to a screen reader — hence a literal
                    string. But a string placed *inside* an `inline-flex`
                    becomes a flex item, and a flex item's surrounding
                    whitespace is stripped: that rendered "Sun 9 Aug· National
                    Day", with the middot welded to the date. Out here in the
                    heading's normal flow the spaces survive. */}
                {' · '}
                <span className="inline-flex items-baseline gap-1">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      KEY_DATE_APPEARANCE[keyDate.set].dot,
                    )}
                  />
                  {keyDate.name}
                </span>
              </Fragment>
            ))}
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {dayPosts.map((post) => (
              <PostRow key={post.id} post={post} showTime {...rowProps} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function RegionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
}

function PostRow({
  post,
  showTime = false,
  assets,
  resolveBlob,
  onEditPost,
  onMarkPosted,
  onDeletePost,
}: {
  post: SocialPost
  showTime?: boolean
} & RowProps) {
  const excerpt = postExcerpt(post)
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-elevation-1">
      {showTime && post.scheduledAt && (
        <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTimeOfDay(post.scheduledAt)}
        </span>
      )}
      <span className="shrink-0 text-sm font-medium">{PLATFORM_LABELS[post.platform]}</span>
      <StatusPill status={post.status} />
      {/* The excerpt doubles as the edit affordance — a whole clickable row
          would have to nest the ⋯ trigger inside it, and a button inside a
          button is invalid in both the DOM and the accessibility tree. */}
      {onEditPost ? (
        <button
          type="button"
          onClick={() => onEditPost(post)}
          className={cn(
            'min-w-0 flex-1 truncate rounded-sm text-left text-sm transition-colors duration-150 hover:text-foreground',
            post.body ? 'text-foreground' : 'text-muted-foreground italic',
          )}
        >
          {excerpt}
        </button>
      ) : (
        <p
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            post.body ? '' : 'text-muted-foreground italic',
          )}
        >
          {excerpt}
        </p>
      )}
      <Thumbs post={post} assets={assets} resolveBlob={resolveBlob} />
      <PostRowMenu
        post={post}
        excerpt={excerpt}
        onEditPost={onEditPost}
        onMarkPosted={onMarkPosted}
        onDeletePost={onDeletePost}
      />
    </li>
  )
}

/**
 * `Draft` / `Ready` / `Posted`. Neutral, positive, settled — the three are a
 * decision someone made, not a pipeline stage the system observed, so none of
 * them is coloured as a warning when its time slips.
 */
const STATUS_PILL: Record<SocialPostStatus, string> = {
  draft: 'bg-surface-sunken text-muted-foreground',
  ready: 'border border-[var(--border-strong)] text-foreground',
  posted: 'bg-primary/10 text-primary',
}

function StatusPill({ status }: { status: SocialPostStatus }) {
  return (
    <span
      className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', STATUS_PILL[status])}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

const THUMBS_SHOWN = 3

function Thumbs({
  post,
  assets,
  resolveBlob,
}: {
  post: SocialPost
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
}) {
  const byId = new Map(assets.map((a) => [a.id, a]))
  // An id whose asset is soft-deleted resolves to nothing and is skipped —
  // proposal §5. Restoring the asset brings it back onto every post that
  // referenced it, for free, because the join row was never destroyed.
  const attached = post.assetIds.map((id) => byId.get(id)).filter((a) => a !== undefined)
  if (attached.length === 0) return null
  const shown = attached.slice(0, THUMBS_SHOWN)
  const rest = attached.length - shown.length
  return (
    <div className="flex shrink-0 items-center gap-1">
      {shown.map((asset) => {
        const url = assetUrl(asset, resolveBlob)
        return url ? (
          <img
            key={asset.id}
            src={url}
            alt={asset.alt ?? asset.label}
            className="size-8 rounded-md border object-cover"
          />
        ) : (
          <span
            key={asset.id}
            aria-hidden="true"
            className="size-8 rounded-md border bg-surface-sunken"
          />
        )
      })}
      {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
    </div>
  )
}

function PostRowMenu({
  post,
  excerpt,
  onEditPost,
  onMarkPosted,
  onDeletePost,
}: {
  post: SocialPost
  excerpt: string
} & Pick<RowProps, 'onEditPost' | 'onMarkPosted' | 'onDeletePost'>) {
  // `Mark posted` is absent on a post already marked, rather than disabled: a
  // menu item that does nothing is the dead affordance 1.7.0 went to remove.
  const canMarkPosted = onMarkPosted && post.status !== 'posted'
  if (!onEditPost && !canMarkPosted && !onDeletePost) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={`Actions for ${excerpt}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Deferred by a macrotask because Edit opens a dialog — the two live
            focus scopes `EntityMenu` documents in full. */}
        {onEditPost && (
          <DropdownMenuItem onSelect={() => deferUntilMenuClosed(() => onEditPost(post))}>
            Edit
          </DropdownMenuItem>
        )}
        {canMarkPosted && (
          <DropdownMenuItem onSelect={() => onMarkPosted(post)}>Mark posted</DropdownMenuItem>
        )}
        {onDeletePost && (
          <DropdownMenuItem variant="destructive" onSelect={() => onDeletePost(post)}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
