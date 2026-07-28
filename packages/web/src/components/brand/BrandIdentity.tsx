import type { BrandWithSections } from '@brandfactory/shared'
import { BrandMark } from '@/components/brand/BrandMark'
import { EntityMenu } from '@/components/entity/EntityMenu'

// ---------------------------------------------------------------------------
// BrandIdentity — who this brand is, at a glance
// ---------------------------------------------------------------------------

export interface BrandIdentityProps {
  brand: BrandWithSections
  onRename: () => void
  onDelete: () => void
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
 */
export function BrandIdentity({ brand, onRename, onDelete }: BrandIdentityProps) {
  return (
    <header className="flex items-start gap-4">
      <BrandMark name={brand.name} seed={brand.id} size="lg" />

      {/* `min-w-0` so a long unbroken brand name truncates instead of pushing
          the ⋯ menu off the container. */}
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{brand.name}</h1>
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
      </div>

      <EntityMenu label={`Actions for ${brand.name}`} onRename={onRename} onDelete={onDelete} />
    </header>
  )
}
