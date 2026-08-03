import { useRef, useState } from 'react'
import { ImagePlus, Upload, X } from 'lucide-react'
import {
  assetsOfKind,
  SocialPostBodySchema,
  type BrandAsset,
  type BrandAssetId,
  type CreateSocialPostInput,
  type SocialPlatform,
  type SocialPost,
  type SocialPostId,
  type SocialPostStatus,
  type UpdateSocialPostInput,
} from '@brandfactory/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_POST_TIME, isoToLocalParts, localPartsToIso } from '@/lib/calendar'
import { PLATFORM_OPTIONS, STATUS_OPTIONS } from '@/lib/social-copy'
import { assetUrl } from '@/lib/asset-url'

// ---------------------------------------------------------------------------
// PostEditorDialog — one dialog for create and edit
// ---------------------------------------------------------------------------
//
// Not two components, because the fields are the same fields and a post being
// created is a post being edited that has no id yet. The only genuine
// difference is `status`, which the create form does not show: a post is a
// `draft` the moment it exists (the server's default), and offering the
// done-marker before the copy exists is offering to lie.
//
// House style is `NewBrandDialog`'s — plain `useState` per field, a `<form id>`
// whose submit button lives in the footer, inline `aria-describedby` errors —
// and the re-seeding is `RenameDialog`'s conditional mount.
//
// **The dialog does not close itself on submit.** It reports through
// `onCreate`/`onUpdate` and the page closes it when the mutation succeeds, so
// a rejected write leaves the dialog standing with the copy still in it. The
// one exception is a submit that turns out to be a no-op (see the diff below),
// where there is no mutation to come back and close anything.

/** Mirrors `SocialPostAssetIdsSchema`'s max — the wire is the enforcer, this
 * is the affordance that stops someone reaching it by surprise. */
const MAX_ATTACHMENTS = 20

const BODY_MAX = SocialPostBodySchema.maxLength ?? 5000

export interface PostEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The post being edited. Absent or `null` puts the dialog in create mode. */
  post?: SocialPost | null
  /**
   * Create-mode seed: the day whose empty cell was clicked, or today for the
   * header's "New post". `null` seeds an unscheduled post — the tray.
   */
  seedDayKey?: string | null
  /** The brand's assets: the picker's inventory and the thumbnails' source. */
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  /** A write is in flight. Disables submit; the page closes on success. */
  pending?: boolean
  /** An upload is in flight — the same shape `AssetLibraryView` uses. */
  uploading?: boolean
  onCreate: (input: CreateSocialPostInput) => void
  onUpdate: (id: SocialPostId, patch: UpdateSocialPostInput) => void
  /**
   * Upload files and resolve the ids they landed under, which this dialog
   * appends to the attachment list. Absent = no Upload control, the invariant
   * every write affordance in this folder carries.
   *
   * The upload lands in the brand's asset library whether or not the post is
   * ever saved — by design (proposal §5): it is a library asset, not an orphan.
   */
  onUploadFiles?: (files: File[]) => Promise<BrandAssetId[]>
}

