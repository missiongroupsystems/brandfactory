import { useRef, useState } from 'react'
import { ImagePlus, Sparkles, Upload, X } from 'lucide-react'
import {
  assetsOfKind,
  SocialPostBodySchema,
  type BrandAsset,
  type BrandAssetId,
  type BrandWithSections,
  type CreateSocialPostInput,
  type IdeateOutcome,
  type IdeateThemesResult,
  type PostIdea,
  type SocialPlatform,
  type SocialPost,
  type SocialPostId,
  type SocialPostStatus,
  type UpdateSocialPostInput,
} from '@brandfactory/shared'
import { BrandContextStrip } from '@/components/brand/BrandContextStrip'
import { PostBrainstormPanel } from '@/components/brand/PostBrainstormPanel'
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
import { DEFAULT_POST_TIME, isoToLocalParts, localDayKey, localPartsToIso } from '@/lib/calendar'
import { keyDatesOnDay, type KeyDate } from '@/lib/key-dates'
import { PLATFORM_OPTIONS, STATUS_OPTIONS } from '@/lib/social-copy'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'

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
  /**
   * The brand this post is written for, with its guideline sections.
   *
   * **Optional, and absent renders the dialog exactly as it read before this
   * prop existed** — the house rule every affordance in this folder carries.
   * The page that opens the dialog already holds this object: it loads the
   * brand to gate the whole surface and then used it for nothing else.
   */
  brand?: BrandWithSections
  /**
   * The enabled sets' dates, whole — the same array the grid paints. The form
   * narrows it to the day in its **own date field**, not to `seedDayKey`,
   * because a label that does not follow the field is a stale label.
   */
  keyDates?: KeyDate[]
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

  // ---- Door 3: brainstorm, beside the form --------------------------------
  /** Injectable clock. The day a brainstorm uses when the form has no date. */
  now?: Date
  /**
   * Whether the ideation column is showing. **Off by default, and the dialog
   * with it off is the dialog Phase A shipped** — same width, same fields, same
   * order.
   *
   * The page owns it, like every other piece of this dialog's state, because
   * `Brainstorm this day` on a calendar cell has to be able to open the dialog
   * with the column already on.
   */
  brainstormOpen?: boolean
  onBrainstormOpenChange?: (open: boolean) => void
  /**
   * Pass 1 for one day and one platform — `POST /brands/:id/ideate/themes`
   * through `brainstormRequest`.
   *
   * `null` resolves when the call failed and the page has already said so; an
   * `IdeateThemesResult` carries its own honest outcome for the two answers
   * that are not failures.
   *
   * **All three of `onBrainstorm`, `onWriteCopy` and `onBrainstormOpenChange`
   * or none of them.** The toggle appears only with the whole set, the house
   * rule that no affordance renders without the callback that makes it work.
   */
  onBrainstorm?: (request: {
    dayKey: string
    platform: SocialPlatform
  }) => Promise<IdeateThemesResult | null>
  /** Pass 2 for one angle. `null` = it failed and the page has said so. */
  onWriteCopy?: (idea: PostIdea, platform: SocialPlatform) => Promise<string | null>
}

