import { useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Copy, FileText, GripVertical, Link2, Trash2, Upload } from 'lucide-react'
import {
  assetsOfKind,
  type BrandAsset,
  type BrandAssetId,
  type BrandWithSections,
  type UpdateBrandAssetInput,
} from '@brandfactory/shared'
import { ColorSwatches, paletteSummary } from '@/components/brand/ColorSwatches'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// AssetLibraryView — what the `Visual identity` tile opens
// ---------------------------------------------------------------------------
//
// Assets question 2 asked where a brand's assets render. A photo grid is not
// rail-shaped, and `Visual identity` shipped as a dead `Soon` tile from 1.4.0 —
// two proposals, written days apart, independently named it as the thing they
// would turn on and each deferred it to the other. 2E is the pass that turned
// it on, and this is the page behind it.
//
// **Read here, write there — and *there* is this page.** The hub rail shows a
// brand's palette and links up here; everything that *changes* an asset lives
// on this screen. That split is why the rail has no `Edit` button.
//
// **A `link` must be visibly distinguishable from a `blob`.** The assets rule is
// that a link is first-class for reference while a blob is expected for anything
// rendered as the brand's identity — encouraged in the UI, not enforced in the
// schema. A rule the UI cannot show is a rule nobody can follow, so every card
// carries its source as a pill rather than leaving it to a tooltip.
//
// ---------------------------------------------------------------------------
// Still a pure view
// ---------------------------------------------------------------------------
//
// Every write is a **callback prop**, and every affordance renders nothing when
// its callback is absent — the same invariant `BrandHubView` carries, and the
// reason `routes/demo.brand.assets.tsx` still renders this component against
// fixtures with no QueryClient in sight. `VisualIdentityPage` owns the queries
// and the mutations; this file owns the layout and nothing else.

export interface AssetLibraryViewProps {
  brand: BrandWithSections
  assets: BrandAsset[]
  /**
   * Signed-read-URL lookup for a `blob` asset. Returns `''` for a key whose URL
   * has not arrived, which the thumbnail renders as its own placeholder rather
   * than as a broken image.
   */
  resolveBlob: (key: string) => string
  /** Where "back to the hub" goes. A plain href — see `MiniAppTile`'s. */
  backHref?: string

  // ---- writes. Each affordance exists only when its callback does -----------

  onUploadFiles?: (files: File[]) => void
  /**
   * Record a link. Resolves to an error message, or `null` on success — the
   * form needs the refusal text inline, next to the field holding the URL.
   */
  onRecordLink?: (url: string) => Promise<string | null>
  onAddColor?: (input: { label: string; value: string }) => void
  onUpdateAsset?: (id: BrandAssetId, patch: UpdateBrandAssetInput) => void
  onDeleteAsset?: (id: BrandAssetId) => void
  /** Colour ids in their new order. See `reorderAssets`. */
  onReorderColors?: (ids: BrandAssetId[]) => void
  /** An upload is in flight. Disables the drop zone rather than hiding it. */
  uploading?: boolean
}

