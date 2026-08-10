import type { ReactNode } from 'react'
import { CalendarDays, List, Plus, Sparkles } from 'lucide-react'
import type {
  BrandAsset,
  BrandAssetId,
  BrandWithSections,
  CreateSocialPostInput,
  SocialPost,
  SocialPostId,
  UpdateSocialPostInput,
} from '@brandfactory/shared'
import { CalendarMonthGrid } from '@/components/brand/CalendarMonthGrid'
import { KeyDatesMenu } from '@/components/brand/KeyDatesMenu'
import { MonthPlanSummary } from '@/components/brand/MonthPlanSummary'
import { PostEditorDialog, type PostEditorDialogProps } from '@/components/brand/PostEditorDialog'
import { SocialPostList } from '@/components/brand/SocialPostList'
import type { MiniApp } from '@/components/brand/miniApps'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import type { KeyDate, KeyDateSet } from '@/lib/key-dates'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// SocialCalendarView — the pure half of the social calendar
// ---------------------------------------------------------------------------
//
// Header, the two readings of one list, and the editor dialog. Every piece of
// state it renders belongs to `SocialCalendarPage`; this file decides only
// what is on screen, which is what keeps the whole surface testable without a
// QueryClient — the seam `AssetLibraryView` established and `AssetLibraryPage`
// proved out.

export type SocialCalendarViewMode = 'calendar' | 'list'

export interface SocialCalendarViewProps {
  app: MiniApp
  posts: SocialPost[]
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  now?: Date
  /**
   * The brand this calendar plans for. Passed straight through to the editor
   * dialog, which is the surface that loses the rail's answer to *which brand
   * is this?* when it opens. Optional: absent, the dialog reads exactly as it
   * did before.
   */
  brand?: BrandWithSections

  view: SocialCalendarViewMode
  onViewChange: (view: SocialCalendarViewMode) => void

  /** 0-based month, with the cursor's year. */
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void

  // ---- key dates ----------------------------------------------------------
  /** The enabled sets' dates, already filtered and deduped by the page. */
  keyDates?: KeyDate[]
  /** Enabled sets whose data stops before the visible month. */
  staleSets?: KeyDateSet[]
  /** Which sets the menu shows as on. Absent = no menu at all. */
  enabledSets?: KeyDateSet[]
  onEnabledSetsChange?: (sets: KeyDateSet[]) => void

  // ---- the planner, beside the grid ---------------------------------------
  /**
   * The Post Planner, rendered as a column beside the grid. **Present means
   * open** — the page mounts the panel only while it is, and a run's state
   * lives in the page rather than being remembered by a hidden element.
   *
   * A slot rather than a set of props, `CalendarMonthGrid`'s `summary`
   * precedent: this view decides where the panel sits and how wide the page is
   * around it, and learns nothing about what planning involves.
   */
  planner?: ReactNode
  /** Open the planner. Absent = no `Plan` button, the house rule. */
  onOpenPlanner?: () => void

  /** `null` seeds an unscheduled post; a `localDayKey` seeds that day. */
  onNewPost: (dayKey: string | null) => void
  /**
   * Door 3's door: open the editor on a day with the ideation column already
   * showing. Absent = no button on the cells.
   */
  onBrainstormDay?: (dayKey: string) => void
  onEditPost: (post: SocialPost) => void
  onMarkPosted: (post: SocialPost) => void
  onDeletePost: (post: SocialPost) => void

  // ---- dispatch, on the list's rows ---------------------------------------
  /** Put a post's body on the clipboard. Absent = no `Copy` control. */
  onCopyBody?: (post: SocialPost) => void | Promise<void>
  /** Save a post's attachments. Absent = no `Download` control. */
  onDownloadAssets?: (post: SocialPost) => void

  // ---- the dialog, whose state the page owns ------------------------------
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  editingPost: SocialPost | null
  seedDayKey: string | null
  pending?: boolean
  uploading?: boolean
  onCreate: (input: CreateSocialPostInput) => void
  onUpdate: (id: SocialPostId, patch: UpdateSocialPostInput) => void
  onUploadFiles?: (files: File[]) => Promise<BrandAssetId[]>

  // ---- the dialog's brainstorm column, whose state the page also owns ------
  brainstormOpen?: boolean
  onBrainstormOpenChange?: (open: boolean) => void
  onBrainstorm?: PostEditorDialogProps['onBrainstorm']
  onWriteCopy?: PostEditorDialogProps['onWriteCopy']
}

