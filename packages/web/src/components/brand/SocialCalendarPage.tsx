import { useState } from 'react'
import { toast } from 'sonner'
import type {
  BrandAssetId,
  CreateSocialPostInput,
  SocialPost,
  SocialPostId,
  UpdateSocialPostInput,
} from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useBrandAssets, useCreateAsset } from '@/api/queries/assets'
import { uploadBlob, useSignedReadUrls } from '@/api/queries/blobs'
import {
  useBrandSocialPosts,
  useCreateSocialPost,
  useDeleteSocialPost,
  useRestoreSocialPost,
  useUpdateSocialPost,
} from '@/api/queries/social-posts'
import { useBrand } from '@/api/queries/brands'
import type { MiniApp } from '@/components/brand/miniApps'
import {
  SocialCalendarView,
  type SocialCalendarViewMode,
} from '@/components/brand/SocialCalendarView'
import { localDayKey, shiftMonth } from '@/lib/calendar'
import { keyDatesForSets, staleSets, type KeyDateSet } from '@/lib/key-dates'
import { getEnabledSets, setEnabledSets } from '@/lib/key-dates-prefs'
import { postExcerpt } from '@/lib/social-copy'

// ---------------------------------------------------------------------------
// SocialCalendarPage — the data half
// ---------------------------------------------------------------------------
//
// `AssetLibraryPage`'s shape: this file owns every query, every mutation and
// all of the local state; `SocialCalendarView` owns the layout and takes
// callbacks. The split is what lets the whole surface be tested without a
// QueryClient, and what lets this file be tested with the view stubbed.
//
// The state that lives here rather than in the URL — which view, which month —
// is a preference one click restores, and a search param in a code-based
// router means a `validateSearch` schema for it. Noted as future work in the
// proposal, not smuggled in here.

