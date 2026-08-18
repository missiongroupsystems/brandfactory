import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { brandDescriptionLine, type BrandSummary } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useDeleteBrand, useUpdateBrand } from '@/api/queries/brands'
import { BrandMark } from '@/components/brand/BrandMark'
import { GuidelineMeter } from '@/components/brand/GuidelineMeter'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { EntityMenu } from '@/components/entity/EntityMenu'
import { RenameDialog } from '@/components/entity/RenameDialog'
import { LocalOnlyBadge } from '@/components/passport/LocalOnlyBadge'
import { displayHost } from '@/lib/website-url'

export function BrandCard({ brand }: { brand: BrandSummary }) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const update = useUpdateBrand(brand.id, brand.workspaceId)
  const del = useDeleteBrand(brand.id, brand.workspaceId)

  // Same precedence as the hub header, from the same function — the grid and
  // the page it links to must not disagree about what a brand says it is.
  // `brand.tldr` arrives pre-flattened from the list query; see `BrandSummary`.
  const line = brandDescriptionLine({ tldr: brand.tldr, description: brand.description })

  return (
    <>
      <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-elevation-1 transition-colors duration-150 hover:bg-accent">
        <div className="absolute top-3 right-3 z-10">
          <EntityMenu
            label={`Actions for ${brand.name}`}
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        </div>
        {/* Link, not button + navigate() — see ProjectCard. */}
        <Link
          to="/brands/$brandId"
          params={{ brandId: brand.id }}
          className="flex flex-1 flex-col gap-3 pr-8 text-left before:absolute before:inset-0 before:content-['']"
        >
          <div className="min-w-0">
            {/* The same monogram the rail draws, from the same `brandHue(id)` —
                which is the point: the grid is where a name and a coloured
                square are learned as one thing, and the rail is where that
                square then works as a one-click destination on every other
                page. `aria-hidden` by construction, so it adds no noise to the
                card's accessible name. */}
            <BrandMark name={brand.name} seed={brand.id} size="sm" className="mb-3" />
            <div className="flex items-center gap-2">
              <div className="min-w-0 truncate font-medium group-hover:text-accent-foreground">
                {brand.name}
              </div>
              {/* The workspace grid is where somebody first meets the whole set, so it is
                  where a brand that reaches no other Mission Systems app should say so. */}
              <LocalOnlyBadge linked={brand.linkedToPassport} />
            </div>
            {line && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{line}</div>}
            {brand.websiteUrl && (
              // Text, not an anchor. The whole card is already a link to the
              // brand (the `before:` overlay above), so a nested `<a>` would be
              // invalid HTML *and* sit under that overlay — unclickable, and
              // announced as a link that does nothing. The hub is where the
              // website becomes a real link; here it is an identifying fact.
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {displayHost(brand.websiteUrl)}
              </div>
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-3">
            <GuidelineMeter sectionCount={brand.sectionCount} />
            <span className="text-xs text-muted-foreground">
              {brand.projectCount === 1 ? '1 project' : `${brand.projectCount} projects`}
            </span>
          </div>
        </Link>
      </div>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        resource="brand"
        initialName={brand.name}
        initialDescription={brand.description}
        initialWebsiteUrl={brand.websiteUrl}
        pending={update.isPending}
        onSubmit={(values) => {
          update.mutate(
            {
              name: values.name,
              description: values.description ?? null,
              websiteUrl: values.websiteUrl ?? null,
            },
            {
              onSuccess: () => {
                setRenameOpen(false)
                toast.success('Brand updated')
              },
              onError: (err) =>
                toast.error(err instanceof AppError ? err.message : 'Failed to update brand'),
            },
          )
        }}
      />

      <DeleteBrandDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        brandName={brand.name}
        projectCount={brand.projectCount}
        pending={del.isPending}
        onConfirm={() => {
          del.mutate(undefined, {
            onSuccess: () => {
              setDeleteOpen(false)
              toast.success('Brand deleted')
            },
            onError: (err) =>
              toast.error(err instanceof AppError ? err.message : 'Failed to delete brand'),
          })
        }}
      />
    </>
  )
}