export function PostEditorDialog({
  open,
  onOpenChange,
  post = null,
  seedDayKey = null,
  assets,
  resolveBlob,
  pending = false,
  uploading = false,
  onCreate,
  onUpdate,
  onUploadFiles,
}: PostEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{post ? 'Edit post' : 'New post'}</DialogTitle>
        </DialogHeader>
        {/* The conditional mount re-seeds the fields, `RenameDialog`'s reason
            verbatim: closing unmounts the form, so reopening always reads the
            current post. The `key` is the post's **id**, never its content — a
            background refetch that replaces the object must not remount the
            form and throw away what is being typed, but switching which post
            is being edited while the dialog stands open must. */}
        {open ? (
          <PostEditorForm
            key={post?.id ?? 'new'}
            post={post}
            seedDayKey={seedDayKey}
            assets={assets}
            resolveBlob={resolveBlob}
            pending={pending}
            uploading={uploading}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onUploadFiles={onUploadFiles}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface Errors {
  platform?: string
  schedule?: string
  body?: string
  attachments?: string
}

function PostEditorForm({
  post,
  seedDayKey,
  assets,
  resolveBlob,
  pending,
  uploading,
  onCreate,
  onUpdate,
  onUploadFiles,
  onCancel,
}: {
  post: SocialPost | null
  seedDayKey: string | null
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  pending: boolean
  uploading: boolean
  onCreate: (input: CreateSocialPostInput) => void
  onUpdate: (id: SocialPostId, patch: UpdateSocialPostInput) => void
  onUploadFiles?: (files: File[]) => Promise<BrandAssetId[]>
  onCancel: () => void
}) {
  const seeded = post?.scheduledAt
    ? isoToLocalParts(post.scheduledAt)
    : // Create mode seeds the clicked day at the default slot; an edit of an
      // unscheduled post opens with both fields empty, which is what it is.
      { date: post ? '' : (seedDayKey ?? ''), time: post || !seedDayKey ? '' : DEFAULT_POST_TIME }

  // `''` rather than a default platform: picking where a post goes is the one
  // decision the author must actually make, and a pre-selected Instagram is a
  // guess that ships as a fact.
  const [platform, setPlatform] = useState<SocialPlatform | ''>(post?.platform ?? '')
  const [date, setDate] = useState(seeded.date)
  const [time, setTime] = useState(seeded.time)
  const [body, setBody] = useState(post?.body ?? '')
  const [status, setStatus] = useState<SocialPostStatus>(post?.status ?? 'draft')
  const [assetIds, setAssetIds] = useState<BrandAssetId[]>(post?.assetIds ?? [])
  const [errors, setErrors] = useState<Errors>({})

  function clear(key: keyof Errors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function submit() {
    const next: Errors = {}
    if (!platform) next.platform = 'Choose where this post goes.'

    // A cleared date is the unschedule gesture, not a mistake; a date that
    // will not parse is a mistake. The two have to be told apart before the
    // payload is built, or "unschedule" and "typo" become the same request.
    //
    // A native `type=date` control never hands over a partial value — it is a
    // full `YYYY-MM-DD` or `''` — so the refusal below is for the browsers
    // that fall back to a plain text input, not for the common path.
    let scheduledAt: string | null = null
    if (date.trim()) {
      scheduledAt = localPartsToIso(date, time)
      if (scheduledAt === null) next.schedule = 'Enter a valid date and time.'
    }

    if (!SocialPostBodySchema.safeParse(body).success) {
      next.body = `Copy is too long — ${BODY_MAX.toLocaleString('en-GB')} characters at most.`
    }

    if (Object.values(next).some(Boolean)) {
      setErrors(next)
      return
    }
    setErrors({})

    const copy = body.trim()
    if (!post) {
      onCreate({
        platform: platform as SocialPlatform,
        // Stated rather than omitted: `CreateSocialPostInputSchema` accepts an
        // explicit `null` precisely so "create unscheduled" is one shape.
        scheduledAt,
        ...(copy ? { body: copy } : {}),
        ...(assetIds.length > 0 ? { assetIds } : {}),
      })
      return
    }

    // A diffed patch, because `UpdateSocialPostInputSchema` refuses `{}` — an
    // edit that changed nothing would come back a 400 about a request the user
    // never knowingly made. It also keeps an untouched `assetIds` from
    // re-writing the join rows on every save.
    const patch: UpdateSocialPostInput = {}
    if (platform !== post.platform) patch.platform = platform as SocialPlatform
    // Comparing normalised ISO to stored ISO: everything this dialog writes
    // has zeroed seconds, so a row created here compares equal untouched. A
    // row minted elsewhere with seconds would register as a change — which it
    // is, since the time on screen is the time being confirmed.
    if (scheduledAt !== post.scheduledAt) patch.scheduledAt = scheduledAt
    if (copy !== post.body) patch.body = copy
    if (status !== post.status) patch.status = status
    if (!sameIds(assetIds, post.assetIds)) patch.assetIds = assetIds

    if (Object.keys(patch).length === 0) {
      onCancel()
      return
    }
    onUpdate(post.id, patch)
  }

  return (
    <>
      <form
        id="post-editor-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending) submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-platform">Platform</Label>
          <Select
            value={platform}
            onValueChange={(value) => {
              setPlatform(value as SocialPlatform)
              clear('platform')
            }}
          >
            <SelectTrigger
              id="post-platform"
              className="w-full"
              aria-invalid={errors.platform ? true : undefined}
              aria-describedby={errors.platform ? 'post-platform-error' : undefined}
            >
              <SelectValue placeholder="Choose a platform" />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.platform && (
            <p id="post-platform-error" className="text-xs text-destructive">
              {errors.platform}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-date">Date and time (optional)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="post-date"
              type="date"
              value={date}
              className="flex-1"
              onChange={(e) => {
                setDate(e.target.value)
                // Picking a day without a time means that day's usual slot,
                // the same answer an empty cell click gives.
                if (e.target.value && !time) setTime(DEFAULT_POST_TIME)
                clear('schedule')
              }}
              aria-invalid={errors.schedule ? true : undefined}
              aria-describedby={errors.schedule ? 'post-schedule-error' : undefined}
            />
            <Input
              id="post-time"
              type="time"
              aria-label="Time"
              value={time}
              className="w-32"
              onChange={(e) => {
                setTime(e.target.value)
                clear('schedule')
              }}
            />
          </div>
          {errors.schedule ? (
            <p id="post-schedule-error" className="text-xs text-destructive">
              {errors.schedule}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {date.trim()
                ? 'Clear the date to move this post to the unscheduled tray.'
                : 'Unscheduled — it waits in the tray until it has a slot.'}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-body">Copy</Label>
          <Textarea
            id="post-body"
            value={body}
            placeholder="What this post says…"
            onChange={(e) => {
              setBody(e.target.value)
              clear('body')
            }}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? 'post-body-error' : undefined}
          />
          {errors.body && (
            <p id="post-body-error" className="text-xs text-destructive">
              {errors.body}
            </p>
          )}
        </div>

        {/* Create mode has no status control: a post is a `draft` the moment it
            exists, and offering `Posted` before the copy does is offering to
            record something that did not happen. */}
        {post && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="post-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as SocialPostStatus)}>
              <SelectTrigger id="post-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Attachments
          assetIds={assetIds}
          setAssetIds={setAssetIds}
          assets={assets}
          resolveBlob={resolveBlob}
          uploading={uploading}
          onUploadFiles={onUploadFiles}
          error={errors.attachments}
          setError={(message) => setErrors((prev) => ({ ...prev, attachments: message }))}
        />
      </form>

      <DialogFooter>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form="post-editor-form" disabled={pending}>
          {pending ? 'Saving…' : post ? 'Save post' : 'Create post'}
        </Button>
      </DialogFooter>
    </>
  )
}

// ---------------------------------------------------------------------------
// Attachments — ordered thumbs, a library picker, an upload
// ---------------------------------------------------------------------------

function Attachments({
  assetIds,
  setAssetIds,
  assets,
  resolveBlob,
  uploading,
  onUploadFiles,
  error,
  setError,
}: {
  assetIds: BrandAssetId[]
  setAssetIds: (next: BrandAssetId[]) => void
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  uploading: boolean
  onUploadFiles?: (files: File[]) => Promise<BrandAssetId[]>
  error?: string
  setError: (message: string | undefined) => void
}) {
  const [picking, setPicking] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const byId = new Map(assets.map((a) => [a.id, a]))
  const library = assetsOfKind(assets, 'image').filter((a) => !assetIds.includes(a.id))
  const full = assetIds.length >= MAX_ATTACHMENTS

  function attach(ids: BrandAssetId[]) {
    const fresh = ids.filter((id) => !assetIds.includes(id))
    if (fresh.length === 0) return
    if (assetIds.length + fresh.length > MAX_ATTACHMENTS) {
      setError('That is as many attachments as one post can carry.')
      return
    }
    setError(undefined)
    setAssetIds([...assetIds, ...fresh])
  }

  async function upload(files: File[]) {
    if (!onUploadFiles || files.length === 0) return
    try {
      attach(await onUploadFiles(files))
    } catch {
      // The page owns the toast for a failed upload — it owns the mutation.
      // This line keeps a rejection from becoming an unhandled one.
      setError('That upload did not finish. Nothing was attached.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Attachments</span>

      {assetIds.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {assetIds.map((id) => {
            const asset = byId.get(id)
            const url = asset ? assetUrl(asset, resolveBlob) : null
            // **An unresolved id gets a tile, not silence.** Read-only surfaces
            // skip an attachment whose asset is soft-deleted (proposal §5), but
            // this is a write path: an id kept invisibly in state would ride
            // along on the next save, and the server refuses a soft-deleted
            // asset with a 400 about an attachment the author cannot see.
            return (
              <li
                key={id}
                className="relative size-20 overflow-hidden rounded-lg border bg-surface-sunken"
              >
                {url ? (
                  <img
                    src={url}
                    alt={asset?.alt ?? asset?.label ?? ''}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
                    {asset ? 'No preview' : 'Unavailable'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(undefined)
                    setAssetIds(assetIds.filter((current) => current !== id))
                  }}
                  aria-label={`Remove ${asset ? asset.label : 'unavailable attachment'}`}
                  className="absolute top-1 right-1 rounded-full bg-surface-base/90 p-0.5 text-muted-foreground transition-colors duration-150 hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full || (library.length === 0 && !picking)}
          onClick={() => setPicking((was) => !was)}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Add from library
        </Button>
        {onUploadFiles && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []))
                // Same file twice in a row fires no `change` unless the value
                // is cleared — `AssetLibraryView`'s lesson, same input idiom.
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full || uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        )}
        {full && (
          <span className="text-xs text-muted-foreground">
            That is as many attachments as one post can carry.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {picking &&
        (library.length > 0 ? (
          <ul className="grid max-h-48 grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 overflow-auto rounded-lg border p-2">
            {library.map((asset) => {
              const url = assetUrl(asset, resolveBlob)
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => attach([asset.id])}
                    aria-label={`Attach ${asset.label}`}
                    className="size-full overflow-hidden rounded-md border bg-surface-sunken transition-colors duration-150 hover:border-[var(--border-strong)]"
                  >
                    {url ? (
                      <img src={url} alt="" className="aspect-square size-full object-cover" />
                    ) : (
                      <span className="flex aspect-square items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
                        {asset.label}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Every image in this brand’s library is already attached.
          </p>
        ))}
    </div>
  )
}

/** Order is meaning here — a reordered attachment list is a changed one. */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}