export function SocialCalendarPage({ brandId, app }: { brandId: string; app: MiniApp }) {
  const { data: brand, isPending: brandPending, isError: brandError } = useBrand(brandId)
  const { data: posts, isPending, isError } = useBrandSocialPosts(brandId)
  const { data: assets } = useBrandAssets(brandId)
  const create = useCreateSocialPost(brandId)
  const update = useUpdateSocialPost(brandId)
  const del = useDeleteSocialPost(brandId)
  const restore = useRestoreSocialPost(brandId)
  const createAsset = useCreateAsset(brandId)

  const [view, setView] = useState<SocialCalendarViewMode>('calendar')
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  // Seeded from storage, and **re-seeded when the brand changes**. A bare
  // `useState(() => getEnabledSets(brandId))` initialises once for the life of
  // the component: switch brands inside the app and this surface would keep the
  // previous brand's sets while writing them back under the new brand's key,
  // which is how a per-brand preference quietly becomes a global one.
  //
  // The `seededFor` companion is the render-phase form of that reset — cheaper
  // and flicker-free next to a `useEffect`, which would paint one frame of the
  // wrong brand's sets before correcting itself.
  const [enabledSets, setEnabled] = useState<KeyDateSet[]>(() => getEnabledSets(brandId))
  const [seededFor, setSeededFor] = useState(brandId)
  if (seededFor !== brandId) {
    setSeededFor(brandId)
    setEnabled(getEnabledSets(brandId))
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [seedDayKey, setSeedDayKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Every blob key on the page in one `useQueries`, each with its own
  // 4-minute re-sign. The view never learns that a URL expires.
  const blobKeys = (assets ?? [])
    .map((a) => (a.source === 'blob' ? a.blobKey : null))
    .filter((k): k is string => k !== null)
  const urls = useSignedReadUrls(blobKeys)

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof AppError ? err.message : fallback)
  }

  /** Open the editor on nothing, seeded with a day (or the tray). */
  function handleNewPost(dayKey: string | null) {
    setEditingPost(null)
    // The header's "New post" passes `null`, which would mean the tray; a post
    // started from the header is far more often meant for today than for
    // nowhere, and the date is one click away from being cleared again.
    setSeedDayKey(dayKey ?? localDayKey(new Date()))
    setDialogOpen(true)
  }

  /** State and storage move together — the menu is the only writer of either. */
  function handleEnabledSetsChange(sets: KeyDateSet[]) {
    setEnabled(sets)
    setEnabledSets(brandId, sets)
  }

  function handleEditPost(post: SocialPost) {
    setEditingPost(post)
    setSeedDayKey(null)
    setDialogOpen(true)
  }

  // The dialog does not close itself: a rejected write has to leave it
  // standing with the copy still in it, so closing is `onSuccess`'s job.
  function handleCreate(input: CreateSocialPostInput) {
    create.mutate(input, {
      onSuccess: () => setDialogOpen(false),
      onError: (err) => fail(err, 'Could not create that post'),
    })
  }

  function handleUpdate(id: SocialPostId, patch: UpdateSocialPostInput) {
    update.mutate(
      { id, patch },
      {
        onSuccess: () => setDialogOpen(false),
        onError: (err) => fail(err, 'Could not save that post'),
      },
    )
  }

  /** The row menu's one-click done-marker — the same PATCH, no dialog. */
  function handleMarkPosted(post: SocialPost) {
    update.mutate(
      { id: post.id, patch: { status: 'posted' } },
      { onError: (err) => fail(err, 'Could not mark that post') },
    )
  }

  /**
   * Delete with the way back attached, `AssetLibraryPage`'s rule: a dialog
   * taxes every deliberate delete to catch the rare accidental one, while the
   * row is soft-deleted and its join rows are never swept — so restore brings
   * the post back with its attachments intact.
   *
   * The excerpt is in the toast because a calendar of chips gives no other
   * clue which one just left.
   */
  function handleDelete(post: SocialPost) {
    del.mutate(post.id, {
      onError: (err) => fail(err, 'Could not remove that post'),
      onSuccess: () => {
        // Closing matters here: deleting the post that is open in the editor
        // would otherwise leave a dialog editing a row that no longer exists.
        setDialogOpen(false)
        toast(`Removed ${postExcerpt(post, 40)}`, {
          action: {
            label: 'Undo',
            onClick: () =>
              restore.mutate(post.id, {
                onError: (err) => fail(err, 'Could not restore that post'),
              }),
          },
        })
      },
    })
  }

  /**
   * Upload straight into the brand's asset library, then hand the ids back to
   * the dialog to attach.
   *
   * Sequential rather than `Promise.all`, `AssetLibraryPage`'s reason
   * verbatim: the server appends `position` by reading the current maximum, so
   * N concurrent creates of one kind would race onto the same number.
   *
   * A file that fails is toasted and skipped rather than failing the batch —
   * the ones that landed are real assets and their ids are worth returning.
   */
  async function handleUploadFiles(files: File[]): Promise<BrandAssetId[]> {
    setUploading(true)
    const ids: BrandAssetId[] = []
    try {
      for (const file of files) {
        try {
          const { key } = await uploadBlob({ file })
          const asset = await createAsset.mutateAsync({
            kind: 'image',
            source: 'blob',
            label: file.name,
            blobKey: key,
            mime: file.type || null,
            filename: file.name,
            sizeBytes: file.size,
          })
          ids.push(asset.id)
        } catch (err) {
          fail(err, `Could not add ${file.name}`)
        }
      }
    } finally {
      setUploading(false)
    }
    return ids
  }

  if (brandPending || isPending) {
    return <Shell app={app}>Loading…</Shell>
  }
  if (brandError || isError || !brand) {
    return <Shell app={app}>Failed to load this brand&apos;s calendar.</Shell>
  }

  return (
    <SocialCalendarView
      app={app}
      posts={posts ?? []}
      assets={assets ?? []}
      resolveBlob={(key) => urls[key] ?? ''}
      view={view}
      onViewChange={setView}
      year={cursor.year}
      month={cursor.month}
      onPrevMonth={() => setCursor((c) => shiftMonth(c, -1))}
      onNextMonth={() => setCursor((c) => shiftMonth(c, 1))}
      onToday={() => {
        const now = new Date()
        setCursor({ year: now.getFullYear(), month: now.getMonth() })
      }}
      // No `useMemo`: ~90 entries filtered once per render is the budget
      // `groupByDay` already spends on every post on the page.
      keyDates={keyDatesForSets(enabledSets)}
      staleSets={staleSets(enabledSets, cursor.year, cursor.month)}
      enabledSets={enabledSets}
      onEnabledSetsChange={handleEnabledSetsChange}
      onNewPost={handleNewPost}
      onEditPost={handleEditPost}
      onMarkPosted={handleMarkPosted}
      onDeletePost={handleDelete}
      dialogOpen={dialogOpen}
      onDialogOpenChange={setDialogOpen}
      editingPost={editingPost}
      seedDayKey={seedDayKey}
      pending={create.isPending || update.isPending}
      uploading={uploading}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onUploadFiles={handleUploadFiles}
    />
  )
}

function Shell({ app, children }: { app: MiniApp; children: React.ReactNode }) {
  const Icon = app.icon
  return (
    <div className="flex-1 overflow-auto p-6">
      <h1 className="flex items-center gap-2">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {app.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
