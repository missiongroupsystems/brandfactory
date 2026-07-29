import { ExternalLink } from 'lucide-react'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandMark } from '@/components/brand/BrandMark'
import { ColorSwatches, paletteSummary } from '@/components/brand/ColorSwatches'
import { EntityMenu } from '@/components/entity/EntityMenu'
import type { BrandAsset } from '@/demo/assetTypes'

// ---------------------------------------------------------------------------
// BrandIdentity — who this brand is, at a glance
// ---------------------------------------------------------------------------

export interface BrandIdentityProps {
  brand: BrandWithSections
  onRename: () => void
  onDelete: () => void
  /**
   * `brands.website_url`, which does not exist yet — research decision 3 adds
   * the column, and this pass renders it from a fixture so the placement can be
   * reviewed before the migration is written. Absent on the real route.
   */
  websiteUrl?: string | null
  /** A declared mark. See `BrandMark`'s `src`. */
  logoSrc?: string | null
  /**
   * **Structure B only.** The palette under the mark, leaving the rail's
   * one-list rule untouched. `BrandHubView` passes this for variant `B` and
   * nothing for `A` and `C`, so the arrangement lives in one place rather than
   * being re-derived here.
   */
  colors?: BrandAsset[]
}

/**
 * The hub's first band: mark, name, one-line summary, ⋯ menu.
 *
 * Deliberately carries **no counts** — no "2 of 5 sections", no thread total.
 * Every one of those numbers has a home on this page already (the rail is
 * *about* sections; each tile carries its own thread count), and a stats strip
 * here would restate them a scroll earlier without giving you anywhere to act
 * on them. The band answers one question — *whose page is this* — and the two
 * zones below answer the other two.
 *
 * The description is the brand's TL;DR, so an empty one is offered as an action
 * rather than rendered as absence: `Rename` is the dialog that owns the field
 * (`RenameDialog` takes `initialDescription`), which is why the affordance
 * routes to `onRename` rather than growing an editor of its own.
 *
 * **On the palette (structure B).** 1.7.0's no-counts rule is about facts that
 * already appear elsewhere on the page; a palette appears nowhere else, so it
 * is a *new* fact rather than a restated one and the rule does not exclude it.
 * That makes B arguable rather than obviously wrong — which is why it is one of
 * three variants on screen and not a decision taken in this file.
 */
export function BrandIdentity({
  brand,
  onRename,
  onDelete,
  websiteUrl,
  logoSrc,
  colors,
}: BrandIdentityProps) {
  const hasPalette = colors !== undefined && colors.length > 0

  return (
    <header className="flex items-start gap-4">
      <BrandMark name={brand.name} seed={brand.id} size="lg" src={logoSrc} />

      {/* `min-w-0` so a long unbroken brand name truncates instead of pushing
          the ⋯ menu off the container. */}
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="truncate">{brand.name}</h1>
        {brand.description ? (
          <p className="mt-1.5 max-w-prose text-sm text-pretty text-muted-foreground">
            {brand.description}
          </p>
        ) : (
          <button
            type="button"
            onClick={onRename}
            className="mt-1.5 rounded-sm text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground"
          >
            Add a description
          </button>
        )}

        {websiteUrl && (
          // The host, not the URL: `https://casavostra.com/` is three tokens of
          // chrome around the one word that identifies the brand. §3.1 — a
          // standalone link reads `--color-text-link`, not `--primary`.
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-link)] hover:underline"
          >
            {displayHost(websiteUrl)}
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
        )}

        {hasPalette && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ColorSwatches colors={colors} size="sm" />
            <span className="text-xs text-muted-foreground">{paletteSummary(colors)}</span>
          </div>
        )}
      </div>

      <EntityMenu label={`Actions for ${brand.name}`} onRename={onRename} onDelete={onDelete} />
    </header>
  )
}

/**
 * `https://www.casavostra.com/menu` → `casavostra.com/menu`. Falls back to the
 * raw string when the URL does not parse — a link the user typed by hand is
 * still worth rendering, and swallowing it would be a worse failure than an
 * ugly one.
 */
export function displayHost(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.host.replace(/^www\./, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
    return `${host}${path}`
  } catch {
    return url
  }
}
