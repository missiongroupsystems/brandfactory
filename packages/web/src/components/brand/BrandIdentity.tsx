import { ExternalLink } from 'lucide-react'
import { brandDescriptionLine, brandTldrLine, type BrandWithSections } from '@brandfactory/shared'
import { BrandMark } from '@/components/brand/BrandMark'
import { EntityMenu } from '@/components/entity/EntityMenu'
import { displayHost } from '@/lib/website-url'

// ---------------------------------------------------------------------------
// BrandIdentity — who this brand is, at a glance
// ---------------------------------------------------------------------------

export interface BrandIdentityProps {
  brand: BrandWithSections
  onRename: () => void
  onDelete: () => void
  /**
   * `brands.website_url`. Landed by migration 0003 (Stage 1A) after the mockup
   * pass reviewed the placement against a fixture. Renders nothing when null.
   */
  websiteUrl?: string | null
  /** A declared mark. See `BrandMark`'s `src`. */
  logoSrc?: string | null
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
 * **The description line *is* the brand's `TL;DR` when it has written one.**
 * This comment used to say that as an analogy while the code kept the two
 * apart, which is how a brand whose TL;DR was already filled in — by hand, or
 * by a research run — still got a header asking it to *Add a description*.
 * `brandDescriptionLine` now resolves the pair: the TL;DR wins, the typed
 * `brands.description` is the fallback, and the affordance appears only when
 * there is genuinely neither. See `shared/brand/description-line.ts` for why
 * that order and not the other.
 *
 * The affordance still routes to `onRename`, because `RenameDialog` is what
 * owns `description` — the field it writes is the one still reachable in the
 * no-TL;DR case. Writing the TL;DR instead is the rail's job, one card down.
 *
 * **The palette is not here, and that was a decision rather than an omission.**
 * 1.8.0 built it three ways so two could be deleted: under this mark (B), in the
 * rail (A), or only on the Visual identity page (C). The screenshots settled it
 * for A — B has no good answer at the top of the cardinality range, where a
 * twelve-colour ramp under a 40px mark either wraps into the description or
 * shrinks below legibility, and C makes a brand's colours somewhere you navigate
 * to, which is the opposite of the request that produced the proposal. The band
 * stays at one fact: *whose page is this*.
 */
export function BrandIdentity({
  brand,
  onRename,
  onDelete,
  websiteUrl,
  logoSrc,
}: BrandIdentityProps) {
  const line = brandDescriptionLine({
    tldr: brandTldrLine(brand.sections),
    description: brand.description,
  })

  return (
    <header className="flex items-start gap-4">
      <BrandMark name={brand.name} seed={brand.id} size="lg" src={logoSrc} />

      {/* `min-w-0` so a long unbroken brand name truncates instead of pushing
          the ⋯ menu off the container. */}
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="truncate">{brand.name}</h1>
        {line ? (
          // `line-clamp-3`, which the hand-typed description never needed and
          // the TL;DR does: `TLDR_TARGET_MAX_CHARS` lets a generated one reach
          // 400 characters and a hand-written one has no ceiling at all, so at
          // `max-w-prose` this paragraph can run six lines and turn a band that
          // answers *whose page is this* into the tallest thing above the fold.
          // Clamping is safe **here specifically** because the full text is not
          // hidden — it is the rail's own `TL;DR` row, one card down on the same
          // page. It would not be safe on a surface that had nowhere to send you.
          <p className="mt-1.5 line-clamp-3 max-w-prose text-sm text-pretty text-muted-foreground">
            {line}
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
          // The wrapper is load-bearing, and the live pass is what found it: an
          // `inline-flex` anchor after the `Add a description` *button* — also
          // inline-level — shares its line, and the two render as
          // `Add a descriptioncasavostra.com` with no space between them. The
          // description case hid it, because a `<p>` is a block and pushes the
          // link down on its own. Wrapping the anchor makes the row a block in
          // both cases while leaving the anchor inline-flex, which is what keeps
          // the ↗ glyph on the text baseline.
          <div className="mt-1.5">
            {/* The host, not the URL: `https://casavostra.com/` is three tokens
                of chrome around the one word that identifies the brand. §3.1 —
                a standalone link reads `--color-text-link`, not `--primary`. */}
            <a
              href={websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-link)] hover:underline"
            >
              {displayHost(websiteUrl)}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>

      <EntityMenu label={`Actions for ${brand.name}`} onRename={onRename} onDelete={onDelete} />
    </header>
  )
}
