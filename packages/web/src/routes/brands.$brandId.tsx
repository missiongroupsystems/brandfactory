import { useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
import { useBrand, useBrandProjects, useDeleteBrand, useUpdateBrand } from '@/api/queries/brands'
import { useBreadcrumbTrail } from '@/components/Breadcrumbs'
import { BrandContextBar } from '@/components/brand/BrandContextBar'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { TILE_APPS, isOrphanThread } from '@/components/brand/miniApps'
import { MiniAppTile } from '@/components/brand/MiniAppTile'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { EntityMenu } from '@/components/entity/EntityMenu'
import { RenameDialog } from '@/components/entity/RenameDialog'
import { ProjectCard } from '@/components/project/ProjectCard'

// ---------------------------------------------------------------------------
// Brand hub — identity + ambient brand context + mini-app grid
// ---------------------------------------------------------------------------

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

  useBreadcrumbTrail(brand ? { brand: { id: brand.id, name: brand.name } } : {})

  const countsKnown = !projectsPending && !projectsError && projects !== undefined
  // Threads whose templateId matches no registered mini-app would otherwise be
  // reachable from nowhere; surface them under a catch-all below the tiles.
  // `isOrphanThread` consults the full registry, so a hidden-surface thread
  // (brand context) is classified and therefore never lands here.
  const orphanThreads = countsKnown ? projects.filter(isOrphanThread) : []

  return (
    <div className="flex-1 overflow-auto p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{brand?.name ?? (isPending ? '…' : 'Brand')}</h1>
          {brand?.description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{brand.description}</p>
          ) : null}
          {isError && <p className="mt-2 text-sm text-destructive">Failed to load brand.</p>}
        </div>
        {brand && (
          <EntityMenu
            label={`Actions for ${brand.name}`}
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        )}
      </header>

      {brand && (
        <>
          <BrandContextBar brand={brand} onEdit={() => setEditOpen(true)} />
          <EditGuidelinesDialog brand={brand} open={editOpen} onOpenChange={setEditOpen} />

          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Workspace</h2>

            {projectsError && (
              <p className="mb-3 text-sm text-destructive">
                Failed to load threads. Thread counts are unavailable.
              </p>
            )}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {TILE_APPS.map((app) => (
                <MiniAppTile
                  key={app.id}
                  app={app}
                  brandId={brand.id}
                  threadCount={countsKnown ? projects.filter(app.match).length : null}
                />
              ))}
            </div>

            {orphanThreads.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">Other threads</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {orphanThreads.map((p) => (
                    <ProjectCard
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      kind={p.kind}
                      brandId={brand.id}
                      workspaceId={brand.workspaceId}
                      lastActivityAt={p.lastActivityAt}
                      showBrandName={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

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
      )}
    </div>
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
