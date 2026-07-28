import { useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
import { useBrand, useBrandProjects, useDeleteBrand, useUpdateBrand } from '@/api/queries/brands'
import { BrandContextRail } from '@/components/brand/BrandContextRail'
import { BrandIdentity } from '@/components/brand/BrandIdentity'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { TILE_APPS, isOrphanThread } from '@/components/brand/miniApps'
import { MiniAppTile } from '@/components/brand/MiniAppTile'
import { DeleteBrandDialog } from '@/components/entity/DeleteBrandDialog'
import { RenameDialog } from '@/components/entity/RenameDialog'
import { ProjectCard } from '@/components/project/ProjectCard'

// ---------------------------------------------------------------------------
// Brand hub — three zones, answering three questions in reading order
// ---------------------------------------------------------------------------
//
//   who is this?      identity band     — mark, name, TL;DR
//   what can I do?    main column       — the app tiles
//   what do we know?  right rail        — brand context, always on screen
//
// The two lower zones are columns rather than bands because the rail's job is
// to be *available while you choose*, not to be read and scrolled past. Below
// `lg` they stack, and the apps come first: on a narrow screen the reason you
// opened this page is the thing you should reach without scrolling.
//
// This is the first route in the app to constrain its width. Every other
// surface is `flex-1 overflow-auto p-6`, which at 2000px leaves a title at one
// edge and its ⋯ menu at the other with nothing between them. The container
// lives here rather than in the shell because widening the *other* routes is a
// change to pages this pass has no business touching.

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
  // Threads whose templateId matches no registered mini-app would otherwise be
  // reachable from nowhere; surface them under a catch-all below the tiles.
  // `isOrphanThread` consults the full registry, so a hidden-surface thread
  // (brand context) is classified and therefore never lands here.
  const orphanThreads = countsKnown ? projects.filter(isOrphanThread) : []

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl p-6 lg:p-8">
        {!brand && (
          <header className="flex items-start gap-4">
            <h1 className="text-2xl font-semibold">{isPending ? '…' : 'Brand'}</h1>
            {isError && <p className="mt-2 text-sm text-destructive">Failed to load brand.</p>}
          </header>
        )}

        {brand && (
          <>
            <BrandIdentity
              brand={brand}
              onRename={() => setRenameOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
            <EditGuidelinesDialog brand={brand} open={editOpen} onOpenChange={setEditOpen} />

            <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
              <main className="min-w-0 flex-1">
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Apps</h2>

                {projectsError && (
                  <p className="mb-3 text-sm text-destructive">
                    Failed to load threads. Thread counts are unavailable.
                  </p>
                )}

                {/* A fixed 2-up, not `auto-fill`: four tiles into a column this
                    wide fits three across and drops the fourth onto a row of
                    its own beside a tile-and-a-half of dead space. A 2×2 block
                    also squares up against the rail instead of out-running it. */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                      Other threads
                    </h3>
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
              </main>

              <BrandContextRail
                brand={brand}
                onEdit={() => setEditOpen(true)}
                className="lg:w-80 lg:shrink-0"
              />
            </div>

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
