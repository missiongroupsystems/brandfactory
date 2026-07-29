import { useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { logoAsset } from '@brandfactory/shared'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
import { useAssetUrl, useBrandAssets } from '@/api/queries/assets'
import { useBrand, useBrandProjects, useDeleteBrand, useUpdateBrand } from '@/api/queries/brands'
import { BrandHubView } from '@/components/brand/BrandHubView'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { RenameDialog } from '@/components/entity/RenameDialog'

// The brand hub's data half. Every query, every mutation and all three dialogs
// live here; the three zones live in `BrandHubView`, which this feeds props and
// `routes/demo.brand.tsx` feeds fixtures.
//
// The split is not tidiness — it is what lets the mockup render the *route's*
// component inside the real shell instead of a second throwaway harness, and it
// is what makes the hub testable without mounting a QueryClient. It follows the
// precedent `BrandContextRail` already set one level down: props in, callbacks
// out, no query of its own.
//
// **Stages 1A and 2C feed the mockup's props, one at a time.** `websiteUrl` came
// off the brand row in 1A; `colors` comes off `useBrandAssets` here. So the
// first half of 1.8.0's invariant ("the real route can only pass null") retires
// for those two, on purpose. The half that carries the weight does not — and it
// is now about *runtime* states rather than a construction: a brand with no
// website renders no link, a brand with no colours renders no palette block, and
// both surfaces are byte-identical to 1.7.0.
//
// **2D feeds `logoSrc` too**, resolving a `role: 'logo'` asset through
// `useSignedReadUrl`. `research` is the last prop still unfed — there is no
// research query until Stage 3.

function BrandHubPage() {
  const { brandId } = brandEditorRoute.useParams()
  const navigate = useNavigate()
  const { data: brand, isPending, isError } = useBrand(brandId)
  const {
    data: projects,
    isPending: projectsPending,
    isError: projectsError,
  } = useBrandProjects(brandId)
  const { data: assets, isPending: assetsPending, isError: assetsError } = useBrandAssets(brandId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const update = useUpdateBrand(brandId, brand?.workspaceId ?? '')
  const del = useDeleteBrand(brandId, brand?.workspaceId ?? '')

  // No trail: the brand hub *is* the brand, and the header's brand switcher
  // already names it. Leaving the call in with an empty trail would read as a
  // segment we forgot to fill in.
  const countsKnown = !projectsPending && !projectsError && projects !== undefined

  // `undefined` while pending or failed — *not* `[]`. The rail reads the two
  // states differently on purpose: a palette block that flashes empty on every
  // navigation is worse than one that appears 100ms late, and a brand that
  // genuinely has no colours must render the 1.7.0 hub exactly, with no
  // placeholder saying so.
  //
  // The whole list, not a pre-filtered one: `BrandHubView` derives the palette
  // and `Visual identity`'s asset count from it, and two props would make "the
  // palette knows but the tile does not" representable.
  const assetsKnown = !assetsPending && !assetsError && assets !== undefined

  // The declared mark (2D). `logoAsset` applies the rules — `kind: 'image'`,
  // `role: 'logo'`, **active only**, first by position — so a proposed logo
  // resolves to `null` here and the band renders the monogram, which is what
  // "proposed reaches neither the agent nor the mark" means in practice.
  //
  // `useAssetUrl` is called unconditionally with `null` while the query is
  // pending, and returns `null` until a `blob`'s signed URL arrives. Every one
  // of those paths lands on the same monogram — no logo, a proposed logo, a
  // pending read URL and a broken image are **visually one state**, and that is
  // the property `BrandMark`'s `onError` fallback was built for.
  const logoSrc = useAssetUrl(assetsKnown ? logoAsset(assets) : null)

  if (!brand) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6 lg:p-8">
          <header className="flex items-start gap-4">
            <h1>{isPending ? '…' : 'Brand'}</h1>
            {isError && <p className="mt-2 text-sm text-destructive">Failed to load brand.</p>}
          </header>
        </div>
      </div>
    )
  }

  return (
    <>
      <BrandHubView
        brand={brand}
        projects={countsKnown ? projects : undefined}
        projectsError={projectsError}
        websiteUrl={brand.websiteUrl}
        assets={assetsKnown ? assets : undefined}
        logoSrc={logoSrc}
        onRename={() => setRenameOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onEdit={() => setEditOpen(true)}
      />

      <EditGuidelinesDialog brand={brand} open={editOpen} onOpenChange={setEditOpen} />

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
        // null = not loaded yet / failed. The dialog must not claim "0
        // projects" while the cascade is about to take an unknown number.
        projectCount={projectsPending || projectsError ? null : (projects?.length ?? null)}
        pending={del.isPending}
        onConfirm={() => {
          del.mutate(undefined, {
            onSuccess: () => {
              setDeleteOpen(false)
              toast.success('Brand deleted')
              void navigate({
                to: '/workspaces/$wsId',
                params: { wsId: brand.workspaceId },
              })
            },
            onError: (err) =>
              toast.error(err instanceof AppError ? err.message : 'Failed to delete brand'),
          })
        }}
      />
    </>
  )
}

export const brandEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: BrandHubPage,
})