export function AssetLibraryView({
  brand,
  assets,
  resolveBlob,
  backHref,
  onUploadFiles,
  onRecordLink,
  onAddColor,
  onUpdateAsset,
  onDeleteAsset,
  onReorderColors,
  uploading = false,
}: AssetLibraryViewProps) {
  const colors = assetsOfKind(assets, 'color')
  const images = assetsOfKind(assets, 'image')
  const logos = images.filter((a) => a.role === 'logo' || a.role === 'mark')
  const photos = images.filter((a) => a.role !== 'logo' && a.role !== 'mark')
  const files = assetsOfKind(assets, 'file')
  const empty = assets.length === 0
  const editable = !!onUpdateAsset && !!onDeleteAsset

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl p-6 lg:p-8">
        <header>
          {backHref && (
            <a
              href={backHref}
              className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              ← {brand.name}
            </a>
          )}
          <h1 className="mt-2">Visual identity</h1>
          <p className="mt-1.5 max-w-prose text-sm text-pretty text-muted-foreground">
            Colours, marks, photography and files. Anything the brand looks like, in one place.
          </p>
        </header>

        {(onUploadFiles || onRecordLink) && (
          <IntakeZone
            onUploadFiles={onUploadFiles}
            onRecordLink={onRecordLink}
            uploading={uploading}
          />
        )}

        {empty && (
          <p className="mt-8 text-sm text-muted-foreground">
            Nothing here yet. This brand has no assets recorded.
          </p>
        )}

        {(colors.length > 0 || onAddColor) && (
          <section className="mt-10">
            <SectionHeading
              title="Palette"
              detail={colors.length > 0 ? paletteSummary(colors) : ''}
            />
            {/* **Capped, unlike the grids below it.** A palette is a list of
                short strings; a photo grid is not. At the page's full 1085px an
                editable row put a 26-character label in an 810px field with its
                hex, its status and its delete at the far end — the same
                stretched-row defect 2F went to fix in the 900px rail, found on
                this page by the same live pass. The grids keep the full measure
                because more columns of images is what more width is *for*. */}
            <div className="mt-3 max-w-2xl rounded-xl border bg-card p-4 shadow-elevation-1">
              {colors.length > 0 && <ColorSwatches colors={colors} />}
              {editable ? (
                <PaletteRows
                  colors={colors}
                  onUpdateAsset={onUpdateAsset}
                  onDeleteAsset={onDeleteAsset}
                  onReorderColors={onReorderColors}
                />
              ) : (
                colors.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-1.5 border-t pt-3">
                    {colors.map((c) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{c.label}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {c.source === 'inline' ? c.value : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              )}
              {onAddColor && <AddColorRow onAddColor={onAddColor} hasColors={colors.length > 0} />}
            </div>
          </section>
        )}

        {logos.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Marks" detail={`${logos.length}`} />
            <AssetGrid
              assets={logos}
              resolveBlob={resolveBlob}
              onDeleteAsset={onDeleteAsset}
              onUpdateAsset={onUpdateAsset}
            />
          </section>
        )}

        {photos.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Photography" detail={`${photos.length}`} />
            <AssetGrid
              assets={photos}
              resolveBlob={resolveBlob}
              onDeleteAsset={onDeleteAsset}
              onUpdateAsset={onUpdateAsset}
            />
          </section>
        )}

        {files.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Files" detail={`${files.length}`} />
            <ul className="mt-3 flex flex-col gap-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-elevation-1"
                >
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[f.filename, f.mime, formatBytes(f.sizeBytes)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <SourcePill asset={f} />
                  {onDeleteAsset && <DeleteButton asset={f} onDeleteAsset={onDeleteAsset} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intake — a drop zone and a URL field, side by side
// ---------------------------------------------------------------------------

/**
 * The two ways an asset arrives, presented as one control because they are one
 * decision: *do we host this, or does someone else?*
 *
 * The upload half reuses the transport that already exists — the caller's
 * `onUploadFiles` mints a write URL, PUTs the bytes and posts a row, so this
 * component never sees a `fetch`. The link half hands its URL to the caller and
 * renders whatever refusal comes back, which is where 2D's `probeImageUrl`
 * lands: **validated at record time, where the user is holding the URL and can
 * fix it**, rather than by a hub that scolds about a background fact.
 */
function IntakeZone({
  onUploadFiles,
  onRecordLink,
  uploading,
}: {
  onUploadFiles?: (files: File[]) => void
  onRecordLink?: (url: string) => Promise<string | null>
  uploading: boolean
}) {
  const [over, setOver] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function take(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length > 0) onUploadFiles?.(files)
  }

  async function submitLink() {
    if (!onRecordLink || !url.trim()) return
    setChecking(true)
    setError(null)
    const message = await onRecordLink(url.trim())
    setChecking(false)
    if (message) setError(message)
    else setUrl('')
  }

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      {onUploadFiles && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files)
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors duration-150',
            over && 'border-foreground/40 bg-accent',
          )}
        >
          <p className="text-sm text-muted-foreground">Drop images or files here</p>
          {/* Out of the tab order, and hidden from AT. `Choose files` below is
              the control; leaving this in as well put an **unnamed file input**
              between the theme toggle and that button — found by 2F's keyboard
              walk, which is the first one any pass has run. `sr-only` hides it
              from the eye and not from a screen reader, which is the wrong half
              for a proxy. */}
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              take(e.target.files)
              // Same file twice in a row fires no `change` unless the value is
              // cleared — a re-upload after a delete would silently do nothing.
              e.target.value = ''
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Choose files'}
          </Button>
        </div>
      )}

      {onRecordLink && (
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-dashed p-6">
          <label htmlFor="asset-link" className="text-sm text-muted-foreground">
            …or paste a URL to something hosted elsewhere
          </label>
          <div className="mt-3 flex gap-2">
            <Input
              id="asset-link"
              value={url}
              placeholder="https://…"
              onChange={(e) => {
                setUrl(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitLink()
              }}
            />
            {/* `Add link`, not `Add`. The live pass tripped over the ambiguity
                first — a name-based query matched this and `Add colour` — and a
                button announced as just "Add" is the same problem for anyone
                tabbing through with a screen reader. */}
            <Button
              variant="outline"
              size="sm"
              disabled={checking || !url.trim()}
              onClick={() => void submitLink()}
            >
              {checking ? 'Checking…' : 'Add link'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Palette editing
// ---------------------------------------------------------------------------

/**
 * One row per colour: drag handle, swatch, label, value, proposed toggle,
 * delete. `ColorSwatches` above it is unchanged and stays the *reading* view —
 * the ramp at a glance — while these rows are the *editing* view. Two renderings
 * of one list, which is why the swatches were not replaced by the rows.
 *
 * Reorder is dnd-kit with a keyboard sensor, matching `BrandGuidelinesEditor`
 * rather than inventing a second drag idiom in the same app.
 */
function PaletteRows({
  colors,
  onUpdateAsset,
  onDeleteAsset,
  onReorderColors,
}: {
  colors: BrandAsset[]
  onUpdateAsset: (id: BrandAssetId, patch: UpdateBrandAssetInput) => void
  onDeleteAsset: (id: BrandAssetId) => void
  onReorderColors?: (ids: BrandAssetId[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorderColors) return
    const from = colors.findIndex((c) => c.id === active.id)
    const to = colors.findIndex((c) => c.id === over.id)
    if (from === -1 || to === -1) return
    onReorderColors(arrayMove(colors, from, to).map((c) => c.id))
  }

  if (colors.length === 0) return null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={colors.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="mt-4 flex flex-col border-t pt-2">
          {colors.map((c) => (
            <ColorRow
              key={c.id}
              color={c}
              onUpdateAsset={onUpdateAsset}
              onDeleteAsset={onDeleteAsset}
              sortable={!!onReorderColors}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function ColorRow({
  color,
  onUpdateAsset,
  onDeleteAsset,
  sortable,
}: {
  color: BrandAsset
  onUpdateAsset: (id: BrandAssetId, patch: UpdateBrandAssetInput) => void
  onDeleteAsset: (id: BrandAssetId) => void
  sortable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: color.id,
  })
  const [label, setLabel] = useState(color.label)
  const [copied, setCopied] = useState(false)
  const value = color.source === 'inline' ? color.value : ''

  // Committed on blur / Enter rather than per keystroke: a PATCH per character
  // is a write amplification the row does not need, and the field is the source
  // of truth until it loses focus.
  function commitLabel() {
    const next = label.trim()
    if (!next || next === color.label) {
      setLabel(color.label)
      return
    }
    onUpdateAsset(color.id, { label: next })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard is permission-gated and can simply refuse. The value is on
      // screen either way, so a failed copy is not worth an error state.
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-lg px-1 py-1.5',
        isDragging && 'bg-accent opacity-80',
      )}
    >
      {sortable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${color.label}`}
          className="cursor-grab rounded-sm text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      )}
      <span
        aria-hidden="true"
        style={{ background: value }}
        className={cn(
          'size-5 shrink-0 rounded-md border',
          color.status === 'proposed' && 'border-dashed',
        )}
      />
      <Input
        value={label}
        aria-label={`Label for ${color.label}`}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="h-8 min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${value}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-sm font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        {value}
        {copied ? (
          <Check className="size-3" aria-hidden="true" />
        ) : (
          <Copy className="size-3" aria-hidden="true" />
        )}
      </button>
      {/* `status` is the whole reason the column exists — a brand mid-decision
          has floated colours — so toggling it is one click, not a menu. */}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-xs"
        aria-pressed={color.status === 'proposed'}
        onClick={() =>
          onUpdateAsset(color.id, {
            status: color.status === 'proposed' ? 'active' : 'proposed',
          })
        }
      >
        {color.status === 'proposed' ? 'Proposed' : 'Settled'}
      </Button>
      <DeleteButton asset={color} onDeleteAsset={onDeleteAsset} />
    </li>
  )
}

function AddColorRow({
  onAddColor,
  hasColors,
}: {
  onAddColor: (input: { label: string; value: string }) => void
  hasColors: boolean
}) {
  const [value, setValue] = useState('#b5573c')
  const [label, setLabel] = useState('')

  function add() {
    const trimmed = label.trim()
    if (!trimmed) return
    onAddColor({ label: trimmed, value })
    setLabel('')
  }

  return (
    <div className={cn('flex items-center gap-2', hasColors ? 'mt-3 border-t pt-3' : 'mt-0')}>
      {/* A native colour input: the platform picker is better than anything
          worth building here, and it guarantees a valid value. */}
      <input
        type="color"
        value={value}
        aria-label="New colour value"
        onChange={(e) => setValue(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-md border bg-card"
      />
      <Input
        value={label}
        placeholder="Name this colour"
        aria-label="New colour name"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
        }}
        className="h-8 min-w-0 flex-1"
      />
      <Button variant="outline" size="sm" disabled={!label.trim()} onClick={add}>
        Add colour
      </Button>
    </div>
  )
}

function DeleteButton({
  asset,
  onDeleteAsset,
}: {
  asset: BrandAsset
  onDeleteAsset: (id: BrandAssetId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onDeleteAsset(asset.id)}
      aria-label={`Delete ${asset.label}`}
      className="shrink-0 rounded-sm text-muted-foreground transition-colors duration-150 hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  )
}

// ---------------------------------------------------------------------------

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}

function AssetGrid({
  assets,
  resolveBlob,
  onDeleteAsset,
  onUpdateAsset,
}: {
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
  onDeleteAsset?: (id: BrandAssetId) => void
  onUpdateAsset?: (id: BrandAssetId, patch: UpdateBrandAssetInput) => void
}) {
  return (
    <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {assets.map((a) => (
        <li key={a.id} className="overflow-hidden rounded-xl border bg-card shadow-elevation-1">
          {/* Keyed on the id for the same reason `BrandMark` keys on its src:
              did-it-load is state about one URL, and it resets by remounting
              rather than by an effect that chases the prop. */}
          <AssetThumb key={a.id} asset={a} resolveBlob={resolveBlob} />
          <div className="flex items-start gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  a.width && a.height ? `${a.width}×${a.height}` : null,
                  formatBytes(a.sizeBytes),
                  a.status === 'proposed' ? 'Proposed' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || a.mime}
              </p>
            </div>
            <SourcePill asset={a} />
          </div>
          {(onUpdateAsset || onDeleteAsset) && (
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              {onUpdateAsset ? (
                // One brand, one mark: promoting an image to `logo` is the
                // action this page exists to make possible, and it is where
                // `BrandMark` gets its declared fill from.
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  aria-pressed={a.role === 'logo'}
                  onClick={() => onUpdateAsset(a.id, { role: a.role === 'logo' ? null : 'logo' })}
                >
                  {a.role === 'logo' ? 'Brand mark' : 'Use as mark'}
                </Button>
              ) : (
                <span />
              )}
              {onDeleteAsset && <DeleteButton asset={a} onDeleteAsset={onDeleteAsset} />}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * The thumbnail, with the same fallback `BrandMark` uses and for the same
 * reason: a link that does not render is the expected outcome of the link path,
 * not its edge case, and the library has to say so without breaking its grid.
 */
function AssetThumb({
  asset,
  resolveBlob,
}: {
  asset: BrandAsset
  resolveBlob: (key: string) => string
}) {
  const url = assetUrl(asset, resolveBlob)
  const [failed, setFailed] = useState(false)
  const box = 'flex aspect-[4/3] w-full items-center justify-center bg-surface-sunken'
  if (!url || failed) {
    return (
      <div className={box}>
        <span className="px-3 text-center text-xs text-muted-foreground">
          {failed ? 'Did not render' : 'No preview'}
        </span>
      </div>
    )
  }
  return (
    <div className={box}>
      <img
        src={url}
        alt={asset.alt ?? asset.label}
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </div>
  )
}

/**
 * `Uploaded` vs `Linked`, sentence case on the neutral beige pill §12.4
 * specifies. The one uppercase the CI allows is a side-nav section eyebrow and
 * this app has no side nav, so nothing here is ever caps.
 */
function SourcePill({ asset }: { asset: BrandAsset }) {
  if (asset.source === 'inline') return null
  const linked = asset.source === 'link'
  const Icon = linked ? Link2 : Upload
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-muted-foreground',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {linked ? 'Linked' : 'Uploaded'}
    </span>
  )
}

/** `6815744` → `6.5 MB`. Returns `null` for an unknown size — finding 1. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