export function SocialCalendarView({
  app,
  posts,
  assets,
  resolveBlob,
  now,
  brand,
  view,
  onViewChange,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  keyDates = [],
  staleSets = [],
  enabledSets,
  onEnabledSetsChange,
  planner,
  onOpenPlanner,
  onNewPost,
  onBrainstormDay,
  onEditPost,
  onMarkPosted,
  onDeletePost,
  onCopyBody,
  onDownloadAssets,
  dialogOpen,
  onDialogOpenChange,
  editingPost,
  seedDayKey,
  pending,
  uploading,
  onCreate,
  onUpdate,
  onUploadFiles,
  brainstormOpen,
  onBrainstormOpenChange,
  onBrainstorm,
  onWriteCopy,
}: SocialCalendarViewProps) {
  return (
    <div className="flex-1 overflow-auto">
      {/* **The panel takes the width the page was not using** (Q4). The cap
          comes off while it is open, so the grid keeps roughly the size it has
          today on a normal desktop instead of losing 400px of it. */}
      <div className={cn('mx-auto p-6 lg:p-8', planner ? 'max-w-none' : 'max-w-6xl')}>
        <PageHeader
          title={app.title}
          description={app.description}
          icon={app.icon}
          action={
            <div className="flex items-center gap-2">
              {/* Left of the view toggle: it changes *what is on* the calendar,
                  where the toggle changes how the same thing is drawn. Both
                  props or neither — the menu without a handler would be a
                  control that silently does nothing. */}
              {enabledSets && onEnabledSetsChange && (
                <KeyDatesMenu enabled={enabledSets} onChange={onEnabledSetsChange} />
              )}
              <ViewToggle view={view} onViewChange={onViewChange} />
              {/* Left of `New post` — the same relation as *decide, then
                  execute*. **Not** a third segment in the view toggle: those
                  are two readings of one list, and planning is not a reading of
                  the posts, it is the activity that produces them. */}
              {onOpenPlanner && (
                <Button variant="outline" onClick={onOpenPlanner} aria-pressed={Boolean(planner)}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  Plan
                </Button>
              )}
              <Button onClick={() => onNewPost(null)}>
                <Plus className="size-4" aria-hidden="true" />
                New post
              </Button>
            </div>
          }
        />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {view === 'calendar' ? (
              <CalendarMonthGrid
                year={year}
                month={month}
                posts={posts}
                now={now}
                onPrevMonth={onPrevMonth}
                onNextMonth={onNextMonth}
                onToday={onToday}
                onEditPost={onEditPost}
                onNewPost={onNewPost}
                onBrainstormDay={onBrainstormDay}
                onShowUnscheduled={() => onViewChange('list')}
                keyDates={keyDates}
                staleSets={staleSets}
                // The month's arithmetic, from the same two arrays the grid
                // below it draws — so the sentence and the cells cannot
                // disagree.
                summary={
                  <MonthPlanSummary posts={posts} keyDates={keyDates} year={year} month={month} />
                }
              />
            ) : (
              <SocialPostList
                posts={posts}
                assets={assets}
                resolveBlob={resolveBlob}
                now={now}
                keyDates={keyDates}
                onEditPost={onEditPost}
                onMarkPosted={onMarkPosted}
                onDeletePost={onDeletePost}
                onCopyBody={onCopyBody}
                onDownloadAssets={onDownloadAssets}
              />
            )}
          </div>

          {planner}
        </div>

        <PostEditorDialog
          open={dialogOpen}
          onOpenChange={onDialogOpenChange}
          post={editingPost}
          seedDayKey={seedDayKey}
          brand={brand}
          // The same array the grid and the list already paint, whole. The
          // dialog narrows it to its own date field.
          keyDates={keyDates}
          assets={assets}
          resolveBlob={resolveBlob}
          pending={pending}
          uploading={uploading}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onUploadFiles={onUploadFiles}
          now={now}
          brainstormOpen={brainstormOpen}
          onBrainstormOpenChange={onBrainstormOpenChange}
          onBrainstorm={onBrainstorm}
          onWriteCopy={onWriteCopy}
        />
      </div>
    </div>
  )
}

/**
 * A segmented control built from the `Button` primitives rather than
 * `@radix-ui/react-tabs`: two mutually exclusive renderings of one list are
 * not a tab-panel relationship — there is no panel per tab, only one region
 * that changes — and a two-state toggle does not warrant a new dependency.
 *
 * `aria-pressed` is what carries the state to assistive tech; the
 * `variant="secondary"` fill is the same fact for the eye.
 */
function ViewToggle({
  view,
  onViewChange,
}: {
  view: SocialCalendarViewMode
  onViewChange: (view: SocialCalendarViewMode) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5">
      <Button
        variant={view === 'calendar' ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={view === 'calendar'}
        onClick={() => onViewChange('calendar')}
      >
        <CalendarDays className="size-4" aria-hidden="true" />
        Calendar
      </Button>
      <Button
        variant={view === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={view === 'list'}
        onClick={() => onViewChange('list')}
      >
        <List className="size-4" aria-hidden="true" />
        List
      </Button>
    </div>
  )
}
