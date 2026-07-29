import { useState } from 'react'
import { FileText, Link2, Upload } from 'lucide-react'
import type { BrandWithSections } from '@brandfactory/shared'
import { ColorSwatches, paletteSummary } from '@/components/brand/ColorSwatches'
import { type BrandAsset, assetUrl, assetsOfKind } from '@/demo/assetTypes'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// AssetLibraryView — what the `Visual identity` tile would open
// ---------------------------------------------------------------------------
//
// Assets question 2 asks where a brand's assets render. A photo grid is not
// rail-shaped, and `Visual identity` has shipped as a dead `Soon` tile since
// 1.4.0 — two proposals, written days apart, independently named it as the
// thing they would turn on and each deferred it to the other. This is that page,
// on fixtures, so the question can be answered by looking.
//
// It is also structure C's whole argument: if colours live here rather than in
// the rail, a brand's palette becomes somewhere you navigate to. Cleanest and
// least discoverable, and both halves of that are visible on this screen.
//
// **A `link` must be visibly distinguishable from a `blob`.** The assets rule is
// that a link is first-class for reference while a blob is expected for anything
// rendered as the brand's identity — encouraged in the UI, not enforced in the
// schema. A rule the UI cannot show is a rule nobody can follow, so every card
// carries its source as a pill rather than leaving it to a tooltip.
//
// Like `BrandHubView`, this outlives the mockup: whichever way question 2
// resolves, the surface that renders a brand's assets is wanted — only its route
// and its data source are in doubt.

export interface AssetLibraryViewProps {
  brand: BrandWithSections
  assets: BrandAsset[]
  /** Stands in for the signed-read-URL flow. See `resolveDemoBlob`. */
  resolveBlob: (key: string) => string
  /** Where "back to the hub" goes. A plain href — see `MiniAppTile`'s. */
  backHref?: string
}

export function AssetLibraryView({ brand, assets, resolveBlob, backHref }: AssetLibraryViewProps) {
  const colors = assetsOfKind(assets, 'color')
  const images = assetsOfKind(assets, 'image')
  const logos = images.filter((a) => a.role === 'logo' || a.role === 'mark')
  const photos = images.filter((a) => a.role !== 'logo' && a.role !== 'mark')
  const files = assetsOfKind(assets, 'file')
  const empty = assets.length === 0

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

        {/* Inert on purpose. The blob transport already works and is not what
            needs reviewing; wiring a real picker here would test the one part
            of this that is already built. */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            console.log('[demo] drop is inert in the mockup', e.dataTransfer.files.length, 'files')
          }}
          className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
          Drop images or files here, or paste a URL to something hosted elsewhere.
        </div>

        {empty && (
          <p className="mt-8 text-sm text-muted-foreground">
            Nothing here yet. This brand has no assets recorded.
          </p>
        )}

        {colors.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Palette" detail={paletteSummary(colors)} />
            <div className="mt-3 rounded-xl border bg-card p-4 shadow-elevation-1">
              <ColorSwatches colors={colors} />
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
            </div>
          </section>
        )}

        {logos.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Marks" detail={`${logos.length}`} />
            <AssetGrid assets={logos} resolveBlob={resolveBlob} />
          </section>
        )}

        {photos.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Photography" detail={`${photos.length}`} />
            <AssetGrid assets={photos} resolveBlob={resolveBlob} />
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
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

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
}: {
  assets: BrandAsset[]
  resolveBlob: (key: string) => string
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
        alt={asset.label}
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