export function PostEditorDialog({
  open,
  onOpenChange,
  post = null,
  seedDayKey = null,
  brand,
  keyDates = [],
  assets,
  resolveBlob,
  pending = false,
  uploading = false,
  onCreate,
  onUpdate,
  onUploadFiles,
  now,
  brainstormOpen = false,
  onBrainstormOpenChange,
  onBrainstorm,
  onWriteCopy,
}: PostEditorDialogProps) {
  // The whole set or nothing: a toggle that opens a column whose button cannot
  // spend anything is a control that does not work.
  const brainstormable = Boolean(onBrainstorm && onWriteCopy && onBrainstormOpenChange)
  const brainstorming = brainstormable && brainstormOpen

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The context strip is two more rows on a form that was already tall.
          `DialogContent` is centred and unbounded in height, so it clips
          against the viewport rather than scrolling — visible at 800px with the
          attachment picker open, and now reachable one row sooner. Capped and
          scrolled here rather than in the primitive: every other dialog in the
          app is short, and widening the blast radius to fix one form is how a
          shared component acquires a rule it does not need.

          The ideation column is what widens it, and only while it is open: a
          form that is permanently 3xl wide to hold a column nobody asked for
          is a form whose fields have grown a 700px measure for no reason. */}
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          'max-h-[calc(100dvh-4rem)] overflow-y-auto',
          brainstorming ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <DialogHeader>
          {/* `pr-8` clears the primitive's own close button, which is absolutely
              positioned at `top-4 right-4` and would otherwise sit under the
              toggle at every width. */}
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>{post ? 'Edit post' : 'New post'}</DialogTitle>
            {brainstormable && (
              <Button
                type="button"
                variant={brainstorming ? 'secondary' : 'outline'}
                size="sm"
                aria-pressed={brainstorming}
                onClick={() => onBrainstormOpenChange?.(!brainstorming)}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Brainstorm
              </Button>
            )}
          </div>
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
            brand={brand}
            keyDates={keyDates}
            assets={assets}
            resolveBlob={resolveBlob}
            pending={pending}
            uploading={uploading}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onUploadFiles={onUploadFiles}
            onCancel={() => onOpenChange(false)}
            now={now}
            // **The flag, not the column.** The form stays mounted while the
            // toggle goes off and on, so three angles somebody paid for survive
            // a change of mind about the layout.
            brainstorming={brainstorming}
            onBrainstorm={onBrainstorm}
            onWriteCopy={onWriteCopy}
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
  brand,
  keyDates,
  assets,
  resolveBlob,
  pending,
  uploading,
  onCreate,
  onUpdate,
  onUploadFiles,
  onCancel,
  now,
  brainstorming,
  onBrainstorm,
  onWriteCopy,
}: {
  post: SocialPost | null
  seedDayKey: string | null
  brand?: BrandWithSections
  keyDates: KeyDate[]
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  pending: boolean
  uploading: boolean
  onCreate: (input: CreateSocialPostInput) => void
  onUpdate: (id: SocialPostId, patch: UpdateSocialPostInput) => void
  onUploadFiles?: (files: File[]) => Promise<BrandAssetId[]>
  onCancel: () => void
  now?: Date
  brainstorming: boolean
  onBrainstorm?: PostEditorDialogProps['onBrainstorm']
  onWriteCopy?: PostEditorDialogProps['onWriteCopy']
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

  // ---- the brainstorm's own state ----------------------------------------
  //
  // It lives here rather than in the page because the question it answers is
  // made of two fields on this form — the day and the platform — and the answer
  // lands in a third. Lifting it would mean teaching the page what is currently
  // typed into a form it deliberately knows nothing about.
  const [angles, setAngles] = useState<PostIdea[] | null>(null)
  const [outcome, setOutcome] = useState<IdeateOutcome | null>(null)
  const [running, setRunning] = useState(false)
  const [writingIndex, setWritingIndex] = useState<number | null>(null)
  /** Which card's caption is in `Copy` — a highlight, and nothing more. */
  const [usedIndex, setUsedIndex] = useState<number | null>(null)
  /**
   * The caption in `Copy` came from an angle.
   *
   * Separate from `usedIndex` because the two stop agreeing the moment a second
   * run replaces the list: the cards change, the words in the field do not, and
   * it is the words that decide who the post is by.
   */
  const [fromAgent, setFromAgent] = useState(false)
  /** What an angle overwrote, when a person had typed it. `null` = nothing. */
  const [replaced, setReplaced] = useState<string | null>(null)

  function clear(key: keyof Errors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  // **The day the brainstorm is about is the field's, not the seed's** — the
  // rule the key-date chips already follow, one paragraph down. An unscheduled
  // post has no day of its own, so it borrows today: the same judgment
  // `handleNewPost` makes when the header's `New post` seeds a date.
  const brainstormDay = date.trim() || localDayKey(now ?? new Date())

  // A run answers one question — *this day, this platform* — so changing either
  // makes the cards on screen an answer to a question nobody is asking. The
  // render-phase reset is `SocialCalendarPage`'s idiom, and for its reason: a
  // `useEffect` would paint one frame of the stale angles first.
  //
  // `fromAgent` and `replaced` survive it on purpose. They are facts about the
  // words in the `Copy` field, which this reset does not touch.
  const asked = `${brainstormDay} ${platform}`
  const [askedFor, setAskedFor] = useState(asked)
  if (askedFor !== asked) {
    setAskedFor(asked)
    setAngles(null)
    setOutcome(null)
    setUsedIndex(null)
  }

  async function runBrainstorm() {
    if (!onBrainstorm || !platform || running) return
    setRunning(true)
    setOutcome(null)
    try {
      const result = await onBrainstorm({ dayKey: brainstormDay, platform })
      // `null` is a failure the page has already toasted. An `IdeateThemesResult`
      // that is not `ok` is an honest answer, and the column has a line for it.
      if (!result) return
      setOutcome(result.outcome)
      if (result.outcome !== 'ok') return
      setAngles(result.ideas)
      setUsedIndex(null)
    } finally {
      setRunning(false)
    }
  }

  async function pickAngle(index: number) {
    const idea = angles?.[index]
    if (!onWriteCopy || !idea || !platform || writingIndex !== null) return
    setWritingIndex(index)
    try {
      const written = await onWriteCopy(idea, platform)
      if (written === null) return
      // Remembered only when a person typed it, and only the first time: a
      // second angle overwrites the model's own words, which nobody would want
      // back and which the Undo would otherwise offer as if they were theirs.
      if (!fromAgent && body.trim()) setReplaced(body)
      setBody(written)
      setFromAgent(true)
      setUsedIndex(index)
      clear('body')
    } finally {
      setWritingIndex(null)
    }
  }

  function undoAngle() {
    if (replaced === null) return
    setBody(replaced)
    setReplaced(null)
    setFromAgent(false)
    setUsedIndex(null)
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
        // **Who wrote the copy, not who pressed the button.** A caption that
        // came out of an angle is the agent's whether or not the person then
        // edited it — the same rule D3 states for keeping `createdBy` off the
        // patch schema: an edit does not make you the author of what the agent
        // wrote. Pressing *Put my copy back* clears it, because at that point
        // the agent's words are no longer the ones being saved.
        createdBy: fromAgent ? 'agent' : 'user',
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

  // **Read from `date`, never from `seedDayKey`.** The seed is what the dialog
  // opened on; the field is what the post is for, and the two part company the
  // moment anyone touches the date picker. A chip that keeps announcing the day
  // you opened on is worse than no chip: it is a fact that has quietly stopped
  // being one.
  //
  // The two lists are concatenated with the days first — a day is the stronger
  // claim, and `keyDatesOnDay` already returns them in that order within each
  // half.
  const onDay = keyDatesOnDay(keyDates, date)
  const dayKeyDates = [...onDay.days, ...onDay.seasons]

  return (
    <>
      {/* G4: the strip stays exactly where it is, above the split. The brand
          and the day are facts about the whole dialog — which column they were
          put in would be an accident of layout. */}
      {brand && <BrandContextStrip brand={brand} keyDates={dayKeyDates} />}

      <div
        className={cn(brainstorming && 'flex flex-col-reverse gap-4 sm:flex-row sm:items-start')}
      >
        {/* Left of the form on a wide dialog, and **below** it on a narrow one:
            stacked, the fields are what the user came for and the column is the
            help, so the help must not push the form off the first screen. */}
        {brainstorming && (
          <PostBrainstormPanel
            dayKey={brainstormDay}
            platform={platform || null}
            now={now}
            ideas={angles}
            outcome={outcome}
            running={running}
            writingIndex={writingIndex}
            usedIndex={usedIndex}
            onRun={() => void runBrainstorm()}
            onUse={(index) => void pickAngle(index)}
            onUndo={replaced === null ? undefined : undoAngle}
          />
        )}

        <form
          id="post-editor-form"
          className="flex min-w-0 flex-1 flex-col gap-4"
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
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as SocialPostStatus)}
              >
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
      </div>

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
