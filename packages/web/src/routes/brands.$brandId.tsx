import { useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
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
// **This route passes nothing for any prop the mockup pass added.** See the
// invariant on `BrandHubView` — that absence is the thing keeping the shipped
// hub identical to 1.7.0, and it is an acceptance criterion, not an accident.

function BrandHubPage() {
  const { brandId } = brandEditorRoute.useParams()
  const navigate = useNavigate()
  const { data: brand, isPending, isError } = useBrand(brandId)
  const {
    data: projects,
    isPending: projectsPending,
    isError: projectsError,
  } = useBrandProjects(brandId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const update = useUpdateBrand(brandId, brand?.workspaceId ?? '')
  const del = useDeleteBrand(brandId, brand?.workspaceId ?? '')

  // No trail: the brand hub *is* the brand, and the header's brand switcher
  // already names it. Leaving the call in with an empty trail would read as a
  // segment we forgot to fill in.
  const countsKnown = !projectsPending && !projectsError && projects !== undefined

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
        pending={update.isPending}
        onSubmit={(values) => {
          update.mutate(
            {
              name: values.name,
              description: values.description ?? null,
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
