import { useState } from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// BrandMark — the brand's monogram
// ---------------------------------------------------------------------------
//
// A brand row is six columns (`packages/db/src/schema/brands.ts`): there is no
// logo and no colour to render, so the mark is *derived* — initials from the
// name, hue from the id. That is deliberate rather than a placeholder holding
// the spot until uploads land: every brand that already exists gets a mark on
// the next page load, with no migration and no upload path.
//
// When real brand assets land, this component keeps its call sites and its
// geometry; only the source of the fill changes from derived to declared.
//
// On the accent budget (§4): the CI keeps colour scarce so the one brand green
// stays meaningful. The hue here is not the *product's* accent — it is the
// *customer's brand*, which is the one thing on this page that is allowed to
// look like itself. It appears on exactly one element per surface.

/**
 * Initials for the monogram. Two letters for a multi-word name, one for a
 * single word — "BR" for "BrandFactory" reads as an abbreviation of nothing,
 * where "B" reads as a mark.
 *
 * Split by code point, not by index: `"🌱 Sprout"[0]` is half a surrogate pair
 * and renders as a replacement character.
 */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const [firstWord = '', secondWord = ''] = words
  const first = [...firstWord][0] ?? ''
  if (words.length === 1) return first.toUpperCase()
  const second = [...secondWord][0] ?? ''
  return (first + second).toUpperCase()
}

/**
 * A stable hue in [0, 360) from the brand id. The id is used rather than the
 * name so a rename does not recolour a brand the user has learned to recognise
 * by its mark.
 *
 * FNV-1a-ish: a plain `charCodeAt` sum collides constantly on names sharing
 * letters, which on a workspace of sibling brands is exactly the case that
 * matters.
 */
export function brandHue(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 360
}

const SIZES = {
  sm: 'size-8 rounded-md text-xs',
  md: 'size-10 rounded-lg text-sm',
  lg: 'size-14 rounded-xl text-lg',
} as const

export interface BrandMarkProps {
  name: string
  /** Hue source. The brand id — see `brandHue`. */
  seed: string
  size?: keyof typeof SIZES
  className?: string
  /**
   * A **declared** mark — the resolved URL of a `role: 'logo'` asset, signed
   * for a `blob` source or passed straight through for a `link` one.
   *
   * Absent on every real call site today, and the component's own note above
   * promised exactly this change: the geometry and the call sites stay, only
   * the source of the fill moves from derived to declared.
   *
   * **A `src` that fails to load falls back to the monogram**, which is not a
   * courtesy — a share URL from Drive or Dropbox serves an HTML viewer page
   * rather than image bytes, so "clickable but not renderable" is the *expected*
   * outcome of the link path, not its edge case.
   */
  src?: string | null
}

export function BrandMark({ name, seed, size = 'md', className, src }: BrandMarkProps) {
  const initials = brandInitials(name)

  // `aria-hidden`, always: the mark is a restatement of the brand name, which
  // is rendered as text beside it on every surface that uses this. Announcing
  // "MG" before "Mission Group" is noise.
  return (
    <div
      aria-hidden="true"
      style={{ '--brand-hue': brandHue(seed) } as React.CSSProperties}
      className={cn(
        'brand-mark flex shrink-0 items-center justify-center overflow-hidden font-semibold tracking-tight select-none',
        SIZES[size],
        className,
      )}
    >
      {/* Keyed on the src so a *new* declared mark gets a fresh attempt: the
          did-it-load state belongs to one URL, and without the key one dead
          link would poison the slot for every brand rendered through this
          element afterwards. A key rather than a reset effect — the state is
          derived from the src, so remounting is the honest expression of it. */}
      {src ? <MarkImage key={src} src={src} fallback={initials} /> : initials}
    </div>
  )
}

/**
 * The declared mark, with the monogram behind it. Inside the same box at
 * `size-full`, so the tinted fill stays as the loading placeholder and the
 * geometry cannot shift between a declared mark and a derived one — which is
 * the thing the `logo-blob` fixture exists to screenshot.
 */
function MarkImage({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="size-full rounded-[inherit] object-cover"
    />
  )
}
