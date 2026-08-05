import { Link } from '@tanstack/react-router'
import { Type } from 'lucide-react'
import {
  activeAssets,
  assetsOfKind,
  assetsOfLibrary,
  logoAsset,
  type BrandAsset,
  type BrandWithSections,
} from '@brandfactory/shared'
import { BrandMark } from '@/components/brand/BrandMark'
import { ColorSwatches, paletteSummary } from '@/components/brand/ColorSwatches'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// VisualIdentityCard — what the brand looks like, beside what it says
// ---------------------------------------------------------------------------
//
// The second card in the hub's right column, and the point of the whole pass.
// `BrandContextRail` answers *what do we know about this brand?* in prose; this
// answers the same question in a different medium — and these are the artefacts
// a brand **settles** rather than accumulates, which is why they belong beside
// the brand's other facts rather than behind a tile you click.
//
// **The palette moved here, and that is the exercise.** It lived in the Brand
// context card since 1.8.0 because there was nowhere else on the hub for it,
// under its own hairline, and that card's own comment conceded the point: *"the
// section list above is the meter … a swatch row inside it would be neither."*
// It has always been a guest. Here it is a tenant, and the rail goes back to one
// rule with no exception.
//
// Pure, like the rail: props in, no queries. The hub already has `assets`
// mounted for the palette it used to pass.
//
// **Read-only.** Every block here is owned by the identity shelf, which is where
// things are added, labelled, reordered and proposed. Same split the palette
// block already had — *the rail shows the palette; the library owns it* — now
// applied to three blocks instead of one.

export interface VisualIdentityCardProps {
  brand: BrandWithSections
  /**
   * The brand's assets, or `undefined` while unknown.
   *
   * **`undefined` ≠ `[]`, and the card turns on the difference.** A block that
   * flashes empty on every navigation is worse than one that appears 100ms late,
   * and the same rule the palette block already carried applies to all three.
   */
  assets?: BrandAsset[]
  /**
   * The declared mark's resolved URL, when there is one. `string | null` rather
   * than `string | undefined` to match what the hub already holds — the route
   * resolves `null` for a brand with no `role: 'logo'` asset, and re-mapping it
   * at the call site would be one more place the two spellings could disagree.
   */
  logoSrc?: string | null
  className?: string
}

export function VisualIdentityCard({ brand, assets, logoSrc, className }: VisualIdentityCardProps) {
  const identity = assets && assetsOfLibrary(assets, 'identity')
  const colors = identity && assetsOfKind(identity, 'color')
  const mark = assets && logoAsset(assets)
  // `role === 'typeface'` (0011). A font file with no role is a file on the
  // identity shelf and is not claimed here — the role is the declaration, and
  // nothing infers one from a mime type.
  const typefaces = identity && activeAssets(identity).filter((a) => a.role === 'typeface')

  const hasPalette = !!colors && colors.length > 0
  const hasTypefaces = !!typefaces && typefaces.length > 0

  /**
   * **Nothing at all for a brand with no identity yet**, including the two shelf
   * links — they are this card's footer, not a fifth block, and a footer with no
   * card is a floating pair of counts.
   *
   * A brand with an empty identity is a legitimate brand (`docs/vision.md:28`),
   * and a card saying *"no marks, no colours, no typefaces"* is exactly the
   * scolding 1.7.0 spent a pass removing. The nav's `Library` group is on screen
   * regardless, so nothing becomes unreachable.
   */
  if (!mark && !hasPalette && !hasTypefaces) return null

  return (
    <section
      aria-labelledby="visual-identity-card-heading"
      className={cn('rounded-xl border bg-card shadow-elevation-1', className)}
    >
      <h2 id="visual-identity-card-heading" className="px-4 pt-3.5 pb-3 text-sm font-medium">
        Visual identity
      </h2>

      {/* The mark, as the library renders it — or the monogram, which is the
          same fallback `BrandIdentity` and the nav use. A brand that has not
          uploaded one still *has* a mark; it is just generated. */}
      <div className="flex items-center gap-3 border-t px-4 py-3">
        <BrandMark name={brand.name} seed={brand.id} size="sm" src={logoSrc ?? undefined} />
        <span className="min-w-0 truncate text-sm">{mark ? mark.label : 'Monogram'}</span>
      </div>

      {hasPalette && (
        <div className="border-t px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">
              <Link
                to="/brands/$brandId/identity"
                params={{ brandId: brand.id }}
                className="rounded-sm transition-colors duration-150 hover:text-muted-foreground"
              >
                Palette
              </Link>
            </h3>
            <span className="text-xs text-muted-foreground">{paletteSummary(colors)}</span>
          </div>
          <ColorSwatches colors={colors} className="mt-2.5" />
        </div>
      )}

      {hasTypefaces && (
        <div className="border-t px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Typefaces</h3>
            <span className="text-xs text-muted-foreground">
              {typefaces.length === 1 ? '1 typeface' : `${typefaces.length} typefaces`}
            </span>
          </div>
          {/* Labels, not specimens. Rendering the brand's own face would need
              the bytes served with a real font content-type and an injected
              `@font-face` on an origin whose CSP allows it — a separate pass,
              and a stated non-goal of this one. */}
          <ul className="mt-2 flex flex-col gap-1">
            {typefaces.map((face) => (
              <li key={face.id} className="flex items-center gap-2 text-sm">
                <Type className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 truncate">{face.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The hub's way into the other two shelves — quiet links with counts,
          not blocks. The identity shelf is reached from the `Palette` heading
          and from the mark above it; these two have nothing on this card to
          hang off, and a hub with no entrance to them at all would leave the
          nav group as the only route. */}
      <div className="flex flex-col border-t p-1.5">
        <ShelfLink brandId={brand.id} to="photography" label="Photography" assets={assets} />
        <ShelfLink brandId={brand.id} to="collateral" label="Collateral" assets={assets} />
      </div>
    </section>
  )
}

function ShelfLink({
  brandId,
  to,
  label,
  assets,
}: {
  brandId: string
  to: 'photography' | 'collateral'
  label: string
  assets?: BrandAsset[]
}) {
  // `undefined` is "not known", and it renders no number rather than a `0` that
  // would read as "empty" — the same rule `NavItem`'s count carries.
  const count = assets ? assetsOfLibrary(assets, to).length : undefined
  return (
    <Link
      to={to === 'photography' ? '/brands/$brandId/photography' : '/brands/$brandId/collateral'}
      params={{ brandId }}
      className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150 hover:bg-accent"
    >
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </Link>
  )
}
