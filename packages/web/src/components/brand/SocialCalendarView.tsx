import { CalendarDays, List, Plus } from 'lucide-react'
import type {
  BrandAsset,
  BrandAssetId,
  CreateSocialPostInput,
  SocialPost,
  SocialPostId,
  UpdateSocialPostInput,
} from '@brandfactory/shared'
import { CalendarMonthGrid } from '@/components/brand/CalendarMonthGrid'
import { PostEditorDialog } from '@/components/brand/PostEditorDialog'
import { SocialPostList } from '@/components/brand/SocialPostList'
import type { MiniApp } from '@/components/brand/miniApps'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// SocialCalendarView — the pure half of the social calendar
// ---------------------------------------------------------------------------
//
// Header, the two readings of one list, and the editor dialog. Every piece of
// state it renders belongs to `SocialCalendarPage`; this file decides only
// what is on screen, which is what keeps the whole surface testable without a
// QueryClient — the seam `AssetLibraryView` established and `VisualIdentityPage`
// proved out.

export type SocialCalendarViewMode = 'calendar' | 'list'

export interface SocialCalendarViewProps {
  app: MiniApp
  posts: SocialPost[]
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  now?: Date

  view: SocialCalendarViewMode
  onViewChange: (view: SocialCalendarViewMode) => void

  /** 0-based month, with the cursor's year. */
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void

  /** `null` seeds an unscheduled post; a `localDayKey` seeds that day. */
  onNewPost: (dayKey: string | null) => void
  onEditPost: (post: SocialPost) => void
  onMarkPosted: (post: SocialPost) => void
  onDeletePost: (post: SocialPost) => void

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
}

export function SocialCalendarView({
  app,
  posts,
  assets,
  resolveBlob,
  now,
  view,
  onViewChange,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  onNewPost,
  onEditPost,
  onMarkPosted,
  onDeletePost,
  dialogOpen,
  onDialogOpenChange,
  editingPost,
  seedDayKey,
  pending,
  uploading,
  onCreate,
  onUpdate,
  onUploadFiles,
}: SocialCalendarViewProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl p-6 lg:p-8">
        <PageHeader
          title={app.title}
          description={app.description}
          icon={app.icon}
          action={
            <div className="flex items-center gap-2">
              <ViewToggle view={view} onViewChange={onViewChange} />
              <Button onClick={() => onNewPost(null)}>
                <Plus className="size-4" aria-hidden="true" />
                New post
              </Button>
            </div>
          }
        />

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
            onShowUnscheduled={() => onViewChange('list')}
          />
        ) : (
          <SocialPostList
            posts={posts}
            assets={assets}
            resolveBlob={resolveBlob}
            now={now}
            onEditPost={onEditPost}
            onMarkPosted={onMarkPosted}
            onDeletePost={onDeletePost}
          />
        )}

        <PostEditorDialog
          open={dialogOpen}
          onOpenChange={onDialogOpenChange}
          post={editingPost}
          seedDayKey={seedDayKey}
          assets={assets}
          resolveBlob={resolveBlob}
          pending={pending}
          uploading={uploading}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onUploadFiles={onUploadFiles}
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
